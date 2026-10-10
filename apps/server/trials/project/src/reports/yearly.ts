import type { Ledger } from '../ledger.ts'
import { formatTable } from '../format.ts'

// Started alongside monthly.ts; never wired in.
export function yearlyReport(ledger: Ledger): string {
  const totals = new Map<string, number>()
  for (const [month, cents] of ledger.byMonth()) {
    const year = month.slice(0, 4)
    totals.set(year, (totals.get(year) ?? 0) + cents)
  }
  return formatTable([...totals])
}
