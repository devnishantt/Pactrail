import { readFile } from 'node:fs/promises'
import { parseDocument } from 'yaml'

/** Local files only. YAML aliases are bounded to avoid expansion attacks. */
export async function readData(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8')
  if (/\.json$/i.test(path)) return JSON.parse(text)
  const doc = parseDocument(text, { uniqueKeys: true })
  if (doc.errors.length) throw new Error(doc.errors.map(e => e.message).join('; '))
  return doc.toJS({ maxAliasCount: 100 })
}
