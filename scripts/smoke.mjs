import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function run(args, status) {
  const result = spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' })
  assert.equal(result.status, status, result.stderr || result.stdout)
  return result
}
run(['--help'], 0)
run(['--version'], 0)
assert.equal(JSON.parse(run(['validate', 'examples/openapi.yaml'], 0).stdout).valid, true)
assert.equal(JSON.parse(run(['fixtures', 'examples/openapi.yaml', 'examples/fixtures.json'], 0).stdout).valid, true)
run(['diff', 'examples/openapi.yaml', 'examples/openapi.yaml'], 0)
assert.equal(JSON.parse(run(['diff', 'examples/openapi.yaml', 'examples/breaking.yaml'], 1).stdout).breaking, true)
run(['diff', 'examples/openapi.yaml', 'examples/breaking.yaml', '--format', 'text'], 1)
run(['diff', 'examples/openapi.yaml', 'examples/openapi.yaml', '--format', 'invalid'], 2)
run(['validate', 'missing-file.json'], 2)
run(['validate', 'examples/openapi.yaml', '--unknown'], 2)
run(['diff'], 2)
run(['unknown'], 2)
const dir = mkdtempSync(join(tmpdir(), 'pactrail-cli-'))
try {
  const badFixture = join(dir, 'bad.json')
  writeFileSync(badFixture, JSON.stringify([{ name: 'invalid book', method: 'GET', path: '/books/{id}', status: 200, body: { id: 0 } }]))
  assert.equal(JSON.parse(run(['fixtures', 'examples/openapi.yaml', badFixture], 1).stdout).valid, false)
} finally { rmSync(dir, { recursive: true, force: true }) }
console.log('13 CLI smoke checks passed')
