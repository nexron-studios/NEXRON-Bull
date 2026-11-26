// Builds the signed Windows installer and attaches it to the release of the app's version, then
// rewrites that release's `latest.json`. `npm run release:windows [-- --dry-run]`; the dry run
// builds nothing and only says what it would upload.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPOSITORY, SIGNATURE_SUFFIX, windowsInstallerName } from './update-manifest.mjs'

const DRY_RUN_FLAG = '--dry-run'
const NSIS_BUNDLE_DIR = join('src-tauri', 'target', 'release', 'bundle', 'nsis')

const versionOfApp = () =>
  JSON.parse(readFileSync(join('src-tauri', 'tauri.conf.json'), 'utf8')).version

const gh = (args, options = {}) =>
  execFileSync('gh', [...args, '--repo', REPOSITORY], { encoding: 'utf8', ...options })

// `gh api` takes the repository in its path, not as --repo.
const hasRemoteTag = (tag) =>
  spawnSync('gh', ['api', `repos/${REPOSITORY}/git/ref/tags/${tag}`], { stdio: 'ignore' })
    .status === 0

const hasRelease = (tag) =>
  spawnSync('gh', ['release', 'view', tag, '--repo', REPOSITORY], { stdio: 'ignore' }).status === 0

const run = (command) => {
  const { status } = spawnSync(command, { shell: true, stdio: 'inherit' })
  if (status !== 0) process.exit(status ?? 1)
}

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const releaseWindows = (isDryRun) => {
  const version = versionOfApp()
  const tag = `v${version}`
  if (!hasRemoteTag(tag)) fail(`Tag ${tag} is not on GitHub yet: push it first.`)
  const installer = join(NSIS_BUNDLE_DIR, windowsInstallerName(version))
  const files = [installer, installer + SIGNATURE_SUFFIX]

  if (isDryRun) {
    console.log(`would build the app, then attach to ${tag}:`)
    for (const file of files) console.log(`  ${file}${existsSync(file) ? '' : ' (not built yet)'}`)
    console.log(hasRelease(tag) ? `release ${tag} exists` : `would draft release "Bull ${version}"`)
    console.log(`would rewrite latest.json of ${tag}`)
    return
  }

  run('npm run app:build')
  const missing = files.filter((file) => !existsSync(file))
  if (missing.length > 0) fail(`The build left out ${missing.join(', ')}`)
  // Same draft as release-unix.yml, whichever of the two comes first.
  if (!hasRelease(tag)) {
    gh([
      'release',
      'create',
      tag,
      '--draft',
      '--verify-tag',
      '--title',
      `Bull ${version}`,
      '--notes',
      ''
    ])
  }
  // --clobber replaces a rerun's own upload; the macOS files have other names.
  gh(['release', 'upload', tag, ...files, '--clobber'], { stdio: 'inherit' })
  run(`node scripts/write-update-manifest.mjs ${tag}`)
}

releaseWindows(process.argv.includes(DRY_RUN_FLAG))
