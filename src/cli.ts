#!/usr/bin/env node
import { readData } from './io.js'
import { parseOpenAPI } from './openapi.js'
import { diffContracts } from './diff.js'
import { runFixtures } from './fixtures.js'

const help = `Pactrail — deterministic API contract checks

Usage:
  pactrail validate <openapi.json|yaml>
  pactrail diff <before> <after> [--format json|text]
  pactrail fixtures <openapi> <fixtures.json|yaml>

Exit codes: 0 pass; 1 contract failure or manual review required; 2 input/usage error.
Validation checks the supported OpenAPI structure, not full specification conformance.
`

async function main(args: string[]): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') { console.log(help); return 0 }
  if (args[0] === '--version' && args.length === 1) { console.log('0.1.0'); return 0 }
  const [command, ...rest] = args
  const positional: string[] = []
  let format = 'json'
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--format') { format = rest[++i] ?? ''; continue }
    if (rest[i]!.startsWith('-')) throw new Error(`Unknown option: ${rest[i]}`)
    positional.push(rest[i]!)
  }
  if (!['json', 'text'].includes(format)) throw new Error('Format must be json or text')
  if (command === 'validate' && positional.length === 1) {
    const doc = parseOpenAPI(await readData(positional[0]!))
    console.log(JSON.stringify({ valid: true, title: doc.info.title, version: doc.info.version, scope: 'supported-structure' }, null, 2))
    return 0
  }
  if (command === 'diff' && positional.length === 2) {
    const result = diffContracts(parseOpenAPI(await readData(positional[0]!)), parseOpenAPI(await readData(positional[1]!)))
    console.log(format === 'json' ? JSON.stringify(result, null, 2) : result.changes.map(c => `[${c.severity}] ${c.code} ${c.path}: ${c.message}`).join('\n') || 'No changes')
    return result.breaking || result.reviewRequired ? 1 : 0
  }
  if (command === 'fixtures' && positional.length === 2) {
    const result = runFixtures(parseOpenAPI(await readData(positional[0]!)), await readData(positional[1]!))
    console.log(JSON.stringify({ valid: result.every(r => r.valid), results: result }, null, 2))
    return result.every(r => r.valid) ? 0 : 1
  }
  throw new Error('Unknown command or wrong number of arguments. Run pactrail --help')
}

main(process.argv.slice(2)).then(code => { process.exitCode = code }).catch(error => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  process.exitCode = 2
})
