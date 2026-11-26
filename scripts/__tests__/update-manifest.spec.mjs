import { describe, expect, it } from 'vitest'
import { buildUpdateManifest, notesOf, signedArtifactsOf } from '../update-manifest.mjs'

const TAG = 'v1.2.3'
const BODY = 'Faster tabs.\n\n<!-- macos-install -->\n## macOS\n\nDrag Bull into Applications.\n'
const PUBLISHED_AT = '2026-11-26T08:59:22Z'
const WINDOWS_SIGNATURE = 'd2luZG93cy1zaWc=\n'
const MAC_SIGNATURE = 'bWFjLXNpZw=='
const DOWNLOADS = 'https://github.com/nexron-studios/NEXRON-Bull/releases/download/v1.2.3'

describe('notesOf', () => {
  it('drops the macOS install section', () => {
    expect(notesOf(BODY)).toBe('Faster tabs.')
  })

  it('reads a missing body as no notes', () => {
    expect(notesOf(null)).toBe('')
  })
})

describe('signedArtifactsOf', () => {
  it('lists only artifacts whose signature is on the release', () => {
    const assetNames = [
      'Bull_1.2.3_x64-setup.exe',
      'Bull_1.2.3_x64-setup.exe.sig',
      'Bull_1.2.3_universal.app.tar.gz',
      'Bull_1.2.3_universal.dmg',
      'agentd-x86_64-unknown-linux-musl'
    ]

    expect(signedArtifactsOf(TAG, assetNames)).toEqual(['Bull_1.2.3_x64-setup.exe'])
  })
})

describe('buildUpdateManifest', () => {
  it('points every platform at its signed artifact', () => {
    const manifest = buildUpdateManifest({
      tag: TAG,
      body: BODY,
      publishedAt: PUBLISHED_AT,
      signatures: {
        'Bull_1.2.3_x64-setup.exe': WINDOWS_SIGNATURE,
        'Bull_1.2.3_universal.app.tar.gz': MAC_SIGNATURE
      }
    })

    expect(manifest).toEqual({
      version: '1.2.3',
      notes: 'Faster tabs.',
      pub_date: '2026-11-26T08:59:22Z',
      platforms: {
        'windows-x86_64': {
          signature: 'd2luZG93cy1zaWc=',
          url: `${DOWNLOADS}/Bull_1.2.3_x64-setup.exe`
        },
        'darwin-aarch64': {
          signature: 'bWFjLXNpZw==',
          url: `${DOWNLOADS}/Bull_1.2.3_universal.app.tar.gz`
        },
        'darwin-x86_64': {
          signature: 'bWFjLXNpZw==',
          url: `${DOWNLOADS}/Bull_1.2.3_universal.app.tar.gz`
        }
      }
    })
  })

  it('leaves out platforms without a signature and the date of a draft', () => {
    const manifest = buildUpdateManifest({
      tag: TAG,
      body: '',
      publishedAt: '0001-01-01T00:00:00Z',
      signatures: { 'Bull_1.2.3_x64-setup.exe': WINDOWS_SIGNATURE }
    })

    expect(manifest).toEqual({
      version: '1.2.3',
      notes: '',
      platforms: {
        'windows-x86_64': {
          signature: 'd2luZG93cy1zaWc=',
          url: `${DOWNLOADS}/Bull_1.2.3_x64-setup.exe`
        }
      }
    })
  })
})
