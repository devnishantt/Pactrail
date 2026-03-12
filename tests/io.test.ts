import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readData } from '../src/io.js'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function file(name: string, data: string) {
  const dir = await mkdtemp(join(tmpdir(), 'pactrail-')); dirs.push(dir)
  const path = join(dir, name); await writeFile(path, data); return path
}
it('reads JSON', async () => expect(await readData(await file('a.json', '{"x":1}'))).toEqual({ x: 1 }))
it('reads YAML', async () => expect(await readData(await file('a.yaml', 'x: 1'))).toEqual({ x: 1 }))
it('rejects malformed JSON', async () => await expect(readData(await file('a.json', '{'))).rejects.toThrow())
it('rejects duplicate YAML keys', async () => await expect(readData(await file('a.yaml', 'x: 1\nx: 2'))).rejects.toThrow())
it('rejects missing files', async () => await expect(readData('/nonexistent/pactrail.json')).rejects.toThrow())
