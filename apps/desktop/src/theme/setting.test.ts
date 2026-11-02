import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_SETTING, parseThemeSetting, resolveThemeSetting } from './setting'
import { DEFAULT_SOUND, parseAutoplaySetting, parseSettingsFile, soundNames, soundProblem } from './settings'

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
    expect(parseSettingsFile(null)).toEqual({ theme: DEFAULT_THEME_SETTING, sound: DEFAULT_SOUND, autoplay: false, problems: [] })
  })

  it('reads theme and sound', () => {
    expect(parseSettingsFile('{ "theme": "telnet" }')).toEqual({ theme: 'telnet', sound: 'default', autoplay: false, problems: [] })
    expect(parseSettingsFile('{ "theme": "telnet", "sound": "Glass" }')).toEqual({
      theme: 'telnet',
      sound: 'Glass',
      autoplay: false,
      problems: [],
    })
    expect(parseSettingsFile('{ "sound": null }').sound).toBeNull()
  })

  it('lists an unknown key and keeps the theme', () => {
    expect(parseSettingsFile('{ "theme": "telnet", "thme": "x" }')).toEqual({
      theme: 'telnet',
      sound: DEFAULT_SOUND,
      autoplay: false,
      problems: ['settings.json: unknown key "thme"'],
    })
  })

  it('shows the default pair for a file that isn’t JSON, or a bad theme', () => {
    const notJson = parseSettingsFile('{ theme: telnet }')
    expect(notJson.theme).toEqual(DEFAULT_THEME_SETTING)
    expect(notJson.problems[0]).toMatch(/^settings\.json isn't JSON: /)
    expect(parseSettingsFile('[]').problems).toEqual(['settings.json must be a JSON object'])
    expect(parseSettingsFile('{ "theme": 3 }')).toEqual({
      theme: DEFAULT_THEME_SETTING,
      sound: DEFAULT_SOUND,
      autoplay: false,
      problems: ['settings.json: "theme" must be a theme id, or { "light": "<id>", "dark": "<id>" }, got 3'],
    })
  })

  it('plays the default sound for a bad sound, and keeps the theme', () => {
    for (const sound of ['false', '""', '3']) {
      const parsed = parseSettingsFile(`{ "theme": "telnet", "sound": ${sound} }`)
      expect(parsed.theme).toBe('telnet')
      expect(parsed.sound).toBe(DEFAULT_SOUND)
      expect(parsed.problems).toEqual([`settings.json: "sound" must be a sound's name, "default", or null, got ${sound}`])
    }
  })
})

describe('autoplay', () => {
  it('is off unless the file says true', () => {
    expect(parseSettingsFile(null).autoplay).toBe(false)
    expect(parseSettingsFile('{}').autoplay).toBe(false)
    expect(parseSettingsFile('{ "autoplay": false }').autoplay).toBe(false)
    expect(parseSettingsFile('{ "autoplay": true }')).toMatchObject({ autoplay: true, problems: [] })
  })

  it('falls back to off for a bad value, with the banner message, and keeps the other keys', () => {
    for (const value of ['"yes"', '1', 'null', '[]']) {
      const parsed = parseSettingsFile(`{ "theme": "telnet", "autoplay": ${value} }`)
      expect(parsed.autoplay).toBe(false)
      expect(parsed.theme).toBe('telnet')
      expect(parsed.problems).toEqual([`settings.json: "autoplay" must be true or false, got ${value}`])
    }
    expect(parseAutoplaySetting('true')).toEqual({ ok: false, problem: '"autoplay" must be true or false, got "true"' })
  })
})

describe('sounds', () => {
  it('names the audio files in a folder', () => {
    expect(soundNames(['Glass.aiff', 'Chime.wav', 'Bell.caf', 'notes.txt', '.DS_Store', 'Old.AIF'])).toEqual([
      'Glass',
      'Chime',
      'Bell',
      'Old',
    ])
  })

  it('reports a name no folder has, matching without case', () => {
    expect(soundProblem('glass', ['Glass'])).toBeNull()
    expect(soundProblem('default', [])).toBeNull()
    expect(soundProblem(null, [])).toBeNull()
    expect(soundProblem('Glsas', ['Glass'])).toBe(
      'settings.json: no sound "Glsas" in ~/Library/Sounds, /Library/Sounds, /System/Library/Sounds',
    )
  })
})
