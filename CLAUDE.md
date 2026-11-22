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
started. The server exits about 30 s after the last tab there stopped and no app is connected.

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

On another machine, after changing `agentd/`, install it again: Settings › Machines › Check ›
"Install agentd again" copies the app's sidecar over. It refuses while chats run there, stops the
idle agentd, renames the old exe to `agentd.old.exe` and checks `hello` afterwards.
`powershell -File scripts/deploy-agentd.ps1 <host>` does the same from a fresh build. It lands in
`%USERPROFILE%\.nexron-chat\agentd.exe`. Windows targets only for now: the app
starts it through `cmd /d /c`, because the PowerShell login shell passes only the
first stdin line to a script.

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
