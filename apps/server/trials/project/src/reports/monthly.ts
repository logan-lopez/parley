import type { Ledger } from '../ledger.ts'
import { formatTable } from '../format.ts'

// Not wired into the CLI yet.
export function monthlyReport(ledger: Ledger): string {
  return formatTable(ledger.byMonth())
}
