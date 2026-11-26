// Writes `latest.json` for one release and attaches it there:
// `node scripts/write-update-manifest.mjs <tag> [--dry-run]`. Safe to rerun: it reads the
// release as it is now and replaces the previous manifest. --dry-run prints it instead.
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MANIFEST_NAME,
  REPOSITORY,
  SIGNATURE_SUFFIX,
  buildUpdateManifest,
  signedArtifactsOf
} from './update-manifest.mjs'

const DRY_RUN_FLAG = '--dry-run'

const gh = (args) => execFileSync('gh', [...args, '--repo', REPOSITORY], { encoding: 'utf8' })

const releaseOf = (tag) =>
  JSON.parse(gh(['release', 'view', tag, '--json', 'assets,body,publishedAt']))

const signatureOf = (tag, artifactName) =>
  gh(['release', 'download', tag, '--pattern', artifactName + SIGNATURE_SUFFIX, '--output', '-'])

const uploadManifest = (tag, manifest) => {
  const dir = mkdtempSync(join(tmpdir(), 'bull-manifest-'))
  const file = join(dir, MANIFEST_NAME)
  try {
    writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
    gh(['release', 'upload', tag, file, '--clobber'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const writeUpdateManifest = (tag, isDryRun) => {
  const release = releaseOf(tag)
  const assetNames = release.assets.map((asset) => asset.name)
  const signatures = Object.fromEntries(
    signedArtifactsOf(tag, assetNames).map((name) => [name, signatureOf(tag, name)])
  )
  const { body, publishedAt } = release
  const manifest = buildUpdateManifest({ tag, body, publishedAt, signatures })
  const platforms = Object.keys(manifest.platforms)
  console.log(JSON.stringify(manifest, null, 2))
  if (isDryRun) return
  // An empty manifest would only turn "no update" into an error in every installed copy.
  if (platforms.length === 0) {
    console.log(`${tag} has no signed installer yet; ${MANIFEST_NAME} left as it is`)
    return
  }
  uploadManifest(tag, manifest)
  console.log(`attached ${MANIFEST_NAME} to ${tag}: ${platforms.join(', ')}`)
}

const [tag] = process.argv.slice(2).filter((arg) => arg !== DRY_RUN_FLAG)
if (!tag) {
  console.error(`usage: node scripts/write-update-manifest.mjs <tag> [${DRY_RUN_FLAG}]`)
  process.exit(1)
}
writeUpdateManifest(tag, process.argv.includes(DRY_RUN_FLAG))
