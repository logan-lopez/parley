import { describe, expect, it } from 'vitest'
import { fold, RETENTION_MS } from './persist'

const NOW = Date.UTC(2026, 9, 10, 12)
const DAY = 24 * 60 * 60 * 1000

function snap(id: string, patch: Record<string, unknown> = {}) {
  return JSON.stringify({
    v: 1,
    id,
    session: { id: 's', client: { name: 'claude-code' }, cwd: '/tmp/p', pid: 1 },
    form: { schema: { type: 'object', properties: {} } },
    createdAt: NOW - DAY,
    status: 'answered',
    endedAt: NOW - DAY,
    ...patch,
  })
}

describe('fold', () => {
  it('keeps the last line per id', () => {
    const text = [
      snap('a', { status: 'pending', endedAt: undefined }),
      snap('a', { status: 'answered', data: { q: 'yes' } }),
      snap('b', { status: 'dismissed' }),
    ].join('\n')
    const { records, bad } = fold(text, NOW)
    expect(bad).toBe(0)
    expect(records.map((r) => [r.id, r.status])).toEqual([['a', 'answered'], ['b', 'dismissed']])
    expect(records[0].data).toEqual({ q: 'yes' })
    expect(records[0]).not.toHaveProperty('v')
  })

  it('orders by last write, not first', () => {
    const text = [snap('a'), snap('b'), snap('a', { note: 'later' })].join('\n')
    expect(fold(text, NOW).records.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('drops records that ended over 30 days ago', () => {
    const old = NOW - RETENTION_MS - 1
    const text = [
      snap('old', { createdAt: old, endedAt: old }),
      snap('edge', { createdAt: NOW - RETENTION_MS, endedAt: NOW - RETENTION_MS }),
      // Created long ago, but it ended recently: kept.
      snap('slow', { createdAt: old, endedAt: NOW - DAY }),
    ].join('\n')
    expect(fold(text, NOW).records.map((r) => r.id)).toEqual(['edge', 'slow'])
  })

  it('drops an old record even if an earlier line for it was recent', () => {
    const old = NOW - RETENTION_MS - DAY
    const text = [snap('a', { endedAt: NOW }), snap('a', { endedAt: old })].join('\n')
    expect(fold(text, NOW).records).toEqual([])
  })

  it('loads pending records as orphaned, ended now', () => {
    const text = snap('p', { status: 'pending', endedAt: undefined, draft: { data: { q: 'half' }, note: 'wip' } })
    const [record] = fold(text, NOW).records
    expect(record).toMatchObject({
      status: 'orphaned',
      endedReason: 'disconnected',
      endedAt: NOW,
      draft: { data: { q: 'half' }, note: 'wip' },
    })
  })

  it('skips truncated, foreign and blank lines and counts them', () => {
    const good = snap('a')
    const text = [
      good,
      '',
      good.slice(0, 40),                    // a crash mid-write
      JSON.stringify({ v: 2, id: 'x' }),    // a future version
      '[1, 2]',
      snap('b').slice(0, -1),               // truncated last line
    ].join('\n')
    const { records, bad } = fold(text, NOW)
    expect(records.map((r) => r.id)).toEqual(['a'])
    expect(bad).toBe(4)
  })

  it('keeps the inline fields', () => {
    const text = snap('i', { inline: true, answeredIn: 'chat', status: 'dismissed', note: 'from the chat' })
    expect(fold(text, NOW).records[0]).toMatchObject({ inline: true, answeredIn: 'chat', status: 'dismissed', note: 'from the chat' })
  })

  it('handles an empty file', () => {
    expect(fold('', NOW)).toEqual({ records: [], bad: 0 })
  })
})
