export type JsonSchema = boolean | { [key: string]: unknown }
export type SchemaObject = Exclude<JsonSchema, boolean>
export interface MediaType { schema?: JsonSchema }
export interface ResponseObject { description: string; content?: Record<string, MediaType> }
export interface Operation {
  operationId?: string
  responses: Record<string, ResponseObject>
  requestBody?: { required?: boolean; content: Record<string, MediaType> }
  parameters?: unknown[]
  [key: string]: unknown
}
export interface OpenAPI {
  openapi: string
  info: { title: string; version: string }
  paths: Record<string, Record<string, unknown>>
  components?: { schemas?: Record<string, JsonSchema>; [key: string]: unknown }
  [key: string]: unknown
}
export interface Issue { path: string; message: string; keyword?: string }
export interface ValidationResult { valid: boolean; issues: Issue[] }
export interface Change {
  severity: 'breaking' | 'review' | 'non-breaking'
  code: string
  path: string
  message: string
}
export interface DiffResult { breaking: boolean; reviewRequired: boolean; changes: Change[] }
export interface Fixture {
  name: string
  method: string
  path: string
  status: number
  body?: unknown
  contentType?: string
}
export const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const
