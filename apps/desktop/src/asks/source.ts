import type { SessionInfo } from '@parley/protocol'

// `client.name · basename(cwd)`, used in notifications and on the card.
export function sourceLabel(session: SessionInfo): string {
  const dir = session.cwd.split('/').filter(Boolean).pop() ?? session.cwd
  return `${session.client?.name ?? 'Unknown client'} · ${dir}`
}
