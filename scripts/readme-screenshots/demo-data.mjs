// Writes the made-up machines the README screenshots show: a home folder per machine with Claude
// profiles, git folders and transcripts, plus the replies the demo Claude gives to the next prompt.
// Everything is invented (example.com accounts, acme-* projects); nothing is read from the real
// home folder. Dates are relative to now, so the usage charts always end today.

import fs from 'node:fs'
import path from 'node:path'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** The README chat finished this long ago. */
const CART_AGO_MS = 40 * MINUTE_MS
const HISTORY_DAYS = 365
const MIN_TRANSCRIPT_BYTES = 4096
const CLAUDE_VERSION = '2.1.330'
const OPUS = 'claude-opus-4-5-20251101'
const SONNET = 'claude-sonnet-4-5-20250929'
const HAIKU = 'claude-haiku-4-5-20251001'

export const ACCOUNTS = {
  personal: { email: 'personal@example.com', plan: 'max' },
  work: { email: 'work@example.com', plan: 'pro' }
}

/** Machine name ('' is this PC) → profiles (folder name → account) and projects. */
export const MACHINES = {
  local: {
    profiles: { '.claude': 'personal', '.claude-work': 'work' },
    projects: ['acme-web', 'acme-api', 'field-notes'],
    workload: 1
  },
  'build-server': {
    profiles: { '.claude': 'personal' },
    projects: ['acme-infra'],
    workload: 0.25
  }
}

/** Sessions that finished earlier today; capture.mjs continues them by title. */
export const TODAY = [
  {
    machine: 'local',
    folder: '.claude-work',
    project: 'acme-api',
    title: 'Paginate the /orders endpoint',
    hoursAgo: 3
  },
  {
    machine: 'local',
    folder: '.claude',
    project: 'field-notes',
    title: 'Draft the release notes for 2.4',
    hoursAgo: 2
  },
  {
    machine: 'build-server',
    folder: '.claude',
    project: 'acme-infra',
    title: 'Rotate the staging TLS certificate',
    hoursAgo: 4
  }
]
export const CART_TITLE = 'Fix the cart total rounding'

// Mulberry32: the same demo on every run.
const randomFrom = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const random = randomFrom(20261122)
const pick = (list) => list[Math.floor(random() * list.length)]
const between = (low, high) => Math.round(low + random() * (high - low))

const uuid = () => {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16))
  hex[12] = '4'
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}
const shortId = (prefix) => `${prefix}_01${uuid().replace(/-/g, '').slice(0, 22)}`

const usageOf = (model) => ({
  input_tokens: between(4, 40),
  cache_creation_input_tokens: between(800, 6000),
  cache_read_input_tokens: between(18000, 90000),
  output_tokens: model === HAIKU ? between(80, 400) : between(150, 1400),
  service_tier: 'standard'
})

/** Claude Code's transcript lines for one session, chained by `parentUuid`. */
class Transcript {
  constructor({ sessionId, cwd, startMs, model }) {
    Object.assign(this, { sessionId, cwd, model, at: startMs, lines: [], parent: null })
  }

  push(line, stepMs) {
    this.at += stepMs
    const uuidOfLine = uuid()
    this.lines.push({
      parentUuid: this.parent,
      isSidechain: false,
      userType: 'external',
      cwd: this.cwd,
      sessionId: this.sessionId,
      version: CLAUDE_VERSION,
      gitBranch: 'main',
      ...line,
      uuid: uuidOfLine,
      timestamp: new Date(this.at).toISOString()
    })
    this.parent = uuidOfLine
  }

  user(text) {
    this.push({ type: 'user', message: { role: 'user', content: text } }, between(20, 90) * 1000)
  }

  assistant(content) {
    const message = {
      id: shortId('msg'),
      type: 'message',
      role: 'assistant',
      model: this.model,
      content,
      stop_reason: null,
      usage: usageOf(this.model)
    }
    this.push({ type: 'assistant', message, requestId: shortId('req') }, between(3, 25) * 1000)
  }

