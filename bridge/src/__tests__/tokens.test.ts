import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { createToken, isKnownToken, loadTokenHashes } from '../tokens.ts'

const folder = await mkdtemp(join(tmpdir(), 'bull-bridge-'))
after(() => rm(folder, { recursive: true, force: true }))

describe('device tokens', () => {
  it('should know a made token and nothing else', async () => {
    const file = join(folder, 'known', 'bridge-tokens')
    const phone = await createToken(file, 'phone')
    const tablet = await createToken(file, 'tablet')

    const hashes = await loadTokenHashes(file)

    assert.equal(hashes.length, 2)
    assert.equal(isKnownToken(hashes, phone), true)
    assert.equal(isKnownToken(hashes, tablet), true)
    assert.equal(isKnownToken(hashes, `${phone}x`), false)
    assert.equal(isKnownToken(hashes, ''), false)
  })

  it('should store only the hash, never the token', async () => {
    const file = join(folder, 'hash-only')
    const token = await createToken(file, 'phone')

    const stored = await readFile(file, 'utf8')

    assert.equal(stored.includes(token), false)
    assert.match(stored, /^[0-9a-f]{64} phone\n$/)
  })

  it('should lock a device out once its line is gone', async () => {
    const file = join(folder, 'revoked')
    const token = await createToken(file, 'phone')
    await writeFile(file, '')

    assert.equal(isKnownToken(await loadTokenHashes(file), token), false)
  })

  it('should fail on a line that is not a token', async () => {
    const file = join(folder, 'broken')
    await writeFile(file, 'hunter2\n')
    await assert.rejects(loadTokenHashes(file), /line 1/)
  })

  it('should refuse a device name ssh or a shell could misread', async () => {
    await assert.rejects(createToken(join(folder, 'names'), 'my phone'), /device name/)
  })
})
