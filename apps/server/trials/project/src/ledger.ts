import type { Entry } from './parse.ts'

export class Ledger {
  private entries: Entry[]

  constructor(entries: Entry[]) {
    this.entries = entries
  }

  add(entry: Entry) {
    this.entries.push(entry)
  }

  total(): number {
    return this.entries.reduce((sum, e) => sum + e.cents, 0)
  }

  // Sorted by spend, largest first.
  byCategory(): [string, number][] {
    const totals = new Map<string, number>()
    for (const e of this.entries) totals.set(e.category, (totals.get(e.category) ?? 0) + e.cents)
    return [...totals].sort((a, b) => b[1] - a[1])
  }

  byMonth(): [string, number][] {
    const totals = new Map<string, number>()
    for (const e of this.entries) {
      const month = e.date.slice(0, 7)
      totals.set(month, (totals.get(month) ?? 0) + e.cents)
    }
    return [...totals].sort((a, b) => a[0].localeCompare(b[0]))
  }

  largest(n: number): Entry[] {
    return [...this.entries].sort((a, b) => b.cents - a.cents).slice(0, n)
  }
}
