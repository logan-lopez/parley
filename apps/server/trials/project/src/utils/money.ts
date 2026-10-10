export function toCents(dollars: string): number {
  return Math.round(Number(dollars) * 100)
}

export function fromCents(cents: number): string {
  const dollars = Math.trunc(cents / 100)
  const rest = Math.abs(cents % 100).toString().padStart(2, '0')
  return `$${dollars}.${rest}`
}

export function roundHalfEven(cents: number): number {
  const floor = Math.floor(cents)
  const diff = cents - floor
  if (diff !== 0.5) return Math.round(cents)
  return floor % 2 === 0 ? floor : floor + 1
}
