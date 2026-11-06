// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileQuestions, askInputSchema } from '@parley/protocol/ask'
import AskCard from './AskCard.vue'

vi.mock('../forms/theme-watch', () => ({ onThemeChange: () => () => {}, previewTheme: vi.fn() }))
vi.mock('../platform', () => ({ mediaUrls: vi.fn(async () => new Map()), openMedia: vi.fn(), copyText: vi.fn(), openExternal: vi.fn() }))
vi.mock('../forms/player', async (original) => {
  const actual = await original<typeof import('../forms/player')>()
  const audio = { play: () => Promise.resolve(), pause() {}, src: '', currentTime: 0, preload: '', onended: null, onerror: null }
  return { ...actual, player: actual.createPlayer(() => audio as unknown as HTMLAudioElement) }
})
const form = compileQuestions(askInputSchema.parse({ questions: [
  { header: 'Commit', question: 'Commit?', options: [{ label: 'Yes (Recommended)' }, { label: 'No' }] },
  { header: 'Port', question: 'Which port?', type: 'number', min: 1, max: 10 },
] }))
let root: HTMLElement
let app: App | undefined
let now: number
const stamped = vi.fn()
const settle = async () => { for (let i = 0; i < 5; i++) await nextTick() }
function mount(data: unknown = { port: 5 }, extra = {}) {
  app = createApp({ render: () => h(AskCard, { form, source: 'test', createdAt: Date.now(), initialData: data, onStamp: stamped, ...extra }) })
  app.mount(root)
}
function button() { return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Stamp')! }
function click(detail = 1) { button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail })) }
beforeEach(() => {
  root = document.createElement('div')
  document.body.append(root)
  now = 0
  stamped.mockClear()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Element.prototype.scrollTo = vi.fn()
})
afterEach(() => { app?.unmount(); app = undefined; root.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Stamp on the card', () => {
  it('fills choices while keeping answers, note and remember, without taking focus', async () => {
    mount({ port: 5 }, { initialNote: 'ok', initialRemember: ['commit'] })
    await settle()
    now = 600
    const focused = document.activeElement
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    button().dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(focused)
    expect(button().tabIndex).toBe(-1)
    click()
    expect(stamped).toHaveBeenCalledWith({ port: 5, commit: 'Yes (Recommended)' }, 'ok', ['commit'])
  })
  it('ignores synthetic and keyboard clicks and the first 500 ms after mounting the next card', async () => {
    mount()
    await settle()
    now = 400
    click()
    expect(stamped).not.toHaveBeenCalled()
    now = 600
    button().click()
    click(0)
    expect(stamped).not.toHaveBeenCalled()
    click()
    expect(stamped).toHaveBeenCalledTimes(1)
    app!.unmount()
    now = 650
    mount()
    await settle()
    now = 700
    click(2)
    expect(stamped).toHaveBeenCalledTimes(1)
  })
  it.each([{}, { port: 20 }])('blocks required or invalid answers that Stamp cannot fill: %j', async (data) => {
    mount(data)
    await settle()
    now = 600
    expect(button().disabled).toBe(true)
    expect(button().title).toContain('Port')
    click()
    expect(stamped).not.toHaveBeenCalled()
  })
  it('blocks answers against the recommendation', async () => {
    mount({ port: 5, commit: 'No' })
    await settle()
    expect(button().disabled).toBe(true)
    expect(button().title).toBe('You chose differently on: Commit')
  })
  it.each([{ readonly: true }, { withdrawn: 'Ended' }])('hides Stamp on locked cards: %j', async (props) => {
    mount({}, props)
    await settle()
    expect(button()).toBeUndefined()
  })
  it('hides Stamp without a recommendation', async () => {
    mount({}, { form: compileQuestions(askInputSchema.parse({ questions: [{ header: 'Go', question: 'Go?', type: 'boolean' }] })) })
    await settle()
    expect(button()).toBeUndefined()
  })
})
