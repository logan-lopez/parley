import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { askInputSchema, type AskInput } from '@parley/protocol/ask'
import { readShowFiles, ShowFileError } from './show-files.ts'

let root: string      // holds the project and a file outside it
let project: string

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}\n`).join('')

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'parley-show-'))
  project = join(root, 'project')
  mkdirSync(join(project, 'docs'), { recursive: true })
  mkdirSync(join(project, '.git'))
  writeFileSync(join(project, 'docs/plan.md'), '# Plan\r\n\r\nSteps.\r\n')
  writeFileSync(join(project, 'twelve.ts'), lines(12))
  writeFileSync(join(project, 'no-newline.txt'), 'one\ntwo')
  writeFileSync(join(project, '.env'), 'TOKEN=x\n')
  writeFileSync(join(project, '.env.local'), 'TOKEN=x\n')
  writeFileSync(join(project, 'server.PEM'), 'x\n')
  writeFileSync(join(project, '.git/config'), '[core]\n')
  writeFileSync(join(project, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))
  writeFileSync(join(project, 'latin1.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x41, 0x0a]))   // "café A\n" in Latin-1
  writeFileSync(join(project, 'bom.md'), Buffer.from('\ufeff# Plan\n', 'utf8'))
  writeFileSync(join(project, 'big.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 'a'))
  writeFileSync(join(project, 'long.txt'), 'x'.repeat(100_001))
  writeFileSync(join(root, 'outside.md'), 'secret plans\n')
  symlinkSync(join(root, 'outside.md'), join(project, 'link-out.md'))
  symlinkSync(join(project, '.env'), join(project, 'innocent.md'))
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

const go = { header: 'Go ahead?', question: 'Start?', type: 'boolean' as const }
const input = (...shows: Record<string, unknown>[]): AskInput =>
  askInputSchema.parse({ questions: [...shows.map((s, i) => ({ header: `Show ${i + 1}`, question: 'Look.', type: 'show', ...s })), go] })
const read = (path: string, extra: Record<string, unknown> = {}) => readShowFiles(input({ path, ...extra }), project)
const refusal = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => undefined, (e: unknown) => e)
  expect(error).toBeInstanceOf(ShowFileError)
  return (error as Error).message
}

describe('readShowFiles', () => {
  it('reads a relative path as it is, keyed by question id', async () => {
    const files = await read('docs/plan.md')
    expect(files).toEqual({
      show_1: {
        path: 'docs/plan.md',
        text: '# Plan\r\n\r\nSteps.\r\n',
        totalLines: 3,
        sha256: createHash('sha256').update('# Plan\r\n\r\nSteps.\r\n').digest('hex'),
      },
    })
  })

  it('skips shows with content', async () => {
    expect(await readShowFiles(input({ content: '# Inline' }, { path: 'twelve.ts' }), project)).toEqual({
      show_2: expect.objectContaining({ path: 'twelve.ts', totalLines: 12 }),
    })
  })

  it('normalizes ./ and an absolute path inside the project', async () => {
    expect((await read('./docs/../twelve.ts')).show_1!.path).toBe('twelve.ts')
    expect((await read(join(project, 'docs/plan.md'))).show_1!.path).toBe('docs/plan.md')
  })

  it('slices lines, and hashes the whole file', async () => {
    const file = (await read('twelve.ts', { lines: [3, 5] })).show_1!
    expect(file.text).toBe('line 3\nline 4\nline 5\n')
    expect(file.lines).toEqual([3, 5])
    expect(file.totalLines).toBe(12)
    expect(file.sha256).toBe(createHash('sha256').update(lines(12)).digest('hex'))
  })

  it('clamps the end to the last line, counting one without a newline', async () => {
    expect((await read('twelve.ts', { lines: [11, 400] })).show_1).toMatchObject({ text: 'line 11\nline 12\n', lines: [11, 12] })
    expect((await read('no-newline.txt', { lines: [2, 9] })).show_1).toMatchObject({ text: 'two', lines: [2, 2], totalLines: 2 })
  })

  it('refuses a start past the end', async () => {
    expect(await refusal(read('twelve.ts', { lines: [13, 20] }))).toContain('`twelve.ts` has 12 lines')
  })

  it('refuses .. out of the project', async () => {
    expect(await refusal(read('../outside.md'))).toMatch(/^`\.\.\/outside\.md` is outside the project \(`.+project`\); show files from inside it$/)
    expect(await refusal(read(join(root, 'outside.md')))).toContain('is outside the project')
  })

  it('refuses a symlink that leads out', async () => {
    expect(await refusal(read('link-out.md'))).toContain('`link-out.md` is outside the project')
  })

  it('refuses secret-looking names, and links to them', async () => {
    for (const path of ['.env', '.env.local', 'server.PEM', '.git/config', 'innocent.md']) {
      expect(await refusal(read(path))).toBe(`Parley doesn't show \`${path}\`: it looks like it holds secrets`)
    }
    // Before the file is even looked for.
    expect(await refusal(read('keys/id_ed25519'))).toContain('looks like it holds secrets')
    expect(await refusal(read('.ssh/config'))).toContain('looks like it holds secrets')
  })

  it('refuses a missing file and a directory', async () => {
    expect(await refusal(read('docs/nope.md'))).toContain("`docs/nope.md` doesn't exist in the project")
    expect(await refusal(read('docs'))).toBe('`docs` is a directory; give a file in it, or put the text in `content`')
  })

  it('refuses a binary file', async () => {
    expect(await refusal(read('logo.png'))).toContain('`logo.png` looks like a binary file')
  })

  it('refuses a file over 2 MB, and text over 100,000 characters', async () => {
    expect(await refusal(read('big.txt'))).toContain("over Parley's 2 MB for a shown file")
    expect(await refusal(read('long.txt'))).toBe("`long.txt` is 100,001 characters, over Parley's 100,000 for one show; show part of it with `lines`")
    expect(await refusal(read('long.txt', { lines: [1, 1] }))).toContain('100,001 characters in those lines')
    expect((await read('twelve.ts', { lines: [1, 1] })).show_1!.text).toBe('line 1\n')
  })

  it('caps what one ask shows in all', async () => {
    writeFileSync(join(project, 'ninety.txt'), 'y'.repeat(90_000))
    const three = input({ path: 'ninety.txt' }, { path: 'ninety.txt' }, { content: 'z'.repeat(20_000) })
    await expect(readShowFiles(three, project)).resolves.toBeDefined()
    const four = askInputSchema.parse({ questions: [
      ...[1, 2, 3].map((i) => ({ header: `Show ${i}`, question: 'Look.', type: 'show', path: 'ninety.txt' })),
      go,
    ] })
    expect(await refusal(readShowFiles(four, project))).toContain('more than 200,000 characters')
  })

  it('refuses to edit a file that isn\'t valid UTF-8, and still shows it', async () => {
    expect(await refusal(read('latin1.txt', { editable: true })))
      .toBe("`latin1.txt` isn't valid UTF-8, so saving an edit to it would change bytes the user didn't touch; show it without `editable`, and ask about the change instead")
    expect((await read('latin1.txt')).show_1!.text).toBe('caf\ufffd A\n')
    // A BOM is valid UTF-8 and survives the round trip.
    expect((await read('bom.md', { editable: true })).show_1!.text).toBe('\ufeff# Plan\n')
    expect((await read('docs/plan.md', { editable: true })).show_1!.path).toBe('docs/plan.md')
  })

  it('counts an editable file twice: the card carries its text and the original', async () => {
    // 90,000 + 20,000 + twelve.ts's 84 fits; with the 90,000 counted twice it doesn't.
    const rest = [{ content: 'z'.repeat(20_000) }, { path: 'twelve.ts' }]
    await expect(readShowFiles(input({ path: 'ninety.txt' }, ...rest), project)).resolves.toBeDefined()
    expect(await refusal(readShowFiles(input({ path: 'ninety.txt', editable: true }, ...rest), project)))
      .toContain('counting an editable file twice')
  })

  it('has no project at / or in the home directory', async () => {
    const message = "This client didn't start Parley in a project directory, so `path` isn't available here. Put the text in `content` instead."
    expect(await refusal(readShowFiles(input({ path: 'README.md' }), '/'))).toBe(message)
    expect(await refusal(readShowFiles(input({ path: 'README.md' }), homedir()))).toBe(message)
    // Content alone needs no project.
    expect(await readShowFiles(input({ content: 'x' }), '/')).toEqual({})
  })
})
