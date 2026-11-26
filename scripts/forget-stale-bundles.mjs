// Runs after `tauri build` on macOS. Building the DMG mounts the app on a temporary volume
// (/Volumes/dmg.XXXX), and LaunchServices keeps that copy registered after it is unmounted.
// Notifications go out under Bull's bundle id, so macOS may pick a vanished copy for the icon
// and show none. This removes every registered copy but the installed one: DMG mounts, build
// output, copies in temp folders. A forgotten copy still opens; launching it registers it again.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
// /Applications or ~/Applications, where an installed Bull lives.
const APPLICATIONS_SEGMENT = '/Applications/'
const RECORD_SEPARATOR = /^-{80}$/m
// The dump lists 'key:   value', a path followed by its record id, e.g. '/x/NEXRON-Bull.app (0x3134)'.
const FIELD_VALUE = (key) => new RegExp(`^${key}:\\s+(.+?)(?:\\s+\\(0x[0-9a-f]+\\))?$`, 'm')
// A full dump of a busy machine runs past Node's default 1 MB buffer.
const DUMP_BUFFER_BYTES = 256 * 1024 * 1024

const bundleIdOf = () => JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).identifier

const registeredPathsOf = (bundleId) =>
  execFileSync(LSREGISTER, ['-dump'], { encoding: 'utf8', maxBuffer: DUMP_BUFFER_BYTES })
    .split(RECORD_SEPARATOR)
    .filter((record) => record.match(FIELD_VALUE('identifier'))?.[1] === bundleId)
    .map((record) => record.match(FIELD_VALUE('path'))?.[1])
    .filter((path) => path !== undefined)

const isInstalled = (path) => path.includes(APPLICATIONS_SEGMENT) && existsSync(path)

const forgetStaleBundles = () => {
  if (process.platform !== 'darwin') return
  const stale = [...new Set(registeredPathsOf(bundleIdOf()).filter((path) => !isInstalled(path)))]
  for (const path of stale) {
    execFileSync(LSREGISTER, ['-u', path])
    console.log(`forgot ${path}`)
  }
}

forgetStaleBundles()
