# Bull (repo nexron-chat)

Desktop app (Tauri 2 + Vue 3) that shows Claude Code sessions as a chat in tabs,
on this machine and later on other machines over SSH. Claude runs headless
(`claude -p` with stream-json); the Rust crate `agentd/` starts and drives it.

Plan and decisions: Obsidian vault, `Projects/NEXRON Chat.md` and
`Projects/NEXRON Chat Plan.md`.

## Start

- `npm run app:dev`: Tauri window, Vite on port **1460** (HMR 1461, `strictPort`).
- `npm test` (Vitest), `npm run test:rust` (agentd with the fake Claude),
  `npm run build`, `npm run format:check`.

## Layout

- `agentd/`: library + binary with three modes: `serve` (background server that owns
  Claude), `connect` (relays stdin/stdout to it, starting it if needed) and `stdio` (one
  client on stdin/stdout; the integration tests use it).
- `src-tauri/`: Tauri shell. `agentd_request(line, machine)` goes to `agentd connect`: a
  local child process for this machine (`machine` empty), `ssh -T` for a machine from Bull's own
  list in `%USERPROFILE%\.nexron-chat\machines.json` (`src-tauri/src/machines.rs`, window event
  `agentd`). The first `list_machines` adopts the `~/.ssh/config` hosts that answer as Bull
  machines; after that `~/.ssh/config` only feeds the suggestions of the setup assistant
  (`src-tauri/src/machine_setup.rs`: `test_machine`, `install_agentd`). `build.rs` builds agentd
  (release) into `src-tauri/binaries/` as the sidecar (`bundle.externalBin`); tauri-build puts it next to the app exe.
- `src/`: Vue frontend.

## This machine and other machines

Claude outlives the app on every machine: `agentd serve` runs in the background (localhost
port 14620, token in `%USERPROFILE%\.nexron-chat\agentd-14620.token`), and the app reattaches
to running tabs on start and after a dropped connection. `connect` starts the server from its
own exe; on Windows through WMI, because Windows' OpenSSH ends every process the SSH session
started; on macOS and Linux in its own session (`setsid`). There the server first asks the
user's login shell for its PATH (`agentd/src/login_path.rs`), since neither `ssh -T` nor an app
opened from the Finder has it and `claude` would not be found. The server exits about 30 s after
the last tab there stopped and no app is connected.

On this machine the app copies its sidecar to `%USERPROFILE%\.nexron-chat\agentd.exe`
(Mac: `~/.nexron-chat/agentd`) when it differs and starts `connect` from there
(`src-tauri/src/local_agentd.rs`), so a rebuild or an app update never hits the exe a running
server locks. While an older server still runs, the copy fails and the app keeps using it
(warning on stderr); a new agentd takes over once that server exited idle.

Claude itself runs from a copy as well (`agentd/src/claude_copy.rs`, Windows only): one per
version in `%USERPROFILE%\.nexron-chat\claude\<version>\`, so tabs never lock the installed
`claude.exe` and Claude Code updates keep working while Bull runs. A tab keeps its version until
it restarts; each start removes older copies no tab runs anymore. Tabs from a copy run with
`DISABLE_AUTOUPDATER=1`: the install updates from the terminal, never from a copy.
`AGENTD_CLAUDE` is used as it is, without a copy.

Other machines run Windows, macOS or Linux. The first ssh call of every check is `uname -sm`
(cmd and PowerShell fail it); `machines.json` keeps the result as `os` (`windows`, `macos`,
`linux`; missing counts as Windows), and `src-tauri/src/machine_os.rs` holds the line each
system gets: `cmd /d /c .nexron-chat\agentd.exe connect` on Windows, because the PowerShell
login shell passes only the first stdin line to a script; `sh -c '"$HOME/.nexron-chat/agentd"
connect'` elsewhere, whatever the login shell is.

On another machine, after changing `agentd/`, install it again: Settings › Machines › Check ›
"Install agentd again". It refuses while chats run there, stops the idle agentd, keeps the old
one as `agentd.old.exe` / `agentd.old` and checks `hello` afterwards. A Windows app copies its own
sidecar to a Windows machine; every other pairing has the machine download `agentd-<target>`
from the GitHub release of the app's own version (`curl` to a temporary name, then renamed), so
a Mac or Linux machine needs a released version. `powershell -File scripts/deploy-agentd.ps1
<host>` does the same from a fresh build (Windows) or from the release or `-Binary` (macOS,
Linux). It lands in `%USERPROFILE%\.nexron-chat\agentd.exe` or `~/.nexron-chat/agentd`.

## Releases

The Windows installer is built here (`npm run app:build`) and uploaded by hand.
`.github/workflows/release-unix.yml` runs on every pushed tag `v*` (or by hand with a tag): it
builds the universal macOS `.dmg` (ad-hoc signed, not notarised) and `agentd-<target>` for Linux
(musl, x86_64 and aarch64), macOS and Windows, and attaches them to that tag's release, drafting
one if there is none. The tag must equal the version in `tauri.conf.json`.

## Deviations from the house rules

- No axios and no `apiClient`: the app has no HTTP backend. All access goes
  through `invoke('agentd_request')` and the `agentd` event, wrapped in
  `src/api/services/`. Errors go through `handleError` in `src/lib/error.ts`.
- No Sentry: the app has a single user. `app.config.errorHandler` is set.
- Tokens are the Agent Dashboard palette ("Night Desk"), not a tweakcn theme,
  so both tools look like one family. `.dark` holds them unchanged; `:root` holds a light
  set for the same names. The theme follows the system until picked (`useThemeToggle`,
  header button); `index.html` sets `.dark` before first paint.
- The opener capability allows every `https://`, `http://` and `mailto:` link, a wildcard
  scope against `tauri/rust-side.md` (20.11.2026: "alle Links sollen gehen"). Links in
  Claude's answers, sources and terminal output point anywhere, so no fixed list fits; the
  opener only hands them to the system browser or mail app. Other schemes (`file:`, custom
  protocols) stay blocked.

## Brand

`public/favicon.svg` is the one source of the bull: favicon, header mark (`BrandBullLogo`),
README banner (`docs/brand/banner.json` points at it), Tauri icons and PWA icons (on a dark
rounded tile like the Agent Dashboard, built by the script). After
changing it, run `npm run icons` and
`uv run --with fonttools --with brotli docs/brand/generate_readme_banner.py docs/brand/banner.json`.
Eye and cheek line are holes of one `fill-rule="evenodd"` path (masks get lost in Figma), so
both must stay inside the head outline: a hole that crosses it paints blue outside the bull.
The wordmark font `src/assets/fonts/climate-crisis-latin-400.woff2` is shared with the banner.
The viewBox is optically centred: halfway between the bull's bounding box and its centre of mass
(the heavy head sits low, the thin horn high), so it lines up with the wordmark and in the icons.

The browser tab is installable as a PWA (`public/site.webmanifest`, `public/sw.js`). Chats
still need the Tauri window: the browser has no way to reach `agentd`.

## shadcn-vue CLI

Run it with `< /dev/null` (it otherwise waits on a hidden prompt). Every `add`
rewrites `src/styles/main.css`: it puts back a Google Fonts `@import` and appends
a second `@theme inline` / `@layer base` block. Remove both afterwards; fonts are
self-hosted and the theme lives in `tokens.css`. Generated components import
`cn` from the `cn` package; that is fine. They also carry `dark:` classes: strip
them, a component reads tokens and never branches on the theme.

Component prefix: Nch
