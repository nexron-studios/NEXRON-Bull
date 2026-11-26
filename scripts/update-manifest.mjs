// What installed copies of Bull read to find an update: Tauri's static `latest.json`, built from
// the assets of one GitHub release. Pure, so the spec can feed it a release without GitHub.
export const REPOSITORY = 'nexron-studios/NEXRON-Bull'
export const MANIFEST_NAME = 'latest.json'
export const SIGNATURE_SUFFIX = '.sig'
// release-unix.yml appends the macOS install help after this marker; the update dialog has no use
// for it.
const MACOS_INSTALL_MARKER = '<!-- macos-install -->'
// GitHub reports a draft's missing publish date as the zero time, which parses before 1970.
const EARLIEST_REAL_DATE_MS = 0

export const versionOfTag = (tag) => tag.replace(/^v/, '')

export const windowsInstallerName = (version) => `Bull_${version}_x64-setup.exe`

// One universal tarball serves both Mac processors.
export const macUpdaterName = (version) => `Bull_${version}_universal.app.tar.gz`

const PLATFORM_ARTIFACTS = [
  { platform: 'windows-x86_64', artifactNameOf: windowsInstallerName },
  { platform: 'darwin-aarch64', artifactNameOf: macUpdaterName },
  { platform: 'darwin-x86_64', artifactNameOf: macUpdaterName }
]

export const assetUrlOf = (tag, assetName) =>
  `https://github.com/${REPOSITORY}/releases/download/${tag}/${assetName}`

export const notesOf = (body) => (body ?? '').split(MACOS_INSTALL_MARKER)[0].trim()

const isRealDate = (date) => typeof date === 'string' && Date.parse(date) > EARLIEST_REAL_DATE_MS

// The artifacts on the release that have their signature next to them; only those can update.
export const signedArtifactsOf = (tag, assetNames) => {
  const version = versionOfTag(tag)
  const present = new Set(assetNames)
  const names = PLATFORM_ARTIFACTS.map(({ artifactNameOf }) => artifactNameOf(version))
  return [...new Set(names)].filter(
    (name) => present.has(name) && present.has(name + SIGNATURE_SUFFIX)
  )
}

// `signatures` maps an artifact name to the text of its `.sig`; artifacts without one are left out.
export const buildUpdateManifest = ({ tag, body, publishedAt, signatures }) => {
  const version = versionOfTag(tag)
  const platforms = {}
  for (const { platform, artifactNameOf } of PLATFORM_ARTIFACTS) {
    const artifactName = artifactNameOf(version)
    const signature = signatures[artifactName]
    if (signature === undefined) continue
    platforms[platform] = { signature: signature.trim(), url: assetUrlOf(tag, artifactName) }
  }
  return {
    version,
    notes: notesOf(body),
    // A draft has no date yet; publishing it rewrites the manifest with one (update-manifest.yml).
    ...(isRealDate(publishedAt) ? { pub_date: publishedAt } : {}),
    platforms
  }
}
