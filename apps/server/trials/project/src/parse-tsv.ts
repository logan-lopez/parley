// The v0.1 parser, for tab-separated exports. v0.2 switched to CSV (parse.ts).
import type { Entry } from './parse.ts'

export function parseTsv(text: string): Entry[] {
  return text.trim().split('\n').slice(1).map((line) => {
    const [date, description, category, cents] = line.split('\t')
    return { date: date!, description: description!, category: category!, cents: Number(cents) }
  })
}
