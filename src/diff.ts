import { methods, type Change, type DiffResult, type JsonSchema, type OpenAPI, type Operation, type SchemaObject } from './types.js'
import { resolveSchema } from './openapi.js'

function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + stable(v)).join(',') + '}'
  return JSON.stringify(value) ?? 'undefined'
}

/** Conservative comparison: unclassified semantic changes require review, never silently pass. */
export function diffContracts(before: OpenAPI, after: OpenAPI): DiffResult {
  const changes: Change[] = []
  const add = (severity: Change['severity'], code: string, path: string, message: string) => changes.push({ severity, code, path, message })
  function compareSchema(old: JsonSchema, next: JsonSchema, path: string, request: boolean, depth = 0): void {
    if (depth > 24) { add('review', 'schema.recursion', path, 'Schema recursion limit reached'); return }
    try { old = resolveSchema(before, old); next = resolveSchema(after, next) }
    catch { add('review', 'schema.reference', path, 'Reference changes need manual review'); return }
    if (typeof old === 'boolean' || typeof next === 'boolean') {
      if (old !== next) add('review', 'schema.boolean', path, 'Boolean schema changed')
      return
    }
    const ownChanges = changes.length
    if (stable(old.type) !== stable(next.type)) add('breaking', 'schema.type', path, 'Schema type changed')
    if (Array.isArray(old.enum) && Array.isArray(next.enum)) {
      const source = request ? old.enum : next.enum
      const target = request ? next.enum : old.enum
      if (source.some(v => !target.some(t => stable(t) === stable(v)))) add('breaking', 'schema.enum', path, request ? 'Accepted request enum narrowed' : 'Possible response enum expanded')
    }
    const oldRequired = (old.required ?? []) as string[], newRequired = (next.required ?? []) as string[]
    if (request ? newRequired.some(k => !oldRequired.includes(k)) : oldRequired.some(k => !newRequired.includes(k))) {
      add('breaking', 'schema.required', path, request ? 'Request now requires additional properties' : 'Response no longer guarantees required properties')
    }
    const a = (old.properties ?? {}) as Record<string, JsonSchema>, b = (next.properties ?? {}) as Record<string, JsonSchema>
    for (const key of Object.keys(a)) {
      if (!(key in b)) add(request ? 'review' : 'breaking', 'schema.property-removed', `${path}/properties/${key}`, 'Property removed')
      else compareSchema(a[key]!, b[key]!, `${path}/properties/${key}`, request, depth + 1)
    }
    for (const key of Object.keys(b)) if (!(key in a)) add('review', 'schema.property-added', `${path}/properties/${key}`, 'New property needs compatibility review')
    if (old.items !== undefined && next.items !== undefined) compareSchema(old.items as JsonSchema, next.items as JsonSchema, `${path}/items`, request, depth + 1)
    // Ignore documentation-only fields. Every other schema delta has a review fallback.
    const omitDocs = (s: SchemaObject) => Object.fromEntries(Object.entries(s).filter(([key]) => !['description', 'title', 'examples', 'example'].includes(key)))
    if (stable(omitDocs(old)) !== stable(omitDocs(next)) && changes.length === ownChanges) add('review', 'schema.changed', path, 'Schema constraints changed; inspect compatibility')
  }
  function compareContent(a: Record<string, { schema?: JsonSchema }> = {}, b: Record<string, { schema?: JsonSchema }> = {}, path: string, request: boolean) {
    for (const type of Object.keys(a)) {
      if (!(type in b)) { add('breaking', 'media.removed', `${path}/${type}`, 'Supported media type removed'); continue }
      if (a[type]!.schema !== undefined && b[type]!.schema !== undefined) compareSchema(a[type]!.schema!, b[type]!.schema!, `${path}/${type}`, request)
      else if (stable(a[type]!.schema) !== stable(b[type]!.schema)) add('review', 'schema.presence', `${path}/${type}`, 'Schema added or removed')
      const encoding = (media: object) => Object.fromEntries(Object.entries(media).filter(([key]) => !['schema', 'example', 'examples'].includes(key)))
      if (stable(encoding(a[type]!)) !== stable(encoding(b[type]!))) add('review', 'media.metadata', `${path}/${type}`, 'Media encoding or metadata changed')
    }
    for (const type of Object.keys(b)) if (!(type in a)) add(request ? 'non-breaking' : 'review', 'media.added', `${path}/${type}`, 'Media type added')
  }
  for (const [path, item] of Object.entries(before.paths)) {
    for (const method of methods) {
      if (!item[method]) continue
      const location = `${method.toUpperCase()} ${path}`
      const a = item[method] as Operation, b = after.paths[path]?.[method] as Operation | undefined
      if (!b) { add('breaking', 'operation.removed', location, 'Operation removed'); continue }
      if (stable(item.parameters) !== stable(after.paths[path]?.parameters) || stable(a.parameters) !== stable(b.parameters)) add('review', 'parameters.changed', location, 'Parameter changes need manual review')
      if (!a.requestBody?.required && b.requestBody?.required) add('breaking', 'request.required', location, 'Request body became required')
      if (a.requestBody && !b.requestBody) add('review', 'request.removed', location, 'Request body declaration removed')
      const bodyExtras = (body: object = {}) => Object.fromEntries(Object.entries(body).filter(([key]) => !['description', 'content', 'required'].includes(key)))
      if (stable(bodyExtras(a.requestBody)) !== stable(bodyExtras(b.requestBody))) add('review', 'request.metadata', location, 'Request body metadata changed')
      const pathExtras = (pathItem: object) => Object.fromEntries(Object.entries(pathItem).filter(([key]) => ![...methods, 'parameters', 'summary', 'description'].includes(key as typeof methods[number])))
      if (stable(pathExtras(item)) !== stable(pathExtras(after.paths[path]!))) add('review', 'path.metadata', location, 'Path servers or metadata changed')
      compareContent(a.requestBody?.content, b.requestBody?.content, `${location}/request`, true)
      for (const [status, response] of Object.entries(a.responses)) {
        const updated = b.responses[status]
        if (!updated) add('breaking', 'response.removed', `${location}/${status}`, 'Documented response removed')
        else {
          compareContent(response.content, updated.content, `${location}/${status}`, false)
          const extras = (r: object) => Object.fromEntries(Object.entries(r).filter(([key]) => !['description', 'content'].includes(key)))
          if (stable(extras(response)) !== stable(extras(updated))) add('review', 'response.metadata', `${location}/${status}`, 'Response headers or metadata changed')
        }
      }
      for (const status of Object.keys(b.responses)) if (!(status in a.responses)) add('review', 'response.added', `${location}/${status}`, 'New possible response status')
      const extras = (op: Operation) => Object.fromEntries(Object.entries(op).filter(([key]) => !['responses', 'requestBody', 'parameters', 'summary', 'description', 'operationId', 'tags'].includes(key)))
      if (stable(extras(a)) !== stable(extras(b))) add('review', 'operation.metadata', location, 'Operation security or metadata changed')
    }
  }
  for (const [path, item] of Object.entries(after.paths)) for (const method of methods) {
    if (item[method] && !before.paths[path]?.[method]) add('non-breaking', 'operation.added', `${method.toUpperCase()} ${path}`, 'Operation added')
  }
  // Global servers, security, components, and dialect changes may affect unchanged operations.
  const metadata = (doc: OpenAPI) => Object.fromEntries(Object.entries(doc).filter(([key]) => !['paths', 'info', 'tags', 'externalDocs'].includes(key)))
  if (stable(metadata(before)) !== stable(metadata(after))) add('review', 'document.metadata', '/', 'Global metadata, dialect, or components changed')
  return { breaking: changes.some(c => c.severity === 'breaking'), reviewRequired: changes.some(c => c.severity === 'review'), changes }
}
