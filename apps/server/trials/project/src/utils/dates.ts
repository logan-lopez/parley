// Written for the v0.1 date format (MM/DD/YYYY). The CSV moved to ISO dates in v0.2.

export function parseUsDate(text: string): Date {
  const [month, day, year] = text.split('/').map(Number)
  return new Date(year!, month! - 1, day!)
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
