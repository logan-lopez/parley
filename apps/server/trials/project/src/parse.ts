import { toCents } from './utils/money.ts'

export interface Entry {
  date: string
  description: string
  category: string
  cents: number
}

export function parseCsv(text: string): Entry[] {
  const [, ...lines] = text.trim().split('\n')
  return lines.map(parseLine)
}

export function parseLine(line: string): Entry {
  const [date, description, category, amount] = line.split(',')
  return { date: date!, description: description!, category: category!, cents: toCents(amount!) }
}
