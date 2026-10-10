// Superseded by src/format.ts.
export function formatRows(rows: { label: string; amount: number }[]): string {
  let out = ''
  for (const row of rows) out += row.label + '\t' + (row.amount / 100).toFixed(2) + '\n'
  return out
}
