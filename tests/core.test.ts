import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { getOperation, parseOpenAPI, resolveSchema, runFixtures, validateResponse, validateSchema, validateWithZod } from '../src/index.js'

const makeDoc = (schema: unknown = { type: 'string' }) => parseOpenAPI({
  openapi: '3.1.0', info: { title: 'test', version: '1' },
  paths: { '/items/{id}': { get: { responses: {
    '200': { description: 'ok', content: { 'application/json': { schema } } },
    '204': { description: 'empty' },
  } } } },
})

describe('OpenAPI structure', () => {
  it('rejects unsupported versions', () => expect(() => parseOpenAPI({ openapi: '2.0' })).toThrow())
  it('requires responses', () => expect(() => parseOpenAPI({ ...makeDoc(), paths: { '/': { get: {} } } })).toThrow())
  it('rejects empty responses', () => expect(() => parseOpenAPI({ ...makeDoc(), paths: { '/': { get: { responses: {} } } } })).toThrow())
  it('requires absolute path templates', () => expect(() => parseOpenAPI({ ...makeDoc(), paths: { invalid: {} } })).toThrow())
  it('rejects path item refs', () => expect(() => parseOpenAPI({ ...makeDoc(), paths: { '/': { $ref: '#/x' } } })).toThrow())
  it('normalizes method case', () => expect(getOperation(makeDoc(), 'GET', '/items/{id}')).toBeTruthy())
  it('requires exact path templates', () => expect(() => getOperation(makeDoc(), 'get', '/items/1')).toThrow())
  it('rejects unknown methods', () => expect(() => getOperation(makeDoc(), 'brew', '/items/{id}')).toThrow())
})

describe('payload validation', () => {
  it('keeps payloads immutable and does not coerce', () => {
    const value = { amount: '3' }
    expect(validateSchema({ type: 'object', properties: { amount: { type: 'number' } } }, value).valid).toBe(false)
    expect(value).toEqual({ amount: '3' })
  })
  it('supports boolean schemas', () => {
    expect(validateSchema(true, 1).valid).toBe(true)
    expect(validateSchema(false, 1).valid).toBe(false)
  })
  it('returns nested issue paths', () => expect(validateSchema({ type: 'object', properties: { x: { type: 'number' } } }, { x: 'bad' }).issues[0]?.path).toBe('/x'))
  it('supports Zod refinements', () => {
    expect(validateWithZod(z.string().email(), 'not-email').valid).toBe(false)
    expect(validateWithZod(z.number(), 4)).toEqual({ valid: true, issues: [] })
  })
  it('does not fetch external references', () => expect(() => validateSchema({ $ref: 'https://example.com/schema' }, {})).toThrow())
  it('rejects custom schema identifiers', () => expect(() => validateSchema({ $id: 'https://example.com' }, {})).toThrow())
  it('supports local component references', () => {
    const doc = makeDoc({ $ref: '#/components/schemas/Item' })
    doc.components = { schemas: { Item: { type: 'integer' } } }
    expect(validateResponse(doc, { method: 'GET', path: '/items/{id}', status: 200, body: 2 }).valid).toBe(true)
    expect(resolveSchema(doc, { $ref: '#/components/schemas/Item' })).toEqual({ type: 'integer' })
  })
  it('fails unresolved refs', () => expect(() => resolveSchema(makeDoc(), { $ref: '#/components/schemas/Missing' })).toThrow())
  it('supports recursive component validation', () => {
    const doc = makeDoc()
    doc.components = { schemas: { Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } } } }
    expect(validateSchema({ $ref: '#/components/schemas/Node' }, { next: {} }, doc).valid).toBe(true)
  })
  it('detects ref cycles during diff resolution', () => {
    const doc = makeDoc()
    doc.components = { schemas: { Loop: { $ref: '#/components/schemas/Loop' } } }
    expect(() => resolveSchema(doc, { $ref: '#/components/schemas/Loop' })).toThrow()
  })
  it('accepts OpenAPI 3.0 nullable schemas', () => {
    const doc = { ...makeDoc(), openapi: '3.0.3' }
    expect(validateSchema({ type: 'string', nullable: true }, null, doc).valid).toBe(true)
  })
})

describe('response matching', () => {
  const request = { method: 'GET', path: '/items/{id}', status: 200, body: 'ok' }
  it('checks declared responses', () => expect(validateResponse(makeDoc(), request).valid).toBe(true))
  it('fails undocumented statuses', () => expect(validateResponse(makeDoc(), { ...request, status: 500 }).valid).toBe(false))
  it('fails unexpected content types', () => expect(validateResponse(makeDoc(), { ...request, contentType: 'text/plain' }).valid).toBe(false))
  it('normalizes MIME parameters', () => expect(validateResponse(makeDoc(), { ...request, contentType: 'APPLICATION/JSON; charset=utf-8' }).valid).toBe(true))
  it('accepts empty responses without a body', () => expect(validateResponse(makeDoc(), { ...request, status: 204, body: undefined }).valid).toBe(true))
  it('rejects unexpected bodies', () => expect(validateResponse(makeDoc(), { ...request, status: 204 }).valid).toBe(false))
  it('matches wildcard and default status', () => {
    const doc = makeDoc()
    const op = getOperation(doc, 'get', '/items/{id}')
    op.responses = { '2XX': { description: 'ok', content: { 'application/*': { schema: { type: 'string' } } } }, default: { description: 'error' } }
    expect(validateResponse(doc, { ...request, status: 201 }).valid).toBe(true)
    expect(validateResponse(doc, { ...request, status: 503, body: undefined }).valid).toBe(true)
  })
  it('allows media types without schemas', () => {
    const doc = makeDoc()
    getOperation(doc, 'get', '/items/{id}').responses['200']!.content = { '*/*': {} }
    expect(validateResponse(doc, { ...request, body: { anything: true } }).valid).toBe(true)
  })
})

describe('fixtures', () => {
  const fixture = { name: 'one', method: 'GET', path: '/items/{id}', status: 200, body: 'ok' }
  it('aggregates valid and invalid fixtures', () => expect(runFixtures(makeDoc(), [fixture, { ...fixture, name: 'two', body: 1 }]).map(r => r.valid)).toEqual([true, false]))
  it('rejects duplicate names', () => expect(() => runFixtures(makeDoc(), [fixture, fixture])).toThrow())
  it('rejects invalid fixture inputs', () => expect(() => runFixtures(makeDoc(), [{ ...fixture, status: 900 }])).toThrow())
})
