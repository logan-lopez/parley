// One-off: converted v0.1 exports (MM/DD/YYYY dates, amounts in cents) to the v0.2 format.
// Ran once in March; kept in case anyone still has old files.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseUsDate, toIsoDate } from '../src/utils/dates.ts'

const [input, output] = process.argv.slice(2)
const [header, ...lines] = readFileSync(input!, 'utf8').trim().split('\n')
const converted = lines.map((line) => {
  const [date, description, category, cents] = line.split(',')
  return [toIsoDate(parseUsDate(date!)), description, category, (Number(cents) / 100).toFixed(2)].join(',')
})
writeFileSync(output!, [header, ...converted].join('\n') + '\n')
