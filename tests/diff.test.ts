import { expect, it } from 'vitest'
import { diffContracts, getOperation, parseOpenAPI, type JsonSchema } from '../src/index.js'

function doc(schema: JsonSchema = { type: 'string' }) {
  return parseOpenAPI({ openapi: '3.1.0', info: { title: 'test', version: '1' }, paths: {
    '/items': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema } } } } } },
  } })
}
const codes = (a: ReturnType<typeof doc>, b: ReturnType<typeof doc>) => diffContracts(a, b).changes.map(c => c.code)
it('has no changes for identical contracts', () => expect(diffContracts(doc(), doc()).changes).toEqual([]))
it('ignores schema documentation', () => expect(diffContracts(doc(), doc({ type: 'string', description: 'new' })).changes).toEqual([]))
it('detects removed operations', () => expect(diffContracts(doc(), { ...doc(), paths: {} }).breaking).toBe(true))
it('allows added operations', () => expect(diffContracts({ ...doc(), paths: {} }, doc()).changes[0]?.severity).toBe('non-breaking'))
it('detects removed status codes', () => {
  const after = doc(); getOperation(after, 'get', '/items').responses = { '204': { description: 'empty' } }
  expect(codes(doc(), after)).toContain('response.removed')
})
it('detects changed types', () => expect(diffContracts(doc(), doc({ type: 'number' })).breaking).toBe(true))
it('detects expanded response enums', () => expect(diffContracts(doc({ enum: ['a'] }), doc({ enum: ['a', 'b'] })).breaking).toBe(true))
it('requires review for narrowed response enums', () => expect(diffContracts(doc({ enum: ['a', 'b'] }), doc({ enum: ['a'] })).reviewRequired).toBe(true))
it('detects removed guaranteed properties', () => expect(diffContracts(doc({ type: 'object', required: ['id'] }), doc({ type: 'object' })).breaking).toBe(true))
it('detects removed response properties', () => expect(diffContracts(doc({ properties: { id: { type: 'number' } } }), doc({})).breaking).toBe(true))
it('reviews added properties', () => expect(diffContracts(doc({}), doc({ properties: { id: {} } })).reviewRequired).toBe(true))
it('reviews numerical constraints', () => expect(diffContracts(doc({ minimum: 1 }), doc({ minimum: 2 })).reviewRequired).toBe(true))
it('detects nested array type changes', () => expect(diffContracts(doc({ type: 'array', items: { type: 'string' } }), doc({ type: 'array', items: { type: 'number' } })).breaking).toBe(true))
it('reviews boolean schemas', () => expect(codes(doc(true), doc(false))).toContain('schema.boolean'))
it('reviews unresolved references', () => expect(codes(doc({ $ref: '#/components/schemas/A' }), doc({ $ref: '#/components/schemas/B' }))).toContain('schema.reference'))
it('detects required request bodies', () => {
  const after = doc(); getOperation(after, 'get', '/items').requestBody = { required: true, content: {} }
  expect(codes(doc(), after)).toContain('request.required')
})
it('detects narrowed request enums', () => {
  const a = doc(), b = doc()
  getOperation(a, 'get', '/items').requestBody = { content: { 'application/json': { schema: { enum: ['a', 'b'] } } } }
  getOperation(b, 'get', '/items').requestBody = { content: { 'application/json': { schema: { enum: ['a'] } } } }
  expect(diffContracts(a, b).breaking).toBe(true)
})
it('detects required request properties', () => {
  const a = doc(), b = doc()
  getOperation(a, 'get', '/items').requestBody = { content: { 'application/json': { schema: { type: 'object' } } } }
  getOperation(b, 'get', '/items').requestBody = { content: { 'application/json': { schema: { type: 'object', required: ['id'] } } } }
  expect(diffContracts(a, b).breaking).toBe(true)
})
it('detects removed request media', () => {
  const a = doc(), b = doc()
  getOperation(a, 'get', '/items').requestBody = { content: { 'application/json': {} } }
  expect(codes(a, b)).toContain('media.removed')
})
it('reviews security changes', () => expect(diffContracts(doc(), { ...doc(), security: [{ key: [] }] }).reviewRequired).toBe(true))
it('reviews parameter changes', () => {
  const b = doc(); getOperation(b, 'get', '/items').parameters = [{ name: 'id', in: 'query', required: true }]
  expect(codes(doc(), b)).toContain('parameters.changed')
})
it('reviews component-only changes', () => {
  const b = doc(); b.components = { schemas: { X: { type: 'number' } } }
  expect(codes(doc(), b)).toContain('document.metadata')
})
it('ignores property ordering', () => expect(diffContracts(doc({ type: 'string', minLength: 1 }), doc({ minLength: 1, type: 'string' })).changes).toEqual([]))
it('reviews changed path servers', () => {
  const b = doc(); b.paths['/items']!.servers = [{ url: 'https://other.example' }]
  expect(codes(doc(), b)).toContain('path.metadata')
})
it('reviews media encoding changes', () => {
  const b = doc()
  Object.assign(getOperation(b, 'get', '/items').responses['200']!.content!['application/json']!, { encoding: { id: { style: 'form' } } })
  expect(codes(doc(), b)).toContain('media.metadata')
})
it('reviews operation-level security', () => {
  const b = doc(); getOperation(b, 'get', '/items').security = [{ token: [] }]
  expect(codes(doc(), b)).toContain('operation.metadata')
})
it('reviews response headers', () => {
  const b = doc(); Object.assign(getOperation(b, 'get', '/items').responses['200']!, { headers: { token: { required: true } } })
  expect(codes(doc(), b)).toContain('response.metadata')
})
