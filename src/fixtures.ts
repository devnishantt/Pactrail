import { z } from 'zod'
import type { OpenAPI } from './types.js'
import { validateResponse } from './validation.js'

const fixtureSchema = z.object({
  name: z.string().min(1), method: z.string(), path: z.string().startsWith('/'),
  status: z.number().int().min(100).max(599), body: z.unknown().optional(), contentType: z.string().optional(),
}).strict()

/** Pure fixture runner: no live network calls or mutable shared state. */
export function runFixtures(doc: OpenAPI, input: unknown) {
  const fixtures = z.array(fixtureSchema).parse(input)
  const names = new Set<string>()
  return fixtures.map(fixture => {
    if (names.has(fixture.name)) throw new Error(`Duplicate fixture name: ${fixture.name}`)
    names.add(fixture.name)
    const result = validateResponse(doc, fixture)
    return { name: fixture.name, ...result }
  })
}
