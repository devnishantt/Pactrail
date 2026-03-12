import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateSchema, type JsonSchema } from '../src/index.js'

type Scenario = { name: string; schema: JsonSchema; accepts: unknown[]; rejects: unknown[] }
const directory = fileURLToPath(new URL('./cases/', import.meta.url))
for (const name of readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
  const scenario = JSON.parse(readFileSync(join(directory, name), 'utf8')) as Scenario
  describe(scenario.name, () => {
    scenario.accepts.forEach((value, i) => it(`accepts fixture ${i + 1}`, () => expect(validateSchema(scenario.schema, value).valid).toBe(true)))
    scenario.rejects.forEach((value, i) => it(`rejects fixture ${i + 1}`, () => expect(validateSchema(scenario.schema, value).valid).toBe(false)))
  })
}
