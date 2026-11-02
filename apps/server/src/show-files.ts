// Reads the files that show blocks name with `path`. The server's cwd is the
// agent's project, so a relative path resolves the way the agent means it.
// Only files inside the project (after realpath, so a symlink out is refused),
// and nothing that looks like it holds secrets: the text goes into the form,
// and from there into history.jsonl.

import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import {
  SHOW_ASK_MAX_CHARS,
  SHOW_FILE_MAX_BYTES,
  SHOW_FILE_MAX_CHARS,
  type ShowFile,
  type ShowFiles,
} from '@parley/protocol'
import { questionIds, type AskInput } from '@parley/protocol/ask'

// The message is model-facing: it says what to do instead.
export class ShowFileError extends Error {}
// The path passes the rules, but nothing is there.
export class ShowFileMissing extends ShowFileError {}

export async function readShowFiles(input: AskInput, projectDir = process.cwd()): Promise<ShowFiles> {
  const ids = questionIds(input.questions)
  const files: ShowFiles = {}
  let total = 0
  let project: Project | undefined
  for (const [i, q] of input.questions.entries()) {
    if (q.type !== 'show') continue
    if (q.path === undefined) {
      total += q.content?.length ?? 0
    } else {
      project ??= await projectRoot(projectDir)
      const file = await readOne(q.path, q.lines, project)
      files[ids[i]!] = file
      total += file.text.length
    }
    if (total > SHOW_ASK_MAX_CHARS) {
      throw new ShowFileError(`The shows in this ask come to more than ${count(SHOW_ASK_MAX_CHARS)} characters, Parley's limit for one ask; show less of each file with \`lines\`, or split the shows across asks`)
    }
  }
  return files
}

// The project directory as the cwd names it, and its real path: a cwd under a
// symlink (macOS's /var is /private/var) is still the project, and so is an
// absolute path through either one.
export interface Project {
  dir: string
  real: string
}

// `/` or the home directory means the client started Parley outside any
// project (Claude Desktop's chat runs it from `/`).
export async function projectRoot(projectDir: string): Promise<Project> {
  const dir = resolve(projectDir)
  const real = await realpath(dir).catch(() => dir)
  const home = await realpath(homedir()).catch(() => homedir())
  if (real === sep || real === home) {
    throw new ShowFileError("This client didn't start Parley in a project directory, so `path` isn't available here. Put the text in `content` instead.")
  }
  return { dir, real }
}

// Where a path really leads, under the project rules: inside the project
// before and after realpath, and not a secret by either name. `given` is the
// path relative to the project. Run again before an editable show's write, so
// a file swapped for a link out since the read is refused.
export async function locate(path: string, project: Project): Promise<{ real: string; given: string }> {
  const outside = () => new ShowFileError(`\`${path}\` is outside the project (\`${project.dir}\`); show files from inside it`)
  const absolute = resolve(project.dir, path)
  const given = [relative(project.dir, absolute), relative(project.real, absolute)].find((rel) => !escapes(rel))
  if (given === undefined) throw outside()
  refuseSecrets(path, given)

  let real: string
  try {
    real = await realpath(absolute)
  } catch {
    throw new ShowFileMissing(`\`${path}\` doesn't exist in the project (\`${project.dir}\`); check the path, or put the text in \`content\``)
  }
  const inside = relative(project.real, real)
  if (escapes(inside)) throw outside()
  // A link inside the project can still point at a secret.
  refuseSecrets(path, inside)
  return { real, given }
}

async function readOne(path: string, lines: [number, number] | undefined, project: Project): Promise<ShowFile> {
  const { real, given } = await locate(path, project)
  const info = await stat(real)
  if (info.isDirectory()) {
    throw new ShowFileError(`\`${path}\` is a directory; give a file in it, or put the text in \`content\``)
  }
  if (!info.isFile()) {
    throw new ShowFileError(`\`${path}\` isn't a regular file; give a text file, or put the text in \`content\``)
  }
  if (info.size > SHOW_FILE_MAX_BYTES) {
    throw new ShowFileError(`\`${path}\` is ${mb(info.size)}, over Parley's ${mb(SHOW_FILE_MAX_BYTES)} for a shown file; show a smaller file, or put an excerpt in \`content\``)
  }
  const bytes = await readFile(real)
  if (bytes.subarray(0, 8192).includes(0)) {
    throw new ShowFileError(`\`${path}\` looks like a binary file; Parley shows text files only, so give a text file, or describe it in \`content\``)
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  // As it is, line endings included.
  const whole = bytes.toString('utf8')
  const all = splitLines(whole)

  let text = whole
  let shown: [number, number] | undefined
  if (lines) {
    const [start, end] = lines
    if (start > all.length) {
      throw new ShowFileError(`\`${path}\` has ${count(all.length)} ${all.length === 1 ? 'line' : 'lines'}, so lines can't start at ${start}; pick a range inside it`)
    }
    shown = [start, Math.min(end, all.length)]
    text = all.slice(start - 1, shown[1]).join('')
  }
  if (text.length > SHOW_FILE_MAX_CHARS) {
    throw new ShowFileError(`\`${path}\` is ${count(text.length)} characters${lines ? ` in those lines` : ''}, over Parley's ${count(SHOW_FILE_MAX_CHARS)} for one show; show part of it with \`lines\``)
  }
  return {
    path: given.split(sep).join('/'),
    text,
    ...(shown && { lines: shown }),
    totalLines: all.length,
    sha256,
  }
}

function escapes(rel: string): boolean {
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

// By name, case-insensitive: env files, keys and certificates, credential
// files, and anything under .git or .ssh.
const SECRET_NAMES = [
  /^\.env$/, /^\.env\./,
  /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/,
  /^id_rsa/, /^id_ed25519/, /^id_ecdsa/,
  /^\.netrc$/, /^\.npmrc$/, /^\.pypirc$/,
]
const SECRET_DIRS = new Set(['.git', '.ssh'])

function refuseSecrets(path: string, rel: string) {
  const segments = rel.toLowerCase().split(sep)
  const name = segments.at(-1) ?? ''
  if (segments.slice(0, -1).some((s) => SECRET_DIRS.has(s)) || SECRET_DIRS.has(name) || SECRET_NAMES.some((re) => re.test(name))) {
    throw new ShowFileError(`Parley doesn't show \`${path}\`: it looks like it holds secrets`)
  }
}

// Lines with their endings, so slicing keeps the text as it is. An empty file
// has none; a last line without a newline still counts.
function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

function count(n: number): string {
  return n.toLocaleString('en-US')
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}