  /** A tool call and its result; `extra` carries Claude Code's `toolUseResult`. */
  tool(name, input, result, extra = {}) {
    const id = shortId('toolu')
    this.assistant([{ type: 'tool_use', id, name, input }])
    const content = [{ tool_use_id: id, type: 'tool_result', content: result }]
    this.push({ type: 'user', message: { role: 'user', content }, ...extra }, between(1, 8) * 1000)
  }

  title(text) {
    this.lines.push({ type: 'ai-title', aiTitle: text, sessionId: this.sessionId })
  }

  write(projectsDir) {
    const slug = this.cwd.replace(/[:\\/]/g, '-')
    const dir = path.join(projectsDir, slug)
    fs.mkdirSync(dir, { recursive: true })
    const text = this.lines.map((line) => JSON.stringify(line)).join('\n') + '\n'
    // Bull lists only transcripts with a real exchange (4 KB and up), as Claude Code writes them.
    const padding = Math.max(0, MIN_TRANSCRIPT_BYTES - text.length)
    const filler = padding
      ? JSON.stringify({
          type: 'file-history-snapshot',
          snapshot: { trackedFileBackups: {} },
          pad: ' '.repeat(padding)
        }) + '\n'
      : ''
    const file = path.join(dir, `${this.sessionId}.jsonl`)
    fs.writeFileSync(file, text + filler)
    const modified = new Date(this.at)
    fs.utimesSync(file, modified, modified)
  }
}

const CART_TOTAL_BEFORE = `export const cartTotal = (lines: CartLine[], discount: number): number =>
  lines
    .map((line) => Math.round(line.price * line.quantity * (1 - discount) * 100) / 100)
    .reduce((sum, value) => sum + value, 0)`

const CART_TOTAL_AFTER = `export const cartTotal = (lines: CartLine[], discount: number): number => {
  const cents = sumInCents(lines)
  const total = cents * (1 - discount)
  return Math.round(total) / 100
}`

/** The chat the README shows: a bug found, fixed and tested, with tool calls on the way. */
const writeCartChat = (transcript) => {
  const file = `${transcript.cwd}\\src\\cart\\total.ts`
  transcript.user(
    'The cart total is a cent off for some discounts. Can you find out why and fix it?'
  )
  transcript.assistant([
    {
      type: 'thinking',
      thinking:
        'Off by one cent smells like rounding per line instead of once for the whole cart. Find where the total is computed first.',
      signature: 'demo'
    }
  ])
  transcript.assistant([{ type: 'text', text: "I'll start where the total is computed." }])
  transcript.tool(
    'Grep',
    { pattern: 'cartTotal', path: 'src', output_mode: 'files_with_matches' },
    'Found 3 files\nsrc/cart/total.ts\nsrc/cart/__tests__/total.spec.ts\nsrc/components/CartSummary.vue'
  )
  transcript.tool(
    'Read',
    { file_path: file },
    CART_TOTAL_BEFORE.split('\n')
      .map((line, index) => `${String(index + 1).padStart(6)}\t${line}`)
      .join('\n')
  )
  transcript.assistant([
    {
      type: 'text',
      text: 'Found it: every line is rounded **before** it is added up, so the rounding errors add up too. I will sum in cents and round once.'
    }
  ])
  transcript.tool(
    'Edit',
    {
      file_path: file,
      old_string: CART_TOTAL_BEFORE,
      new_string: CART_TOTAL_AFTER
    },
    `The file ${file} has been updated successfully.`,
    {
      toolUseResult: {
        filePath: file,
        structuredPatch: [
          {
            oldStart: 1,
            oldLines: 4,
            newStart: 1,
            newLines: 5,
            lines: [
              '-export const cartTotal = (lines: CartLine[], discount: number): number =>',
              '-  lines',
              '-    .map((line) => Math.round(line.price * line.quantity * (1 - discount) * 100) / 100)',
              '-    .reduce((sum, value) => sum + value, 0)',
              '+export const cartTotal = (lines: CartLine[], discount: number): number => {',
              '+  const cents = sumInCents(lines)',
              '+  const total = cents * (1 - discount)',
              '+  return Math.round(total) / 100',
              '+}'
            ]
          }
        ],
        userModified: false,
        replaceAll: false
      }
    }
  )
  transcript.tool(
    'Bash',
    { command: 'npm test -- src/cart', description: 'Run the cart tests' },
    ' ✓ src/cart/__tests__/total.spec.ts (7 tests) 12ms\n\n Test Files  1 passed (1)\n      Tests  7 passed (7)\n   Duration  412ms'
  )
  transcript.assistant([
    {
      type: 'text',
      text: [
        'Fixed. The total was off because each line was rounded before the discount.',
        '',
        '- `cartTotal` now adds up integer cents',
        '- the discount applies to the sum, rounded once',
        '- a new test covers 3 × €19.99 with 15 % off',
        '',
        '```ts',
        'const cents = sumInCents(lines)',
        'const total = cents * (1 - discount)',
        'return Math.round(total) / 100',
        '```',
        '',
        'All 7 cart tests pass.'
      ].join('\n')
    }
  ])
  transcript.title(CART_TITLE)
}

