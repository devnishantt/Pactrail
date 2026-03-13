import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Deterministic, independently named edge cases; no random test data or snapshot churn.
const factories = {
  minimum: n => [{ type: 'number', minimum: n }, [n, n + 0.5], [n - 0.5, String(n)]],
  maximum: n => [{ type: 'number', maximum: n }, [n, n - 0.5], [n + 0.5, null]],
  exclusiveMinimum: n => [{ type: 'number', exclusiveMinimum: n }, [n + 1, n + 0.1], [n, n - 1]],
  exclusiveMaximum: n => [{ type: 'number', exclusiveMaximum: n }, [n - 1, n - 0.1], [n, n + 1]],
  multipleOf: n => [{ type: 'integer', multipleOf: n + 2 }, [0, (n + 2) * 3], [1, (n + 2) * 3 + 1]],
  stringLength: n => [{ type: 'string', minLength: n + 1, maxLength: n + 3 }, ['a'.repeat(n + 1), 'a'.repeat(n + 3)], ['a'.repeat(n), 'a'.repeat(n + 4)]],
  unicodeLength: n => [{ type: 'string', minLength: n + 1, maxLength: n + 1 }, ['\u{1f642}'.repeat(n + 1)], ['\u{1f642}'.repeat(n), '\u{1f642}'.repeat(n + 2)]],
  pattern: n => [{ type: 'string', pattern: `^ID${n}-[0-9]+$` }, [`ID${n}-1`, `ID${n}-42`], [`ID${n}-x`, `prefix-ID${n}-1`]],
  enum: n => [{ enum: [`open-${n}`, `closed-${n}`, null] }, [`open-${n}`, null], [`unknown-${n}`, n]],
  required: n => [{ type: 'object', required: [`field${n}`], properties: { [`field${n}`]: { type: 'integer' } }, additionalProperties: false }, [{ [`field${n}`]: n }], [{}, { [`field${n}`]: String(n) }, { [`field${n}`]: n, extra: true }]],
  arrayBounds: n => [{ type: 'array', minItems: n + 1, maxItems: n + 2, items: { type: 'integer' } }, [Array(n + 1).fill(1), Array(n + 2).fill(2)], [Array(n).fill(1), Array(n + 3).fill(1)]],
  uniqueness: n => [{ type: 'array', uniqueItems: true, items: { type: 'object' } }, [[{ id: n }, { id: n + 1 }], []], [[{ id: n }, { id: n }], [n]]],
  anyOf: n => [{ anyOf: [{ type: 'integer', minimum: n }, { const: `fallback-${n}` }] }, [n, `fallback-${n}`], [n - 1, 'no']],
  oneOf: n => [{ oneOf: [{ type: 'integer', minimum: n }, { type: 'integer', maximum: n }] }, [n - 1, n + 1], [n, 'no']],
  allOf: n => [{ allOf: [{ type: 'integer', minimum: n }, { maximum: n + 2 }] }, [n, n + 2], [n - 1, n + 3]],
  not: n => [{ type: 'integer', not: { const: n } }, [n - 1, n + 1], [n, String(n)]],
  dependentRequired: n => [{ type: 'object', dependentRequired: { [`a${n}`]: [`b${n}`] } }, [{}, { [`a${n}`]: 1, [`b${n}`]: 2 }], [{ [`a${n}`]: 1 }]],
  contains: n => [{ type: 'array', contains: { const: n }, minContains: 1, maxContains: 1 }, [[n], [n, n + 1]], [[], [n + 1], [n, n]]],
  tuple: n => [{ type: 'array', prefixItems: [{ const: n }, { type: 'string' }], minItems: 2, items: false }, [[n, 'ok']], [[n, 1], [n], [n, 'ok', true]]],
  conditional: n => [{ type: 'object', required: ['kind'], properties: { kind: { type: 'string' } }, if: { properties: { kind: { const: `special-${n}` } } }, then: { required: ['detail'] }, else: { not: { required: ['detail'] } } }, [{ kind: `special-${n}`, detail: n }, { kind: 'other' }], [{ kind: `special-${n}` }, { kind: 'other', detail: n }]],
  propertyNames: n => [{ type: 'object', propertyNames: { pattern: `^field${n}_[a-z]+$` } }, [{ [`field${n}_name`]: 1 }, {}], [{ invalid: 1 }, { [`field${n}_1`]: 1 }]],
  patternProperties: n => [{ type: 'object', patternProperties: { [`^num${n}_`]: { type: 'integer' } }, additionalProperties: false }, [{ [`num${n}_x`]: n }, {}], [{ [`num${n}_x`]: 'bad' }, { other: n }]],
}
const count = Number(process.argv[2] ?? 146)
if (!Number.isInteger(count) || count < 1 || count > 176) throw new Error('Count must be 1..176')
const directory = fileURLToPath(new URL('../tests/cases/', import.meta.url))
mkdirSync(directory, { recursive: true })
let written = 0
for (let boundary = 0; boundary < 8 && written < count; boundary++) {
  for (const [kind, factory] of Object.entries(factories)) {
    if (written === count) break
    const [schema, accepts, rejects] = factory(boundary)
    const name = `${String(++written).padStart(3, '0')}-${kind}-${boundary}`
    writeFileSync(join(directory, `${name}.json`), JSON.stringify({ name: `${kind}: boundary ${boundary}`, schema, accepts, rejects }, null, 2) + '\n')
  }
}
console.log(`Wrote ${written} deterministic schema regression cases`)
