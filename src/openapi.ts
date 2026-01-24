import { z } from 'zod'
import type { JsonSchema, OpenAPI, Operation } from './types.js'
import { methods } from './types.js'

const schema = z.union([z.boolean(), z.record(z.string(), z.unknown())])
const media = z.object({ schema: schema.optional() }).passthrough()
const response = z.object({ description: z.string(), content: z.record(z.string(), media).optional() }).passthrough()
const operation = z.object({
  responses: z.record(z.string(), response).refine(x => Object.keys(x).length > 0, 'At least one response is required'),
  requestBody: z.object({ required: z.boolean().optional(), content: z.record(z.string(), media) }).passthrough().optional(),
}).passthrough()
const document = z.object({
  openapi: z.string().regex(/^3\.(0|1)\.\d+$/, 'Only OpenAPI 3.0.x and 3.1.x are supported'),
  info: z.object({ title: z.string(), version: z.string() }).passthrough(),
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
  components: z.object({ schemas: z.record(z.string(), schema).optional() }).passthrough().optional(),
}).passthrough()

/** Structural validation of the supported OpenAPI subset, not full specification conformance. */
export function parseOpenAPI(input: unknown): OpenAPI {
  const parsed = document.parse(input)
  for (const [path, item] of Object.entries(parsed.paths)) {
    if (!path.startsWith('/') && !path.startsWith('x-')) throw new Error(`Invalid API path: ${path}`)
    if ('$ref' in item) throw new Error(`Path item references are unsupported: ${path}`)
    for (const method of methods) if (method in item) operation.parse(item[method])
  }
  return parsed as OpenAPI
}

export function getOperation(doc: OpenAPI, method: string, path: string): Operation {
  const normalized = method.toLowerCase()
  if (!(methods as readonly string[]).includes(normalized)) throw new Error(`Unsupported method: ${method}`)
  const found = doc.paths[path]?.[normalized]
  if (!found) throw new Error(`Operation not found: ${method.toUpperCase()} ${path}; use the OpenAPI template path`)
  return found as Operation
}

/** Resolve local schema references only. External resources are never fetched. */
export function resolveSchema(doc: OpenAPI, input: JsonSchema, seen = new Set<string>()): JsonSchema {
  if (typeof input === 'boolean' || typeof input.$ref !== 'string') return input
  const ref = input.$ref
  if (!ref.startsWith('#/components/schemas/')) throw new Error(`Unsupported schema reference: ${ref}`)
  if (seen.has(ref)) throw new Error(`Recursive reference requires review: ${ref}`)
  const name = ref.slice('#/components/schemas/'.length).replace(/~1/g, '/').replace(/~0/g, '~')
  const target = doc.components?.schemas?.[name]
  if (target === undefined) throw new Error(`Unresolved reference: ${ref}`)
  seen.add(ref)
  const resolved = resolveSchema(doc, target, seen)
  if (typeof resolved === 'boolean') return resolved
  const { $ref: _, ...siblings } = input
  return { ...resolved, ...siblings }
}