const EARLIER_TOPICS = {
  'acme-web': [
    'Add a dark mode toggle to the header',
    'Lazy-load the product gallery images',
    'Fix the focus ring on the search field',
    'Move the checkout form to vee-validate',
    'Translate the footer into German',
    'Speed up the landing page LCP',
    'Show stock levels on product cards'
  ],
  'acme-api': [
    'Validate the order request bodies',
    'Add rate limiting to the public API',
    'Write a migration for the invoices table',
    'Fix the timezone bug in daily reports',
    'Cache product lookups in Redis',
    'Return 404 instead of 500 for missing carts'
  ],
  'field-notes': [
    'Summarize the API changelog for the team',
    'Write the onboarding checklist',
    'Turn the meeting notes into tasks'
  ],
  'acme-infra': [
    'Move the logs to Loki',
    'Add a nightly database backup job',
    'Upgrade the CI runners to Node 22',
    'Tune the nginx cache headers'
  ]
}

const FOLLOW_UPS = [
  [
    'Where is this handled today?',
    'It lives in one place; I read it first and kept the change small.'
  ],
  ['Please add a test for it.', 'Added a test that fails before the change and passes after it.'],
  ['Run the checks again.', 'Type check, lint and tests pass.'],
  ['Keep the old behaviour behind a flag?', 'Not needed: nothing else calls the old path.']
]

