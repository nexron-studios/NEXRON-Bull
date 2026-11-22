// Takes the README screenshots in docs/screenshots/ from the real frontend, on made-up data.
//
//   node scripts/readme-screenshots/capture.mjs
//
// Windows only, like Bull's agentd. Needs cargo (builds agentd once) and playwright-cli on the
// PATH. Writes demo homes to
// BULL_DEMO_WORK (default: a folder in the temp directory) and serves the app on port 1490
// (BULL_DEMO_PORT). Nothing is read from or written to the real home folder, and no Claude runs:
// agentd starts the demo Claude from demo-claude.mjs. BULL_DEMO_AGENTD skips the agentd build.

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDemo, CART_TITLE, TODAY } from './demo-data.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const OUT = path.join(REPO, 'docs', 'screenshots')
const WORK = process.env.BULL_DEMO_WORK ?? path.join(os.tmpdir(), 'bull-readme-screenshots')
const PORT = Number(process.env.BULL_DEMO_PORT ?? 1490)
const BASE_URL = `http://localhost:${PORT}`
const BROWSER_SESSION = 'readme'
const DESKTOP = { width: 1600, height: 1000 }
const PHONE = { width: 390, height: 844 }
const DEVICE_SCALE = 1.5
const SERVER_TIMEOUT_MS = 60_000
const POLL_MS = 500
/** Waits for the UI: after a click, after the app starts, after a prompt reached the demo Claude. */
const STEP_MS = 1500
const APP_START_MS = 3000
const REPLY_MS = 2500
const CALM_MS = 800

if (process.platform !== 'win32') {
  console.error('The README screenshots run on Windows only: agentd starts demo-claude.cmd.')
  process.exit(1)
}

const [paginate, releaseNotes, certificate] = TODAY.map((session) => session.title)

const buildAgentd = () => {
  const manifest = path.join(REPO, 'agentd', 'Cargo.toml')
  const build = spawnSync(
    'cargo',
    ['build', '--release', '--manifest-path', manifest, '--bin', 'agentd'],
    {
      stdio: 'inherit'
    }
  )
  if (build.status !== 0) throw new Error('cargo build of agentd failed')
  const target = process.env.CARGO_TARGET_DIR ?? path.join(REPO, 'agentd', 'target')
  return path.join(target, 'release', 'agentd.exe')
}

const startVite = (agentd, demoRoot) =>
  spawn(
    process.execPath,
    [
      path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--config',
      path.join(HERE, 'vite.config.ts')
    ],
    {
      cwd: REPO,
      stdio: 'inherit',
      env: {
        ...process.env,
        BULL_DEMO_ROOT: demoRoot,
        BULL_DEMO_AGENTD: agentd,
        BULL_DEMO_PORT: String(PORT)
      }
    }
  )

const waitForServer = async () => {
  const deadline = Date.now() + SERVER_TIMEOUT_MS
  while (Date.now() < deadline) {
    const isUp = await fetch(BASE_URL).then(
      (response) => response.ok,
      () => false
    )
    if (isUp) return
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  throw new Error(`the demo app did not come up on ${BASE_URL}`)
}

// The shell joins the arguments into one line; paths may hold spaces.
const quoted = (arg) => (/\s/.test(arg) ? `"${arg}"` : arg)

// playwright-cli writes its snapshots next to where it runs, so it runs in the work folder. It is
// an npm shim (.cmd/.ps1), which only a shell starts.
const browser = (...args) => {
  const result = spawnSync('playwright-cli', [`-s=${BROWSER_SESSION}`, ...args].map(quoted), {
    cwd: WORK,
    shell: true,
    encoding: 'utf8'
  })
  if (result.status !== 0 || /^### Error/m.test(result.stdout)) {
    throw new Error(`playwright-cli ${args[0]} failed:\n${result.stdout}${result.stderr}`)
  }
  return result.stdout
}

/** Runs `body` as Playwright code with `page` in scope. */
const step = (body) => {
  const file = path.join(WORK, 'step.js')
  fs.writeFileSync(file, `async (page) => {\n${body}\n}`)
  browser('run-code', `--filename=${file}`)
}

const settle = (ms = STEP_MS) => `await page.waitForTimeout(${ms})`
// Pages keep their scroll position; every picture starts at the top.
const goTo = (
  link
) => `await page.getByRole('link', { name: ${JSON.stringify(link)}, exact: true }).first().click()
${settle()}
await page.evaluate(() => document.querySelectorAll('main, main *').forEach((el) => el.scrollTop > 0 && el.scrollTo(0, 0)))`
const resume = (title) => `${goTo('Overview')}
await page.getByRole('button', { name: ${JSON.stringify(`Continue ${title}`)} }).click()
await page.locator('#composer').waitFor()
${settle()}`
const send = (text) => `await page.locator('#composer').fill(${JSON.stringify(text)})
await page.locator('#composer').press('Enter')
${settle(REPLY_MS)}`

/** The page without focus rings or hover, then the picture. */
const shoot = (name) => {
  step(`await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
await page.mouse.move(0, 0)
${settle(CALM_MS)}`)
  browser('screenshot', '--hires', `--filename=${path.join(OUT, `${name}.webp`)}`)
  console.log(`docs/screenshots/${name}.webp`)
}

const capture = () => {
  const config = path.join(WORK, 'playwright.json')
  fs.writeFileSync(
    config,
    JSON.stringify({
      browser: {
        contextOptions: {
          viewport: DESKTOP,
          deviceScaleFactor: DEVICE_SCALE,
          colorScheme: 'dark',
          locale: 'en-US'
        }
      }
    })
  )
  browser('open', BASE_URL, `--config=${config}`)
  try {
    step(settle(APP_START_MS))
    step(resume(paginate))
    step(
      `${resume(releaseNotes)}\n${send('Collect everything merged since 2.3 for the release notes.')}`
    )
    step(
      `${resume(certificate)}\n${send('The staging certificate expires on Friday. Renew it and reload nginx.')}`
    )
    step(
      `${resume(CART_TITLE)}\n${send('Looks good. Run the end-to-end tests too, then push the branch.')}`
    )
    shoot('chat')
    step(goTo('Overview'))
    shoot('overview')
    step(goTo('Usage'))
    shoot('usage')
    step(`await page.getByRole('link', { name: 'Settings' }).click()\n${settle()}`)
    shoot('settings-accounts')
    step(goTo('Machines'))
    shoot('settings-machines')
    // After a reload the phone layout opens the active tab, the cart chat, over its session list.
    step(
      `await page.setViewportSize(${JSON.stringify(PHONE)})\nawait page.goto(${JSON.stringify(BASE_URL)})\n${settle(APP_START_MS)}`
    )
    shoot('phone-chat')
    step(`await page.getByRole('button', { name: 'Back to sessions' }).click()\n${settle()}`)
    shoot('phone-sessions')
  } finally {
    // A failed close must not hide the step that failed.
    try {
      browser('close')
    } catch (error) {
      console.error(error.message)
    }
  }
}

// The agentd processes and their demo Claudes are children of Vite; a plain kill would leave them
// running.
const stop = (child) =>
  spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })

const main = async () => {
  fs.mkdirSync(WORK, { recursive: true })
  fs.mkdirSync(OUT, { recursive: true })
  const demoRoot = path.join(WORK, 'demo')
  buildDemo(demoRoot)
  const agentd = process.env.BULL_DEMO_AGENTD ?? buildAgentd()
  const vite = startVite(agentd, demoRoot)
  try {
    await waitForServer()
    capture()
  } finally {
    stop(vite)
  }
}

await main()
