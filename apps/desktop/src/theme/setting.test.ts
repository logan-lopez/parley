import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_SETTING, parseThemeSetting, resolveThemeSetting } from './setting'
import { parseSettingsFile } from './settings'

describe('parseThemeSetting', () => {
  it('takes a theme id', () => {
    expect(parseThemeSetting('claude-dark')).toEqual({ ok: true, setting: 'claude-dark' })
  })

  it('takes a light/dark pair', () => {
    expect(parseThemeSetting({ light: 'claude-light', dark: 'claude-dark' })).toEqual({
      ok: true,
      setting: { light: 'claude-light', dark: 'claude-dark' },
    })
  })

  it('means the default pair when missing', () => {
    expect(parseThemeSetting(undefined)).toEqual({ ok: true, setting: { light: 'parley-light', dark: 'parley-dark' } })
  })

  it('refuses a pair missing a side', () => {
    expect(parseThemeSetting({ light: 'claude-light' })).toEqual({
      ok: false,
      problem: '"theme" needs both "light" and "dark"; "dark" is missing',
    })
  })

  it('refuses extra keys', () => {
    const result = parseThemeSetting({ light: 'a', dark: 'b', auto: 'c' })
    expect(result).toEqual({ ok: false, problem: '"theme" takes only "light" and "dark", not "auto"' })
  })

  it('refuses a number, a bad id and a bad side', () => {
    expect(parseThemeSetting(3).ok).toBe(false)
    expect(parseThemeSetting(null).ok).toBe(false)
    expect(parseThemeSetting(['a']).ok).toBe(false)
    expect(parseThemeSetting('Claude Dark').ok).toBe(false)
    expect(parseThemeSetting({ light: 'a', dark: 7 }).ok).toBe(false)
  })
})

describe('resolveThemeSetting', () => {
  it('picks the side for the appearance', () => {
    const pair = { light: 'claude-light', dark: 'claude-dark' }
    expect(resolveThemeSetting(pair, 'light')).toBe('claude-light')
    expect(resolveThemeSetting(pair, 'dark')).toBe('claude-dark')
  })

  it('ignores the appearance for a single id', () => {
    expect(resolveThemeSetting('telnet', 'light')).toBe('telnet')
    expect(resolveThemeSetting('telnet', 'dark')).toBe('telnet')
  })
})

describe('parseSettingsFile', () => {
  it('is no settings when the file is missing', () => {
    expect(parseSettingsFile(null)).toEqual({ setting: DEFAULT_THEME_SETTING, problems: [] })
  })

  it('reads theme', () => {
    expect(parseSettingsFile('{ "theme": "telnet" }')).toEqual({ setting: 'telnet', problems: [] })
  })

  it('lists an unknown key and keeps the theme', () => {
    expect(parseSettingsFile('{ "theme": "telnet", "thme": "x" }')).toEqual({
      setting: 'telnet',
      problems: ['settings.json: unknown key "thme"'],
    })
  })

  it('shows the default pair for a file that isn’t JSON, or a bad theme', () => {
    const notJson = parseSettingsFile('{ theme: telnet }')
    expect(notJson.setting).toEqual(DEFAULT_THEME_SETTING)
    expect(notJson.problems[0]).toMatch(/^settings\.json isn't JSON: /)
    expect(parseSettingsFile('[]').problems).toEqual(['settings.json must be a JSON object'])
    expect(parseSettingsFile('{ "theme": 3 }')).toEqual({
      setting: DEFAULT_THEME_SETTING,
      problems: ['settings.json: "theme" must be a theme id, or { "light": "<id>", "dark": "<id>" }, got 3'],
    })
  })
})
