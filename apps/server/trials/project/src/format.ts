import { fromCents } from './utils/money.ts'
import { padLeft } from './utils/strings.ts'

export function formatTable(rows: [string, number][]): string {
  const width = Math.max(...rows.map(([label]) => label.length))
  return rows.map(([label, cents]) => `${label.padEnd(width)}  ${padLeft(fromCents(cents), 10)}`).join('\n')
}
