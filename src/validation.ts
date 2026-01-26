import { Ajv2020 } from 'ajv/dist/2020.js'
import { Ajv } from 'ajv'
import { fullFormats } from 'ajv-formats/dist/formats.js'
import type { z } from 'zod'
import type { JsonSchema, OpenAPI, ValidationResult } from './types.js'
import { getOperation } from './openapi.js'

function rewrite(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewrite)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      if (key === '$ref' && typeof entry === 'string') {
        if (!entry.startsWith('#/components/schemas/')) throw new Error(`Unsupported schema reference: ${entry}`)
        return [key, entry.replace('#/components/schemas/', '#/$defs/')]
      }
      if (key === '$id') throw new Error('Custom schema $id is unsupported')
      return [key, rewrite(entry)]
    }))
  }
  return value
}

export function validateSchema(schema: JsonSchema, value: unknown, doc?: OpenAPI): ValidationResult {
  const Engine = doc?.openapi.startsWith('3.0.') ? Ajv : Ajv2020
  const ajv = new Engine({ allErrors: true, strict: false, validateFormats: true, formats: fullFormats })
  const normalized = rewrite(schema) as JsonSchema
  const bundled = typeof normalized === 'boolean' ? normalized : {
    ...normalized,
    $defs: { ...((normalized.$defs ?? {}) as object), ...((rewrite(doc?.components?.schemas ?? {})) as object) },
  }
  const validate = ajv.compile(bundled)
  const valid = validate(value) as boolean
  return {
    valid,
    issues: (validate.errors ?? []).map(error => ({
      path: error.instancePath || '/', message: error.message ?? 'Schema validation failed', keyword: error.keyword,
    })),
  }
}

export function validateWithZod<T>(schema: z.ZodType<T>, value: unknown): ValidationResult {
  const result = schema.safeParse(value)
  return result.success ? { valid: true, issues: [] } : {
    valid: false,
    issues: result.error.issues.map(issue => ({ path: '/' + issue.path.join('/'), message: issue.message, keyword: issue.code })),
  }
}

export function validateResponse(doc: OpenAPI, input: {
  method: string; path: string; status: number; body?: unknown; contentType?: string
}): ValidationResult {
  const operation = getOperation(doc, input.method, input.path)
  const response = operation.responses[String(input.status)] ?? operation.responses[`${Math.floor(input.status / 100)}XX`] ?? operation.responses.default
  if (!response) return { valid: false, issues: [{ path: '/', message: `Undocumented response status: ${input.status}` }] }
  const content = response.content
  if (!content || Object.keys(content).length === 0) {
    return input.body === undefined ? { valid: true, issues: [] } : {
      valid: false, issues: [{ path: '/', message: 'Response does not declare a body' }],
    }
  }
  const contentType = (input.contentType ?? 'application/json').split(';')[0]!.trim().toLowerCase()
  const selected = content[contentType] ?? content[`${contentType.split('/')[0]}/*`] ?? content['*/*']
  if (!selected) return { valid: false, issues: [{ path: '/', message: `Undocumented content type: ${contentType}` }] }
  return selected.schema === undefined ? { valid: true, issues: [] } : validateSchema(selected.schema, input.body, doc)
}
