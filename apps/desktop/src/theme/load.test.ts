import { describe, expect, it } from 'vitest'
import claudeDark from './fixtures/claude-dark.yaml?raw'
import telnet from './fixtures/telnet.yaml?raw'
import type { ThemeDir, ThemeEntry, ThemeFs } from './load'
import { isBroken, loadThemes, pickThemes } from './load'
import { BUNDLED, BUNDLED_THEMES } from './paint'
import parleyDark from './themes/parley-dark.yaml?raw'

const DIRS: ThemeDir[] = [
  { path: '/inn', source: 'inn', label: 'inn themes' },
  { path: '/parley', source: 'yours', label: 'themes' },
]

/** Folders as maps of file name to text; a missing folder is absent. */
function memoryFs(folders: Record<string, Record<string, string>>): ThemeFs {
  return {
    list: async (dir) => (folders[dir] ? Object.keys(folders[dir]) : null),
    read: async (path) => {
      const at = path.lastIndexOf('/')
      const text = folders[path.slice(0, at)]?.[path.slice(at + 1)]
      if (text === undefined) throw new Error('No such file or directory (os error 2)')
      return text
    },
  }
}

const renamed = (text: string, name: string) => text.replace(/^name: .*$/m, `name: "${name}"`)
const ids = (entries: ThemeEntry[]) => entries.map((e) => [e.id, e.source])

describe('loadThemes', () => {
  it('lists bundled, then inn, then yours; later folders win on the same id', async () => {
    const fs = memoryFs({
      '/inn': { 'claude-dark.yaml': claudeDark, 'telnet.yaml': telnet, 'parley-dark.yaml': renamed(parleyDark, 'Inn Dark') },
      '/parley': { 'telnet.yaml': renamed(telnet, 'My Telnet'), 'notes.txt': 'skipped', 'Bad Name.yaml': 'skipped' },
    })
    const entries = await loadThemes(fs, DIRS, BUNDLED_THEMES)
    expect(ids(entries)).toEqual([
      ['parley-light', 'bundled'],
      ['parley-dark', 'inn'],
      ['claude-dark', 'inn'],
      ['telnet', 'yours'],
    ])
    expect(entries.find((e) => e.id === 'parley-dark')!.name).toBe('Inn Dark')
    expect(entries.find((e) => e.id === 'telnet')!.name).toBe('My Telnet')
  })

  it('treats a missing folder as none', async () => {
    const entries = await loadThemes(memoryFs({}), DIRS, BUNDLED_THEMES)
    expect(ids(entries)).toEqual([
      ['parley-light', 'bundled'],
      ['parley-dark', 'bundled'],
    ])
  })

  it('lists a broken file with its reason, naming its folder', async () => {
    const fs = memoryFs({ '/parley': { 'harbour.yaml': telnet.replace(/^ {2}base0D:.*\n/m, '') } })
    const entries = await loadThemes(fs, DIRS, BUNDLED_THEMES)
    const harbour = entries.find((e) => e.id === 'harbour')!
    expect(isBroken(harbour) && harbour.broken).toBe('themes/harbour.yaml: palette.base0D is missing')
  })

  it("names the file when it can't be read", async () => {
    const fs: ThemeFs = { list: async () => ['gone.yaml'], read: async () => Promise.reject(new Error('forbidden path')) }
    const entries = await loadThemes(fs, DIRS.slice(0, 1), BUNDLED_THEMES)
    const gone = entries.find((e) => e.id === 'gone')!
    expect(isBroken(gone) && gone.broken).toBe('inn themes/gone.yaml: forbidden path')
  })
})

describe('pickThemes', () => {
  it('shows a single id on both sides', async () => {
    const entries = await loadThemes(memoryFs({ '/inn': { 'claude-dark.yaml': claudeDark } }), DIRS, BUNDLED_THEMES)
    const { themes, problems } = pickThemes('claude-dark', entries, BUNDLED, DIRS)
    expect([themes.light.id, themes.dark.id]).toEqual(['claude-dark', 'claude-dark'])
    expect(problems).toEqual([])
  })

  it('falls back per side, and says why', async () => {
    const fs = memoryFs({ '/inn': { 'claude-dark.yaml': claudeDark }, '/parley': { 'broken.yaml': 'system: base99' } })
    const entries = await loadThemes(fs, DIRS, BUNDLED_THEMES)
    const pair = pickThemes({ light: 'missing', dark: 'claude-dark' }, entries, BUNDLED, DIRS)
    expect([pair.themes.light.id, pair.themes.dark.id]).toEqual(['parley-light', 'claude-dark'])
    expect(pair.problems).toEqual([
      { id: 'missing', appearance: 'light', reason: "there's no themes/missing.yaml or inn themes/missing.yaml" },
    ])
    const single = pickThemes('broken', entries, BUNDLED, DIRS)
    expect([single.themes.light.id, single.themes.dark.id]).toEqual(['parley-light', 'parley-dark'])
    expect(single.problems).toHaveLength(1)
    expect(single.problems[0]).toMatchObject({ id: 'broken', appearance: null })
    expect(single.problems[0]!.reason).toMatch(/^themes\/broken\.yaml: system must be/)
  })
})
