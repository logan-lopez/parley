export function padLeft(text: string, width: number): string {
  return text.padStart(width)
}

export function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
