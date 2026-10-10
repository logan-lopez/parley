import { readFileSync } from 'node:fs'
import { parseCsv } from './parse.ts'
import { Ledger } from './ledger.ts'
import { formatTable } from './format.ts'

const [file, ...rest] = process.argv.slice(2)
if (!file) {
  console.error('usage: tally <file.csv> [--by category]')
  process.exit(2)
}

const ledger = new Ledger(parseCsv(readFileSync(file, 'utf8')))

if (rest[0] === '--by' && rest[1] === 'category') {
  console.log(formatTable(ledger.byCategory()))
} else {
  console.log(formatTable([['total', ledger.total()]]))
}