const TOOL_CALLS = [
  ['Glob', { pattern: 'src/**/*.ts' }, 'src/index.ts\nsrc/app.ts\nsrc/routes.ts'],
  ['Grep', { pattern: 'TODO', path: 'src' }, 'Found 2 files\nsrc/app.ts\nsrc/routes.ts'],
  ['Read', { file_path: 'src/app.ts' }, '     1\texport const app = createApp()'],
  ['Read', { file_path: 'src/routes.ts' }, '     1\texport const routes = []'],
  [
    'Edit',
    { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' },
    'The file src/app.ts has been updated successfully.'
  ],
  ['Bash', { command: 'npm test', description: 'Run the tests' }, ' Tests  24 passed (24)'],
  ['Bash', { command: 'git status --short', description: 'Show changed files' }, ' M src/app.ts'],
  ['WebSearch', { query: 'vite 8 migration guide' }, 'Web search results'],
  ['TodoWrite', { todos: [] }, 'Todos have been modified successfully.']
]

const writeEarlierSession = (
  projectsDir,
  machineHome,
  project,
  startMs,
  model,
  topic = pick(EARLIER_TOPICS[project])
) => {
  const cwd = path.join(machineHome, 'projects', project)
  const transcript = new Transcript({ sessionId: uuid(), cwd, startMs, model })
  transcript.user(`${topic}.`)
  for (let call = between(1, 6); call > 0; call--) transcript.tool(...pick(TOOL_CALLS))
  transcript.assistant([{ type: 'text', text: 'Done. The change is in place and the tests pass.' }])
  for (let turn = between(0, 3); turn > 0; turn--) {
    const [question, answer] = pick(FOLLOW_UPS)
    transcript.user(question)
    transcript.assistant([{ type: 'text', text: answer }])
  }
  transcript.title(topic)
  transcript.write(projectsDir)
  return transcript
}

/** Days with more work on weekdays and in recent weeks, like a real activity grid. */
const sessionsOnDay = (daysAgo, now, workload) => {
  const weekday = new Date(now - daysAgo * DAY_MS).getDay()
  const isWeekend = weekday === 0 || weekday === 6
  const recency = 1 - daysAgo / HISTORY_DAYS
  const chance = (isWeekend ? 0.2 : 0.85) * (0.3 + 0.7 * recency) * Math.min(1, workload * 2)
  if (random() > chance) return 0
  return Math.max(1, Math.round(between(1, isWeekend ? 2 : 4) * workload))
}

/** `agoMs` before now, but never before midnight: "Done today" must hold them at any hour. */
const earlierToday = (now, agoMs) => {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  return Math.max(now - agoMs, midnight.getTime())
}

const writeProfileFiles = (home, folder, account) => {
  const dir = path.join(home, folder)
  fs.mkdirSync(path.join(dir, 'projects'), { recursive: true })
  // The default profile keeps .claude.json next to its folder, the others inside it.
  const state =
    folder === '.claude' ? path.join(home, '.claude.json') : path.join(dir, '.claude.json')
  const { email } = ACCOUNTS[account]
  fs.writeFileSync(
    state,
    JSON.stringify({ oauthAccount: { emailAddress: email, displayName: 'Demo' } }, null, 2)
  )
  return path.join(dir, 'projects')
}

/**
 * Writes `<root>/<machine>/…` for every machine. The root is wiped first so every run starts from
 * the same state.
 */
export const buildDemo = (root, now = Date.now()) => {
  fs.rmSync(root, { recursive: true, force: true })
  for (const [machine, { profiles, projects, workload }] of Object.entries(MACHINES)) {
    const home = path.join(root, machine)
    for (const project of projects) {
      fs.mkdirSync(path.join(home, 'projects', project, '.git'), { recursive: true })
      fs.writeFileSync(
        path.join(home, 'projects', project, '.git', 'HEAD'),
        'ref: refs/heads/main\n'
      )
    }
    const projectsDirs = Object.fromEntries(
      Object.entries(profiles).map(([folder, account]) => [
        folder,
        writeProfileFiles(home, folder, account)
      ])
    )
    const folders = Object.keys(profiles)
    for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
      for (let count = sessionsOnDay(daysAgo, now, workload); count > 0; count--) {
        const dayStart = new Date(now - daysAgo * DAY_MS)
        dayStart.setHours(between(8, 19), between(0, 59), 0, 0)
        const folder = pick(folders)
        const project = pick(projects)
        const model = pick([OPUS, OPUS, SONNET, SONNET, HAIKU])
        writeEarlierSession(projectsDirs[folder], home, project, dayStart.getTime(), model)
      }
    }
    for (const today of TODAY.filter((session) => session.machine === machine)) {
      const startMs = earlierToday(now, today.hoursAgo * HOUR_MS)
      writeEarlierSession(
        projectsDirs[today.folder],
        home,
        today.project,
        startMs,
        OPUS,
        today.title
      )
    }
    if (machine === 'local') {
      const cart = new Transcript({
        sessionId: uuid(),
        cwd: path.join(home, 'projects', 'acme-web'),
        startMs: earlierToday(now, CART_AGO_MS),
        model: OPUS
      })
      writeCartChat(cart)
      cart.write(projectsDirs['.claude'])
    }
  }
}
