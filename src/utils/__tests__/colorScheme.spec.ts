import { describe, expect, it } from 'vitest'
import { contrastOf, mixHex, shiftUntilContrast } from '../color'
import {
  COLOR_SCHEME_CSS_STORAGE_KEY,
  COLOR_SCHEME_STYLE_ID,
  brandTokensOf,
  bullIconUrlOf,
  colorSchemeCssOf,
  colorSchemePresetOf
} from '../colorScheme'
import indexHtml from '../../../index.html?raw'
import faviconSvg from '../../../public/favicon.svg?raw'

describe('color', () => {
  it('should mix two colours by the given share', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('should measure black on white as 21:1', () => {
    expect(contrastOf('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('should keep a colour that already reaches the contrast', () => {
    expect(shiftUntilContrast('#000000', '#ffffff', '#ffffff', 4.5)).toBe('#000000')
  })
})

describe('brandTokensOf', () => {
  it('should give white text on brand-strong at least 4.5:1 for a light accent', () => {
    const tokens = brandTokensOf('#1fa9bd', 'dark')
    expect(tokens.brand).toBe('#1fa9bd')
    expect(contrastOf(tokens['brand-strong'], '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('should give links at least 4.5:1 on the page background in both modes', () => {
    const light = brandTokensOf('#2fa36b', 'light')
    const dark = brandTokensOf('#2fa36b', 'dark')
    expect(contrastOf(light.link, '#f7f6f3')).toBeGreaterThanOrEqual(4.5)
    expect(contrastOf(dark.link, '#0e0e0f')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('colorSchemeCssOf', () => {
  it('should override nothing for Night Desk', () => {
    expect(colorSchemeCssOf('night-desk')).toBe('')
  })

  it('should override the brand in both modes for another preset', () => {
    const css = colorSchemeCssOf('rose')
    expect(css.startsWith('html:not(.dark){--brand:#e0527f;')).toBe(true)
    expect(css).toContain('html.dark{--brand:#e0527f;')
  })
})

describe('colorSchemePresetOf', () => {
  it('should read a stored preset', () => {
    expect(colorSchemePresetOf('violet')).toBe('violet')
  })

  it('should read a preset stored by the first colour schemes', () => {
    expect(colorSchemePresetOf({ kind: 'preset', preset: 'teal' })).toBe('teal')
  })

  it('should fall back to Night Desk for an own colour, an unknown preset or nothing', () => {
    expect(colorSchemePresetOf({ kind: 'custom', accent: '#123456' })).toBe('night-desk')
    expect(colorSchemePresetOf('neon')).toBe('night-desk')
    expect(colorSchemePresetOf(null)).toBe('night-desk')
  })
})

describe('index.html', () => {
  it('should put up the stored scheme sheet before first paint under the same names', () => {
    expect(indexHtml).toContain(`localStorage.getItem('${COLOR_SCHEME_CSS_STORAGE_KEY}')`)
    expect(indexHtml).toContain(`style.id = '${COLOR_SCHEME_STYLE_ID}'`)
  })
})

describe('bullIconUrlOf', () => {
  const decode = (url: string) => decodeURIComponent(url.replace('data:image/svg+xml,', ''))

  it('should paint the bull of favicon.svg in the accent', () => {
    const svg = decode(bullIconUrlOf(faviconSvg, '#e0457b'))
    expect(svg.match(/fill="#[0-9a-f]{6}"/gi)).toEqual(['fill="#e0457b"'])
  })

  it('should keep the rest of the drawing as it is', () => {
    const svg = decode(bullIconUrlOf(faviconSvg, '#e0457b'))
    expect(svg.replace('#e0457b', '#4d7cff')).toBe(faviconSvg)
  })

  it('should hand out an SVG data URL', () => {
    expect(bullIconUrlOf('<svg fill="#000000"/>', '#ffffff')).toBe(
      'data:image/svg+xml,%3Csvg%20fill%3D%22%23ffffff%22%2F%3E'
    )
  })
})
