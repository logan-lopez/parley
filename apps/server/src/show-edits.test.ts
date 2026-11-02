import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { askInputSchema, type AskInput } from '@parley/protocol/ask'
import { applyShowEdits } from './show-edits.ts'
import { readShowFiles } from './show-files.ts'

let root: string      // holds the project and a file outside it
let project: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'parley-edit-'))
  project = join(root, 'project')
  mkdirSync(project)
  writeFileSync(join(project, 'settings.json'), '{\n  "currency": "USD"\n}\n')
  writeFileSync(join(project, 'crlf.txt'), 'one\r\ntwo\r\n')
  writeFileSync(join(root, 'outside.json'), '{}\n')
})

afterEach(() => {
  try { chmodSync(join(project, 'settings.json'), 0o644) } catch {}
  rmSync(root, { recursive: true, force: true })
})

const input = (path: string): AskInput => askInputSchema.parse({ questions: [
  { header: 'Settings', question: 'Adjust them.', type: 'show', path, editable: true },
  { header: 'Use them?', question: 'Use these?', type: 'boolean' },
] })

// Reads the file as the ask did, then answers with `text`.
async function answer(path: string, text: string | undefined, before?: () => void) {
  const ask = input(path)
  const files = await readShowFiles(ask, project)
  before?.()
  const data = { settings: text === undefined ? undefined : { text, base: files.settings!.sha256 }, use_them: true }
  return (await applyShowEdits(ask, files, data, project)).settings!
}

const file = (name: string) => readFileSync(join(project, name), 'utf8')
const eur = '{\n  "currency": "EUR"\n}\n'

describe('applyShowEdits', () => {
  it('leaves an unchanged file alone, sent or not', async () => {
    expect(await answer('settings.json', '{\n  "currency": "USD"\n}\n')).toEqual({ path: 'settings.json', edited: false, written: false })
    expect(await answer('settings.json', undefined)).toEqual({ path: 'settings.json', edited: false, written: false })
  })

  it('writes an edit in place and returns the diff', async () => {
    const { ino, mode } = statSync(join(project, 'settings.json'))
    expect(await answer('settings.json', eur)).toEqual({
      path: 'settings.json', edited: true, written: true,
      diff: '--- settings.json\n+++ settings.json\n@@ -1,3 +1,3 @@\n {\n-  "currency": "USD"\n+  "currency": "EUR"\n }\n',
    })
    expect(file('settings.json')).toBe(eur)
    expect(statSync(join(project, 'settings.json'))).toMatchObject({ ino, mode })
  })

  it('keeps CRLF line endings, and a textarea\'s LF copy is no edit', async () => {
    expect(await answer('crlf.txt', 'one\ntwo\n')).toMatchObject({ edited: false })
    expect(await answer('crlf.txt', 'one\ntwo\nthree\n')).toMatchObject({ edited: true, written: true })
    expect(file('crlf.txt')).toBe('one\r\ntwo\r\nthree\r\n')
  })

  it('writes nothing when the file changed after it was shown', async () => {
    const edit = await answer('settings.json', eur, () => writeFileSync(join(project, 'settings.json'), '{}\n'))
    expect(edit).toMatchObject({ edited: true, written: false, conflict: true })
    expect(edit.diff).toContain('+  "currency": "EUR"')
    expect(file('settings.json')).toBe('{}\n')
  })

  it('writes nothing when the file is gone', async () => {
    const edit = await answer('settings.json', eur, () => unlinkSync(join(project, 'settings.json')))
    expect(edit).toMatchObject({ edited: true, written: false, conflict: true })
    expect(edit.diff).toContain('-  "currency": "USD"')
  })

  it('refuses a file swapped for a link out of the project', async () => {
    const edit = await answer('settings.json', eur, () => {
      unlinkSync(join(project, 'settings.json'))
      symlinkSync(join(root, 'outside.json'), join(project, 'settings.json'))
    })
    expect(edit).toMatchObject({ edited: true, written: false, error: expect.stringContaining('is outside the project') })
    expect(edit.diff).toBeDefined()
    expect(readFileSync(join(root, 'outside.json'), 'utf8')).toBe('{}\n')
  })

  it('reports a failed write, with the diff', async () => {
    const edit = await answer('settings.json', eur, () => chmodSync(join(project, 'settings.json'), 0o444))
    expect(edit).toMatchObject({ edited: true, written: false, error: expect.stringContaining('EACCES') })
    expect(edit.diff).toContain('+  "currency": "EUR"')
    expect(edit).not.toHaveProperty('conflict')
  })

  it('counts the lines instead of a diff over 20,000 characters', async () => {
    const big = Array.from({ length: 600 }, (_, i) => `  "key${i}": "a long enough value for the diff to grow"`).join(',\n')
    const edit = await answer('settings.json', `{\n${big}\n}\n`)
    expect(edit).toEqual({ path: 'settings.json', edited: true, written: true, changedLines: 601 })
  })
})
