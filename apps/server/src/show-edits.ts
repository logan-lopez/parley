// Applies the user's edits to editable shows: Parley's one write outside its
// own data directory. The server writes the file itself, and only when the
// disk still hashes to the version the edit started from, so the agent never
// re-applies anything (an answer Claude Code delivers after backgrounding the
// call has `<` and `>` escaped). The agent gets a diff, not the whole file.

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from 'diff'
import { SHOW_DIFF_MAX, type ShowEdit, type ShowEditValue, type ShowFiles } from '@parley/protocol'
import { questionIds, type AskInput } from '@parley/protocol/ask'
import { locate, projectRoot, ShowFileError, ShowFileMissing } from './show-files.ts'

export async function applyShowEdits(
  input: AskInput, files: ShowFiles, data: unknown, projectDir = process.cwd(),
): Promise<Record<string, ShowEdit>> {
  const ids = questionIds(input.questions)
  const answers = isRecord(data) ? data : {}
  const edits: Record<string, ShowEdit> = {}
  for (const [i, q] of input.questions.entries()) {
    const id = ids[i]!
    const file = files[id]
    if (q.type !== 'show' || !q.editable || !file) continue
    const value = (isRecord(answers[id]) ? answers[id] : {}) as ShowEditValue
    const original = file.text
    const base = typeof value.base === 'string' ? value.base : file.sha256

    // A textarea gives back `\n` line breaks, so a CRLF file gets its own back.
    const sent = typeof value.text === 'string' ? lf(value.text) : lf(original)
    if (sent === lf(original)) {
      edits[id] = { path: file.path, edited: false, written: false }
      continue
    }
    const next = original.match(/\r?\n/)?.[0] === '\r\n' ? sent.replace(/\n/g, '\r\n') : sent
    // Against the text the user was shown. Until the shown version can change
    // while the card is open, that's always the file as first read.
    const diff = createTwoFilesPatch(file.path, file.path, lf(original), sent, undefined, undefined, {
      context: 3, headerOptions: FILE_HEADERS_ONLY,
    })
    const unsaved = (extra: Partial<ShowEdit>): ShowEdit => ({ path: file.path, edited: true, written: false, diff, ...extra })

    let real: string
    try {
      real = (await locate(file.path, await projectRoot(projectDir))).real
    } catch (error) {
      if (error instanceof ShowFileMissing) {
        edits[id] = unsaved({ conflict: true })
        continue
      }
      if (!(error instanceof ShowFileError)) throw error
      // The path's own message, less its advice about showing files.
      edits[id] = unsaved({ error: error.message.split(';')[0]! })
      continue
    }

    const now = await readFile(real).catch(() => undefined)
    if (!now || sha256(now) !== base) {
      edits[id] = unsaved({ conflict: true })
      continue
    }
    try {
      // In place, so the file keeps its mode and inode.
      await writeFile(real, next, 'utf8')
    } catch (error) {
      edits[id] = unsaved({ error: error instanceof Error ? error.message : String(error) })
      continue
    }
    console.error(`[parley] saved an edit to ${file.path}`)
    edits[id] = diff.length > SHOW_DIFF_MAX
      ? { path: file.path, edited: true, written: true, changedLines: changedLines(diff) }
      : { path: file.path, edited: true, written: true, diff }
  }
  return edits
}

function lf(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

// Added and removed lines, past the `---`/`+++` header.
function changedLines(diff: string): number {
  return diff.split('\n').slice(2).filter((l) => l.startsWith('+') || l.startsWith('-')).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
