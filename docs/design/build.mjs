// Generates the Bull design as self-contained HTML (docs/design/out/), which is imported into
// Figma with the Figma MCP tool html_to_figma (cssSelector `section.frame`, one frame per match).
// Run from the repo root: node docs/design/build.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ic, missing } from './icons.mjs'

const ROOT = new URL('../../', import.meta.url)
const OUT = new URL('./out/', import.meta.url)
const fromRoot = (path) => new URL(path, ROOT)
mkdirSync(OUT, { recursive: true })

const C = {
  app: '#0e0e0f',
  card: '#19191a',
  s2: '#222223',
  s3: '#2b2b2c',
  line: '#2c2c2d',
  line2: '#3a3a3b',
  ink: '#f0efec',
  ink2: '#c3c2b7',
  ink3: '#8e8d84',
  brand: '#4d7cff',
  brandS: '#3a64e0',
  brandL: '#8fb0ff',
  brandD: '#2a4fd6',
  crit: '#e05252',
  warn: '#fab219',
  good: '#0ca30c',
  read: '#7f9bc4',
  change: '#9085e9',
  outside: '#1fa9bd',
  ring: '#3987e5',
  claude: '#d97757'
}

// The revised bull, read from the app's single source.
const BULL_SVG = readFileSync(fromRoot('public/favicon.svg'), 'utf8')
const BULL_D = BULL_SVG.match(/ d="([^"]+)"/)[1]
const BULL_VIEWBOX = BULL_SVG.match(/viewBox="([^"]+)"/)[1]
const bull = (s = 22, color = C.brand) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="${BULL_VIEWBOX}" style="flex:none;display:block"><path fill="${color}" fill-rule="evenodd" d="${BULL_D}"/></svg>`

const nexronSvg = readFileSync(fromRoot('src/assets/nexron_logo.svg'), 'utf8')
const nexron = (h = 22) =>
  `<img src="data:image/svg+xml;base64,${Buffer.from(nexronSvg).toString('base64')}" style="height:${h}px;width:auto;display:block" alt="NEXRON Studios">`

// Clawd, the pixel mark from the Claude Code start screen (as in the Agent Dashboard).
const clawd = (h = 14, color = C.brand) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${h * 1.6}" height="${h}" viewBox="1 0 16 10" shape-rendering="crispEdges" style="flex:none;display:block"><g fill="${color}"><rect x="3" y="0" width="12" height="2"/><rect x="3" y="2" width="2" height="2"/><rect x="6" y="2" width="6" height="2"/><rect x="13" y="2" width="2" height="2"/><rect x="1" y="4" width="16" height="2"/><rect x="3" y="6" width="12" height="2"/><rect x="4" y="8" width="1" height="2"/><rect x="6" y="8" width="1" height="2"/><rect x="11" y="8" width="1" height="2"/><rect x="13" y="8" width="1" height="2"/></g></svg>`

// ---------- small building blocks ----------
const dot = (color, s = 8) =>
  `<span style="width:${s}px;height:${s}px;border-radius:99px;background:${color};flex:none;display:block"></span>`
const kbd = (t) => `<span class="kbd">${t}</span>`
const tile = (icon, color = C.ink2, size = 40, bg = C.s2) =>
  `<span class="tile" style="width:${size}px;height:${size}px;background:${bg}">${ic(icon, size * 0.45, color)}</span>`

const STATUS = {
  working: { icon: 'loader-circle', color: C.warn, label: 'Arbeitet' },
  approval: { icon: 'shield-alert', color: C.crit, label: 'Freigabe' },
  waiting: { icon: 'hourglass', color: C.warn, label: 'Wartet' },
  done: { icon: 'circle-check', color: C.good, label: 'Fertig' },
  idle: { icon: 'circle', color: C.ink3, label: 'Bereit' },
  queued: { icon: 'timer', color: C.read, label: 'Wartet auf Limit' }
}
const statusIcon = (s, size = 14) => ic(STATUS[s].icon, size, STATUS[s].color)
const pill = (s) =>
  `<span class="pill" style="color:${STATUS[s].color};background:${STATUS[s].color}1f">${ic(STATUS[s].icon, 12, STATUS[s].color)}${STATUS[s].label}</span>`

const meter = (pct, color = C.brand, w = '100%', h = 6) =>
  `<span class="meter" style="width:${w};height:${h}px"><span style="width:${pct}%;background:${color}"></span></span>`

const btn = (label, icon, variant = 'ghost') =>
  `<span class="btn btn-${variant}">${icon ? ic(icon, 15, variant === 'primary' ? '#fff' : variant === 'light' ? C.app : C.ink2) : ''}${label}</span>`
const iconBtn = (icon, active = false, size = 16) =>
  `<span class="ibtn${active ? ' ibtn-on' : ''}">${ic(icon, size, active ? C.ink : C.ink3)}</span>`

// ---------- shell parts ----------
// Accounts: each chat runs on one of them and can switch on its own.
const ACC = {
  work: { name: 'office', plan: 'Max', color: C.brand },
  own: { name: 'privat', plan: 'Pro', color: C.change }
}
const accChip = (key, withPlan = false) =>
  `<span class="acc">${dot(ACC[key].color, 6)}${ACC[key].name}${withPlan ? ` · ${ACC[key].plan}` : ''}</span>`

// The phone list and every other row use the built row (numbers, badges, dimmed seen rows).
function agentRow(status, title, folder, acc = 'work', time = '', live = '', on = false) {
  return agentRow5(status, title, folder, acc, time, live, { on })
}

// ---------- prompt-kit parts, in Bull style ----------
const systemMessage = (icon, text, color = C.ink3) =>
  `<div class="sysmsg">${ic(icon, 14, color)}<span>${text}</span></div>`

const userMessage = (text, withImage = false) => `
<div class="umsg">
  ${withImage ? `<div class="uimg"><div class="imgph">${ic('image', 18, C.ink3)}<span>header-homeserver.png</span></div></div>` : ''}
  <div class="bubble">${text}</div>
  <div class="msgact">${iconBtn('copy', false, 14)}${iconBtn('pencil', false, 14)}</div>
</div>`

const reasoning = (open = false) => `
<div class="reason">
  <div class="rhead">${ic('brain', 14, C.ink3)}<span>Gedacht · 12 s</span>${ic(open ? 'chevron-down' : 'chevron-right', 14, C.ink3)}</div>
  ${open ? `<div class="rbody">Der Header soll wie die Homeserver-Startseite aussehen: Name links, Trennstrich, NEXRON-Logo. Tabs bleiben rechts daneben, damit der Ablauf wie in herdr bleibt.</div>` : ''}
</div>`

const toolCard = (kind, name, target, state, open = false, result = '') => {
  const color = { read: C.read, change: C.change, outside: C.outside }[kind]
  const icon = {
    Read: 'file-search',
    Edit: 'file-pen',
    Bash: 'square-terminal',
    WebFetch: 'globe',
    Grep: 'text-search',
    Write: 'file-plus'
  }[name]
  const st = {
    ok: ic('check', 14, C.good),
    run: ic('loader-circle', 14, C.warn),
    err: ic('x', 14, C.crit)
  }[state]
  // A file change opens on its diff, as built (ChatDiffView): line numbers, mark, counts in the head.
  if (open && (name === 'Edit' || name === 'Write')) {
    const lines = result.split('<br>').map((line, i) => [42 + i, line[0], line.slice(2)])
    const added = lines.filter(([, sign]) => sign === '+').length
    const removed = lines.filter(([, sign]) => sign === '-').length
    return `<div class="tool">
    <div class="thead">${ic(icon, 15, color)}<span class="tname">${name}</span><span class="ttarget trunc">${target}</span><span class="grow"></span><span class="xs" style="color:${C.good}">+${added}</span><span class="xs" style="color:${C.crit}">−${removed}</span>${st}${ic('chevron-down', 14, C.ink3)}</div>
    <div class="diff8">${lines.map(([n, sign, text]) => `<div class="dl8${sign === '+' ? ' add' : sign === '-' ? ' del' : ''}"><span class="dn8">${n}</span><span class="ds8">${sign === ' ' ? '' : sign}</span><span>${text}</span></div>`).join('')}</div>
  </div>`
  }
  return `<div class="tool">
    <div class="thead">${ic(icon, 15, color)}<span class="tname">${name}</span><span class="ttarget trunc">${target}</span><span class="grow"></span>${st}${ic(open ? 'chevron-down' : 'chevron-right', 14, C.ink3)}</div>
    ${open ? `<div class="tbody"><div class="tlabel">Eingabe</div><div class="mono sm">${target}</div><div class="tlabel">Ergebnis</div><div class="mono sm out">${result}</div></div>` : ''}
  </div>`
}

const chainOfThought = () => `
<div class="cot">
  <div class="cothead">${ic('list-tree', 14, C.ink3)}<span>Zwischenschritte</span><span class="muted">· 6 Schritte</span>${ic('chevron-down', 14, C.ink3)}</div>
  <div class="cotlist">
    <div class="cotstep"><span class="cotdot">${dot(C.ink3, 6)}</span><div class="col gap6"><span>Ich schaue mir den Header der Homeserver-Startseite an.</span>${toolCard('read', 'Read', 'startpage/src/components/layout/SiteHeader.vue', 'ok')}</div></div>
    <div class="cotstep"><span class="cotdot">${dot(C.ink3, 6)}</span><div class="col gap6"><span>Logo und Trennstrich übernehme ich, die Tabs bleiben daneben.</span>${toolCard('change', 'Edit', 'src/views/ChatView.vue', 'ok', true, '+ &lt;BrandBullLogo :size="24" class="text-brand" /&gt;<br>+ &lt;span class="h-6 w-px bg-input" /&gt;<br>+ &lt;BrandNexronLogo :height="24" /&gt;')}</div></div>
    <div class="cotstep"><span class="cotdot">${dot(C.warn, 6)}</span><div class="col gap6"><span>Build und Tests laufen.</span>${toolCard('change', 'Bash', 'npm run build &amp;&amp; npm test', 'run')}</div></div>
  </div>
</div>`

const codeBlock = () => `
<div class="code">
  <div class="codehead"><span class="mono sm muted">vue</span><span class="grow"></span>${iconBtn('copy', false, 14)}</div>
  <div class="codebody mono"><span style="color:#6f6e66">&lt;!-- Like the homeserver start page --&gt;</span><br><span style="color:#b9a4ff">&lt;div</span> <span style="color:#7fd3df">class</span>=<span style="color:#9fd8b8">"flex items-center gap-4"</span><span style="color:#b9a4ff">&gt;</span><br>&nbsp;&nbsp;<span style="color:#b9a4ff">&lt;BrandBullLogo</span> <span style="color:#7fd3df">:size</span>=<span style="color:#9fd8b8">"24"</span> <span style="color:#b9a4ff">/&gt;</span><br>&nbsp;&nbsp;<span style="color:#b9a4ff">&lt;BrandNexronLogo</span> <span style="color:#7fd3df">:height</span>=<span style="color:#9fd8b8">"24"</span> <span style="color:#b9a4ff">/&gt;</span><br><span style="color:#b9a4ff">&lt;/div&gt;</span></div>
</div>`

const sources = () => `
<div class="row gap8 wrap">
  <span class="src"><span class="fav" style="background:#1fa9bd33">${ic('globe', 11, C.outside)}</span>prompt-kit.com</span>
  <span class="src"><span class="fav" style="background:#7f9bc433">${ic('book-open', 11, C.read)}</span>tauri.app/v2</span>
  <span class="src"><span class="fav" style="background:#9085e933">${ic('github', 11, C.change)}</span>github.com</span>
</div>`

const feedbackBar = () => `
<div class="feedback">${iconBtn('copy', false, 14)}<span class="muted sm">Gearbeitet 18 s · 4,2k Tokens · Opus 5.5</span></div>`

const thinkingBar = () => `
<div class="thinking">${ic('loader-circle', 14, C.warn)}<span class="shimmer">Claude führt Befehle aus …</span><span class="muted sm nowrap row gap4">0:42 · ${ic('arrow-down', 11, C.ink3)}4,2k Tokens</span><span class="grow"></span><span class="stop">${ic('square', 11, C.ink2)}Stopp ${kbd('Esc')}</span></div>`

const steps = () => `
<div class="steps">
  ${[
    ['check', C.good, 'Header-Komponente gelesen'],
    ['check', C.good, 'Logo eingebaut'],
    ['loader-circle', C.warn, 'Build und Tests'],
    ['circle', C.ink3, 'In preview mergen']
  ]
    .map(
      ([i, c, t]) =>
        `<div class="step">${ic(i, 14, c)}<span${c === C.ink3 ? ' class="muted"' : ''}>${t}</span></div>`
    )
    .join('')}
</div>`

const promptInputCompact = (opts = {}) => `
<div class="pinput${opts.focus ? ' focus' : ''}">
  ${opts.attach || ''}
  <div class="ptext${opts.text ? '' : ' ph'}">${opts.text || 'Nachricht an Claude …'}</div>
  <div class="prow">
    ${iconBtn('paperclip')}
    <span class="chip plain">${clawd(10)}<span>Opus 5.5 · Hoch</span>${ic('chevron-down', 12, C.ink3)}</span>
    <span class="chip plain${opts.accOpen ? ' chipon' : ''}">${dot(ACC[opts.acc || 'work'].color, 7)}<span>${ACC[opts.acc || 'work'].name}</span>${ic('chevron-down', 12, C.ink3)}</span>
    <span class="grow"></span>
    <span class="send${opts.text ? '' : ' off'}">${ic('arrow-up', 16, opts.text ? '#fff' : C.ink3)}</span>
  </div>
</div>`

const fileChip = (name, icon) =>
  `<span class="fchip">${ic(icon, 14, C.ink2)}<span>${name}</span>${ic('x', 12, C.ink3)}</span>`

const suggestions = () => `
<div class="row gap8 wrap center">
  ${['Tests reparieren', 'PR beschreiben', 'Code erklären', 'Projekt-Notiz lesen'].map((s, i) => `<span class="sugg">${ic(['flask-conical', 'git-pull-request', 'book-open', 'notebook-pen'][i], 14, C.ink3)}${s}</span>`).join('')}
</div>`

const scrollButton = () => `<span class="scrollbtn">${ic('arrow-down', 16, C.ink)}</span>`
const loaderDots = () =>
  `<span class="row gap4">${dot(C.ink3, 6)}${dot(C.ink2, 6)}${dot(C.ink, 6)}</span>`

// Finished chats you have not opened yet carry their place in the finish order, newest first,
// the same numbers as the Agent Dashboard's strip. Opening the chat takes its number away.
const finishBadge = (n, size = 16) =>
  `<span class="fnum5${n === 1 ? ' first' : ''}" style="width:${size}px;height:${size}px;font-size:${size <= 16 ? 10 : 11}px">${n}</span>`

const activityBadges = (agents = 0, shells = 0) =>
  `${agents ? `<span class="abadge">${ic('bot', 11, C.warn)}${agents}</span>` : ''}${shells ? `<span class="abadge">${ic('square-terminal', 11, C.ink3)}${shells}</span>` : ''}`

const agentRow5 = (status, title, folder, acc, time, live = '', opts = {}) => {
  const icon = opts.finish
    ? `<span class="ficon">${finishBadge(opts.finish, 18)}</span>`
    : `<span class="ficon${opts.seen ? ' dim' : ''}">${statusIcon(status, 16)}</span>`
  const liveLine =
    live || opts.agents || opts.shells
      ? `<div class="row gap6 min"><span class="liveline trunc grow">${live}</span>${activityBadges(opts.agents, opts.shells)}</div>`
      : ''
  return `<div class="agent${opts.on ? ' on' : ''}">${icon}<div class="col min grow gap2"><div class="between"><span class="trunc strongish${opts.seen ? ' dim' : ''}">${title}</span><span class="xs muted nowrap">${time}</span></div><div class="row gap6 xs muted">${ic('folder', 11, C.ink3)}<span class="trunc">${folder}</span>${accChip(acc)}</div>${liveLine}</div></div>`
}

// Bottom left: per account the 5-hour window and the week, side by side, reset of the 5 h window.
const quotaPair = (label, pct) => {
  const color = pct >= 80 ? C.warn : C.brand
  return `<div class="qpair"><span class="qlab">${label}</span>${meter(pct, color, '100%', 4)}<span class="qpct${pct >= 80 ? ' hot' : ''}">${pct} %</span></div>`
}
const footAccount = (key, h5, wk, reset) =>
  `<div class="facc"><div class="between"><span class="row gap6">${dot(ACC[key].color, 6)}<span class="fname5">${ACC[key].name}</span></span><span class="xs muted">5 h Reset ${reset}</span></div><div class="row gap12">${quotaPair('5 h', h5)}${quotaPair('Woche', wk)}</div></div>`

const bellButton = (state = 'on') => {
  const icon = {
    on: ic('bell', 16, C.ink2),
    off: ic('bell-off', 16, C.ink3),
    blocked: `${ic('bell', 16, C.ink2)}<span class="bdot" style="background:${C.warn}"></span>`,
    open: ic('bell', 16, C.ink)
  }[state]
  return `<span class="ibtn${state === 'open' ? ' ibtn-on' : ''}" style="position:relative">${icon}</span>`
}

const sidebar5 = (opts = {}) => `
<aside class="side">
  <div class="brandrow">${bull(24)}<span class="wordmark">Bull</span><span class="vr"></span>${nexron(20)}<span class="grow"></span>${bellButton(opts.bell || 'on')}${iconBtn('panel-left-close')}</div>
  <div class="row gap6">
    <span class="newbtn">${ic('plus', 15, '#fff')}Neue Session<span class="grow"></span><span class="kbdw">Ctrl T</span></span>
    <span class="ibtn ibtn-line">${ic('search', 15, C.ink2)}</span>
  </div>
  <div class="row gap4">
    ${[
      ['chat', 'messages-square', 'Sessions'],
      ['overview', 'layout-dashboard', 'Übersicht'],
      ['usage', 'gauge', 'Nutzung']
    ]
      .map(
        ([key, icon, label]) =>
          `<span class="navp${(opts.nav || 'chat') === key ? ' on' : ''}">${ic(icon, 14, (opts.nav || 'chat') === key ? C.ink : C.ink3)}${label}</span>`
      )
      .join('')}
  </div>
  <div class="machines">
    <span class="mach on">${ic('monitor', 14, C.ink)}Dieser PC<span class="count">6</span></span>
    <span class="mach">${ic('server', 14, C.ink3)}nexron-server${dot(C.warn, 6)}<span class="count">2</span></span>
  </div>
  <div class="grp">${ic('shield-alert', 13, C.crit)}<span>Braucht dich</span><span class="count">1</span></div>
  ${agentRow5('approval', 'Bull-Brand: Figma-Design', 'nexron-chat', 'work', '24 min', 'Bash · git push -u origin', { on: (opts.sel || 'brand') === 'brand', agents: 1 })}
  <div class="grp">${ic('loader-circle', 13, C.warn)}<span>Läuft</span><span class="count">3</span></div>
  ${agentRow5('working', 'PWA installierbar', 'nexron-chat', 'work', '6 min', 'Edit · site.webmanifest', { agents: 2 })}
  ${agentRow5('working', 'Kalender Wochenansicht', 'kramlos', 'own', '12 min', 'Read · CalendarWeek.vue', { on: opts.sel === 'cal' })}
  ${agentRow5('waiting', 'Homeserver Deploy', 'homeserver', 'work', '3 min', 'wartet auf Shell', { shells: 1 })}
  <div class="grp">${ic('circle-check', 13, C.good)}<span>Fertig heute</span><span class="count">2</span><span class="newc">2 neu</span><span class="grow"></span><span class="link">${ic('list-x', 12, C.ink3)}Alle entfernen</span></div>
  ${agentRow5('done', 'Blender Reel Shots', 'reels', 'own', 'gerade', '', { finish: 1 })}
  ${agentRow5('done', 'Quota-Header fixen', 'agentdashboard', 'work', 'vor 9 min', '', { finish: 2 })}
  <div class="grow"></div>
  <div class="foot5">
    ${footAccount('work', 42, 63, '2:14 h')}
    ${footAccount('own', 96, 71, '0:48 h')}
  </div>
</aside>`

const tabs5 = (activeIdx = 0) => {
  const list = [
    ['approval', 'Bull-Brand'],
    ['working', 'PWA'],
    ['working', 'Kalender'],
    ['done', 'Blender Reel', 1],
    ['done', 'Quota-Header', 2],
    ['idle', 'terminal']
  ]
  return `<div class="tabs">${list
    .map(([s, t, n], i) => {
      const icon = n
        ? finishBadge(n, 16)
        : t === 'terminal'
          ? ic('square-terminal', 14, C.ink3)
          : statusIcon(s, 14)
      return `<span class="tab${i === activeIdx ? ' on' : ''}${n ? ' fresh' : ''}">${icon}<span>${t}</span>${i === activeIdx ? ic('x', 13, C.ink3) : ''}${i === activeIdx ? '<span class="tabbar"></span>' : ''}</span>`
    })
    .join('')}<span class="tabadd">${ic('plus', 15, C.ink2)}</span></div>`
}
const topbar5 = (activeIdx = 0, nav = 'chat') => `
<div class="top">
  ${tabs5(activeIdx)}
  <span class="grow"></span>
  ${iconBtn('sun')}${iconBtn('settings', nav === 'settings')}${iconBtn('panel-right', nav !== 'settings')}
</div>`
const sessionBar = (p = {}) =>
  `<div class="sbar">${ic('monitor', 13, C.ink3)}<span class="xs ink2">${p.machine || 'Dieser PC'}</span><span class="crumb">/</span>${ic('folder-open', 13, C.ink3)}<span class="mono xs">${p.folder || 'nexron-chat'}</span><span class="crumb">/</span>${ic('git-branch', 13, C.ink3)}<span class="mono xs">${p.branch || 'feat/bull-brand'}</span><span class="grow"></span>${iconBtn('history', false, 14)}${iconBtn('ellipsis', false, 14)}</div>`

// Right panel: "Nutzung" moved to the bottom left, its place goes to what Claude is doing.
const TOOL_KIND = {
  Read: ['file-search', C.read],
  Grep: ['text-search', C.read],
  Edit: ['file-pen', C.change],
  Write: ['file-plus', C.change],
  Bash: ['square-terminal', C.change],
  WebFetch: ['globe', C.outside],
  Glob: ['search', C.read]
}
const toolIcon = (name, size = 13) => ic(TOOL_KIND[name][0], size, TOOL_KIND[name][1])
const recentTool = (name, target, time, state = 'ok') =>
  `<div class="atool">${state === 'run' ? ic('loader-circle', 13, C.warn) : ic('check', 13, C.good)}${toolIcon(name)}<span class="tname5">${name}</span><span class="mono xs trunc grow ink2">${target}</span><span class="xs muted nowrap">${time}</span></div>`
const subAction = ([state, tool, target, time]) =>
  `<div class="subact">${state === 'run' ? ic('loader-circle', 11, C.warn) : ic('check', 11, C.good)}${toolIcon(tool, 11)}<span class="xs strong" style="width:34px">${tool}</span><span class="mono xs trunc grow ink2">${target}</span><span class="xs muted">${time}</span></div>`
const subagentRow = (state, type, title, time, actions = null) =>
  `<div class="sub5"><div class="row gap8">${state === 'run' ? ic('loader-circle', 14, C.warn) : state === 'err' ? ic('circle-x', 14, C.crit) : ic('circle-check', 14, C.good)}<span class="stype">${ic('bot', 11, C.ink3)}${type}</span><span class="trunc grow sm">${title}</span><span class="xs muted nowrap">${time}</span>${actions ? ic(Array.isArray(actions) ? 'chevron-down' : 'chevron-right', 13, C.ink3) : ''}</div>${Array.isArray(actions) ? `<div class="subacts">${actions.map(subAction).join('')}</div>` : actions ? `<div class="sublive">${actions}</div>` : ''}</div>`
const NOW_CARD = {
  running: () => '',
  waiting: () =>
    `<div class="now5 crit">${ic('shield-alert', 14, C.crit)}${toolIcon('Bash', 14)}<div class="col min grow"><span class="sm strong">Bash wartet auf Freigabe</span><span class="mono xs trunc ink2">git push -u origin feat/bull-brand</span></div></div><span class="link">Zur Freigabe ${ic('chevron-right', 12, C.ink3)}</span>`,
  idle: () => `<span class="sm ink2">Letzter Turn: 14 Tools, 3 Subagents, 4:10 min</span>`
}
const ACTIVITY_HEAD = {
  running: () =>
    `<span class="xs muted row gap8">14 Tools<span class="livedot">${dot(C.warn, 6)}live</span></span>`,
  waiting: () =>
    `<span class="livedot" style="color:${C.crit}">${dot(C.crit, 6)}braucht dich</span>`,
  idle: () => `<span class="xs muted">14 Tools</span>`
}
const activitySection = (p = {}) => `
  <div class="rsect"><div class="between"><span class="rtitle">Aktivität</span>${ACTIVITY_HEAD[p.state || 'running']()}</div>
    ${NOW_CARD[p.state || 'running']()}
    <div class="col gap2">
      ${(p.state || 'running') === 'running' ? recentTool('Bash', 'npm run build &amp;&amp; npm test', '0:42', 'run') : ''}
      ${recentTool('Edit', 'src/views/ChatView.vue', '0:02')}
      ${recentTool('Read', 'SiteHeader.vue', '0:01')}
      ${recentTool('Grep', '"BrandBullLogo"', '0:01')}
    </div>
    <span class="link">Alle 14 im Chat zeigen ${ic('chevron-right', 12, C.ink3)}</span>
  </div>
  <div class="rsect"><div class="between"><span class="rtitle">Subagents</span><span class="xs muted"><span style="color:${C.warn}">2 laufen</span> · 1 fertig</span></div>
    ${subagentRow('run', 'Explore', 'Header-Muster suchen', '1:12', [
      ['ok', 'Glob', 'src/**/*Header*.vue', '0:01'],
      ['ok', 'Read', 'SiteHeader.vue', '0:02'],
      ['run', 'Grep', '"BrandNexronLogo"', '0:04']
    ])}
    ${subagentRow('run', 'general-purpose', 'Icons prüfen', '0:31', [
      ['ok', 'Read', 'docs/design/icons.mjs', '0:01'],
      ['run', 'Bash', 'npm run icons', '0:12']
    ])}
    ${subagentRow('ok', 'Explore', 'Tokens lesen', '0:38', '5 Aktionen · Read tokens.css, Grep --brand')}
  </div>
  ${
    p.shell === false
      ? ''
      : `<div class="rsect"><div class="rtitle">Im Hintergrund</div>
    <div class="kv">${ic('square-terminal', 14, C.ink3)}<span class="mono xs trunc grow ink2">npm run dev</span><span class="xs muted">läuft 12 min</span></div>
    <span class="xs muted row gap4">${kbd('Ctrl B')}schiebt eine laufende Shell hierher</span>
  </div>`
  }`
const rightPanel5 = (p = {}) => `
<aside class="right r5"><span class="rscroll"></span>
  <div class="rsect"><div class="kv">${ic('user', 14, C.ink3)}<span>Konto</span><span class="grow"></span>${accChip(p.acc || 'work')}<span class="swap">${ic('arrow-left-right', 12, C.ink2)}Wechseln</span></div>
  </div>
  ${activitySection(p)}
  <div class="rsect"><div class="between"><span class="rtitle">Konnektoren</span><span class="xs muted">3 verbunden</span></div>
    <div class="row gap12 wrap sm">${['Figma', 'Obsidian', 'Google Kalender'].map((n) => `<span class="row gap4">${ic('plug', 13, C.ink3)}${n}</span>`).join('')}</div>
    <span class="link">Mehr anzeigen (2)</span>
  </div>
</aside>`

const desktop5 = (name, main, opts = {}) =>
  frame(
    name,
    1440,
    900,
    `<div class="shell">${sidebar5(opts)}<div class="mainw">${topbar5(opts.tab ?? 0, opts.nav)}<div class="body"><div class="col grow min">${opts.bar !== false && (opts.nav || 'chat') === 'chat' && opts.tab !== -1 ? sessionBar(opts.panel) : ''}${main}</div>${opts.right === false ? '' : rightPanel5(opts.panel)}</div></div></div>${opts.overlay || ''}`
  )

// A fake screenshot, so the preview and the markup have something real-looking to sit on.
const shot = (w, h, scale = 1) => {
  const s = (v) => Math.round(v * scale)
  return `<div class="shot" style="width:${w}px;height:${h}px">
  <div class="shothead" style="height:${s(44)}px;padding:0 ${s(18)}px;gap:${s(10)}px"><span style="width:${s(22)}px;height:${s(22)}px;border-radius:${s(6)}px;background:${C.brand}"></span><span class="shotl" style="width:${s(90)}px;height:${s(9)}px"></span><span class="grow"></span><span class="shotl" style="width:${s(46)}px;height:${s(8)}px"></span><span class="shotl" style="width:${s(46)}px;height:${s(8)}px"></span><span class="shotl" style="width:${s(46)}px;height:${s(8)}px"></span></div>
  <div style="padding:${s(28)}px ${s(32)}px;display:flex;flex-direction:column;gap:${s(14)}px">
    <span class="shotl" style="width:${s(260)}px;height:${s(18)}px;background:#e8e7e2"></span>
    <span class="shotl" style="width:${s(380)}px;height:${s(9)}px"></span>
    <div style="display:flex;gap:${s(14)}px;margin-top:${s(10)}px">${[0, 1, 2].map(() => `<span class="shotcard" style="height:${s(120)}px;border-radius:${s(10)}px"></span>`).join('')}</div>
  </div></div>`
}
const thumbImg = (size = 44) =>
  `<span class="timg" style="width:${size}px;height:${size}px">${shot(size * 4, size * 4, 1).replace('class="shot"', `class="shot" style="transform:scale(.25);transform-origin:0 0"`)}</span>`

// Composer attachment: thumbnail, name cut with … after a fixed width, full name in the tooltip.
const attach5 = (name, opts = {}) =>
  `<span class="att5${opts.hover ? ' hover' : ''}"><span class="attimg">${opts.code ? ic('file-code', 16, C.ink2) : opts.shot ? shot(30, 30, 0.07) : ''}${opts.marked ? `<span class="markbadge">${ic('pencil', 10, '#fff')}</span>` : ''}</span><span class="attname">${name}</span>${ic('x', 12, C.ink3)}${opts.tip ? `<span class="tip5">${opts.tip}</span>` : ''}</span>`
const promptInput5 = (opts = {}) => {
  const acc = ACC[opts.acc || 'work']
  const files = opts.files
    ? `<div class="row gap8">${attach5('header-homeserver-final-v2.png', { shot: true, hover: opts.tip, marked: opts.marked, tip: opts.tip ? '<b>header-homeserver-final-v2.png</b><span>1280 × 720 · 240 KB · Klick öffnet die Vorschau</span>' : '' })}${attach5('screenshot.png')}${attach5('SiteHeader.vue', { code: true })}</div>`
    : ''
  return `<div class="col gap6"><div class="pinput${opts.focus ? ' focus' : ''}">
  ${files}
  <div class="ptext${opts.text ? '' : ' ph ph8'}">${opts.text || '<span>Nachricht an Claude …</span><span class="phk">/ Befehle · @ Dateien · ! Shell</span>'}</div>
  <div class="prow">
    ${iconBtn('paperclip')}
    <span class="chip plain">${clawd(10)}<span>Opus 5.5 · Hoch</span>${ic('chevron-down', 12, C.ink3)}</span>
    <span class="chip plain${opts.accOpen ? ' chipon' : ''}">${dot(acc.color, 7)}<span>${acc.name} · ${acc.plan}</span>${ic('chevron-down', 12, C.ink3)}</span>
    <span class="chip plain">${ic('zap', 13, C.warn)}<span>Auto</span><span class="kbd" style="font-size:10px">⇧Tab</span></span>
    <span class="grow"></span>
    <span class="ctx"><span class="ring" style="background:conic-gradient(${C.brand} 0 11%, ${C.line2} 11% 100%)"><span></span></span><span class="muted sm">11 %</span></span>
    <span class="send${opts.text ? '' : ' off'}">${ic('arrow-up', 16, opts.text ? '#fff' : C.ink3)}</span>
  </div>
</div></div>`
}
const userImages5 = (text) => `
<div class="umsg">
  <div class="row gap8">${['header-homeserver-final-v2.png', 'screenshot-mobile.png'].map((n) => `<span class="uimg5"><span class="uthumb">${shot(160, 100, 0.22)}</span><span class="uname">${n}</span></span>`).join('')}</div>
  <div class="bubble">${text}</div>
</div>`

const promptInput = (opts = {}) => (opts.compact ? promptInputCompact(opts) : promptInput5(opts))

// ---------- frames ----------
const frame = (name, w, h, inner, extra = '') =>
  `<section class="frame" data-name="${name}" style="width:${w}px;height:${h}px;${extra}">${inner}</section>`

// Every desktop screen uses the shell as built in round 5 (sidebar, tab bar, session bar, panel).
const desktop = (name, active, main, right = true, activeTab = 0, sel = 'brand', panel = {}) =>
  desktop5(name, main, { nav: active, right, tab: activeTab, sel, panel })

const chatColumn = (inner, input = promptInput({ text: '' }), end = false) => `
<div class="chat"><div class="stream${end ? ' end' : ''}">${inner}</div><div class="inputwrap">${input}</div></div>`

// 10 Chat, active session
const chatActive = desktop(
  '10 Chat · aktive Session',
  'chat',
  chatColumn(
    `
  ${systemMessage('play', 'Session gestartet · Dieser PC · C:\\me\\dev\\projects\\nexron-chat · Opus 5.5 · Auto')}
  ${userMessage('Mach den Header wie beim Homeserver, nur mit Bull-Logo und danach dem NEXRON-Logo.', true)}
  ${reasoning(true)}
  ${chainOfThought()}
  <div class="md">
    <p>Der Header sieht jetzt aus wie auf der Homeserver-Startseite: <b>Bulle und „Bull“</b>, ein Trennstrich, dann das <b>NEXRON-Logo</b>. Die Tabs folgen rechts daneben.</p>
    ${codeBlock()}
    <ul><li>Build und 21 Tests laufen durch.</li><li>In <code>preview</code> gemergt, sichtbar auf localhost:1460.</li></ul>
    ${sources()}
  </div>
  ${feedbackBar()}
  ${steps()}
  ${thinkingBar()}
`,
    promptInput({
      text: 'Super, mach noch den Fokusring passend zur Marke',
      files: true,
      focus: true
    }),
    true
  )
)

// 11 Approvals and questions
const sbtn = (label, icon, variant = 'ghost', key = '') =>
  `<span class="btn btn-${variant} s">${icon ? ic(icon, 13, variant === 'primary' ? '#fff' : C.ink2) : ''}${label}${key ? `<span class="kbd inbtn">${key}</span>` : ''}</span>`
const approvalCard = `
<div class="appr c">
  <div class="row gap8">${ic('shield-alert', 15, C.crit)}<span class="strong sm">Freigabe nötig</span><span class="muted xs">Bash</span></div>
  <div class="mono xs codeinline">git push -u origin feat/bull-brand</div>
  <span class="muted xs">Pusht den Feature-Branch nach GitHub.</span>
  <div class="row gap6">${sbtn('Erlauben', 'check', 'primary', '1')}${sbtn('Immer für git push', 'check-check', 'ghost', '2')}${sbtn('Ablehnen', 'x', 'ghost', '3')}</div>
  <div class="denyph"><span class="sm grow muted">Nein, und Claude sagen, was stattdessen …</span></div>
</div>`
const questionCard = `
<div class="quest c">
  <div class="row gap8">${ic('message-circle-question', 15, C.read)}<span class="strong sm">Welche Variante soll das App-Icon werden?</span></div>
  <div class="opts c">
    ${[
      ['1', 'Solid', 'einfarbig blau, ohne Kachel', true],
      ['2', 'Two-Tone', 'helle Hörner, Verlauf'],
      ['3', 'Front', 'frontal, kantig'],
      ['4', 'App-Kachel', 'dunkle Kachel mit Verlauf']
    ]
      .map(
        ([n, t, d, on]) =>
          `<div class="opt c${on ? ' on' : ''}">${ic(on ? 'circle-dot' : 'circle', 14, on ? C.brand : C.ink3)}<span class="strong sm nowrap">${t}</span><span class="muted xs trunc grow">${d}</span>${kbd(n)}</div>`
      )
      .join('')}
    <div class="opt c">${ic('pencil', 14, C.ink3)}<span class="muted sm">Eigene Antwort …</span></div>
  </div>
  <div class="row gap6" style="justify-content:flex-end">${sbtn('Überspringen')}${sbtn('Antworten', 'send', 'primary')}</div>
</div>`
const planCard = `
<div class="plan c">
  <div class="row gap8">${ic('clipboard-list', 15, C.change)}<span class="strong sm">Plan</span><span class="muted xs">Erst planen</span></div>
  <ol><li>PWA-Manifest und Icons aus dem Bullen erzeugen</li><li>Service Worker nur außerhalb von Tauri registrieren</li><li>Im Browser prüfen, ob „App installieren“ erscheint</li><li>Feature-Branch pushen, in preview mergen</li></ol>
  <div class="row gap6" style="justify-content:flex-end">${sbtn('Anpassen', 'pencil', 'ghost', '2')}${sbtn('Plan annehmen', 'check', 'primary', '1')}</div>
</div>`
const chatApprovals = desktop(
  '11 Chat · Freigabe, Frage, Plan',
  'chat',
  chatColumn(
    `
  ${userMessage('Push den Branch und frag mich, welche Icon-Variante ich will.')}
  ${toolCard('change', 'Bash', 'npm run build &amp;&amp; npm test', 'ok')}
  ${approvalCard}
  ${questionCard}
  ${planCard}
`,
    promptInput({})
  )
)

// 17 Switch the account of one chat
const accRow = (key, h5, wk, on, note) =>
  `<div class="pitem${on ? ' on' : ''}">${dot(ACC[key].color, 9)}<div class="col min grow gap4"><div class="between"><span class="strong">${ACC[key].name} · ${ACC[key].plan}</span>${on ? ic('check', 14, C.brand) : '<span class="xs muted">' + note + '</span>'}</div><div class="row gap8 xs muted"><span class="nowrap">5 h ${h5} %</span>${meter(h5, ACC[key].color, '60px', 4)}<span class="nowrap">Woche ${wk} %</span>${meter(wk, wk > 60 ? C.warn : ACC[key].color, '60px', 4)}</div></div></div>`
const accSwitchMain = `<div class="chat"><div class="stream end">
  ${userMessage('Bau die Wochenansicht im Kalender fertig.')}
  ${toolCard('read', 'Read', 'src/components/calendar/CalendarWeek.vue', 'ok')}
  ${systemMessage('triangle-alert', 'privat · Pro: 5-Stunden-Fenster zu 96 % voll, Reset in 3:05 h', C.warn)}
  <div class="md"><p>Die Spalten pro Tag stehen. Als Nächstes kommen Termine, die über Mitternacht gehen.</p></div>
</div><div class="inputwrap">${promptInput({ acc: 'own', accOpen: true })}</div>
<div class="accpop">
  <div class="plabel">Konto für diesen Chat</div>
  ${accRow('own', 96, 71, true)}
  ${accRow('work', 42, 63, false, '58 % frei')}
  <div class="pdiv"></div>
  <div class="xs muted pnote">${ic('info', 12, C.ink3)}Nur dieser Chat wechselt. Verlauf, Subagents und /rewind-Stände kommen mit.</div>
</div></div>`
// 18 Sidebar: drag the width, collapse to a rail, full-width overview, reorder by drag
const miniRow = (status, title, folder, acc, extra = '') =>
  `<div class="drow2${extra}"><span class="grip">${ic('grip-vertical', 14, C.ink3)}</span>${statusIcon(status, 16)}<div class="col min grow gap2"><span class="trunc strongish">${title}</span><div class="row gap6 xs muted">${ic('folder', 11, C.ink3)}<span class="trunc">${folder}</span>${accChip(acc)}</div></div></div>`
const panel18 = (title, hint, inner) =>
  `<div class="p18"><div class="col gap4"><span class="strong">${title}</span><span class="muted sm">${hint}</span></div><div class="stage">${inner}</div></div>`
const resizeDemo = `<div class="mshell"><div class="mside" style="width:250px">${miniRow('approval', 'Bull-Brand: Figma', 'nexron-chat', 'work')}${miniRow('working', 'PWA installierbar', 'nexron-chat', 'work')}${miniRow('working', 'Kalender Woche', 'kramlos', 'own')}<div class="rhandle on"><span class="wtip">320 px</span></div></div><div class="mchat"><span class="ml" style="width:70%"></span><span class="ml" style="width:50%"></span></div></div>`
const railDemo = `<div class="mshell"><div class="rail">${bull(22)}<span class="ibtn" style="background:${C.brand}">${ic('plus', 15, '#fff')}</span>${ic('search', 16, C.ink3)}<span class="rdiv"></span><span class="rdot">${statusIcon('approval', 16)}</span><span class="rdot">${statusIcon('working', 16)}</span><span class="rdot">${statusIcon('working', 16)}</span><span class="rdot">${statusIcon('done', 16)}</span><span class="grow"></span>${ic('panel-left-open', 16, C.ink3)}</div><div class="mchat"><span class="ml" style="width:70%"></span><span class="ml" style="width:50%"></span><span class="ml" style="width:60%"></span></div></div>`
const FULL_ROWS = [
  ['approval', 'Bull-Brand: Figma', 'nexron-chat', 'work', 'Bash · git push'],
  ['working', 'PWA installierbar', 'nexron-chat', 'work', 'Edit · site.webmanifest'],
  ['working', 'Kalender Woche', 'kramlos', 'own', 'Read · CalendarWeek.vue'],
  ['waiting', 'Homeserver Deploy', 'homeserver', 'work', '1 Shell im Hintergrund'],
  ['done', 'Quota-Header', 'agentdashboard', 'work', 'fertig vor 18 min'],
  ['done', 'Reel Shots', 'reels', 'own', 'fertig vor 41 min']
]
const fullDemo = `<div class="mshell"><div class="mside full">${FULL_ROWS.map(([st, title, folder, acc, live]) => `<div class="frow2">${statusIcon(st, 16)}<span class="strongish trunc" style="width:150px">${title}</span><span class="xs muted" style="width:96px">${folder}</span>${accChip(acc)}<span class="liveline trunc grow">${live}</span></div>`).join('')}<div class="rhandle"></div></div></div>`
const dragDemo = `<div class="mshell"><div class="mside" style="width:280px">${miniRow('approval', 'Bull-Brand: Figma', 'nexron-chat', 'work')}<div class="dropline"></div>${miniRow('working', 'Kalender Woche', 'kramlos', 'own', ' lifted')}${miniRow('working', 'PWA installierbar', 'nexron-chat', 'work', ' ghost')}${miniRow('waiting', 'Homeserver Deploy', 'homeserver', 'work')}</div><div class="mchat col gap8"><span class="xs muted">Tabs ordnen</span><div class="row gap4"><span class="tab on">${statusIcon('approval', 13)}Bull-Brand</span><span class="tab lifted2">${statusIcon('working', 13)}Kalender</span><span class="tabdrop"></span><span class="tab">${statusIcon('working', 13)}PWA</span></div><span class="xs muted" style="margin-top:10px">Anhänge ordnen</span><div class="row gap6"><span class="thumb"></span><span class="thumb lifted2"></span><span class="tabdrop" style="height:44px"></span><span class="thumb"></span></div></div></div>`
const sidebarFrame = frame(
  '18 Seitenleiste · Breite, Einklappen, Sortieren',
  1440,
  1300,
  `<div class="page pad">
  <div class="col gap4"><h1>Seitenleiste ziehen, einfahren, sortieren</h1><span class="muted">Rand ziehen ändert die Breite (240 px bis volle Breite), Doppelklick auf den Rand oder Ctrl B fährt ein. Ordnen per Drag &amp; Drop mit vue-draggable-plus.</span></div>
  <div class="grid2">
    ${panel18('Breite ziehen', 'Griff am rechten Rand, beim Ziehen blaue Linie und Breite als Hinweis. Rastet bei 240 px und bei voller Breite ein.', resizeDemo)}
    ${panel18('Eingefahren', 'Schmale Leiste mit Bulle, Neu, Suche und einem Status-Icon pro Session. Klick öffnet die Session, der Tooltip zeigt den Titel.', railDemo)}
    ${panel18('Volle Breite', 'Bis an den rechten Rand gezogen, wird die Leiste zur Übersicht in Zeilen: Status, Titel, Ordner, Konto, aktueller Schritt.', fullDemo)}
    ${panel18('Ordnen per Drag &amp; Drop', 'Der Griff erscheint beim Hover. Innerhalb einer Gruppe frei sortierbar, die Reihenfolge bleibt gespeichert. Genauso für Tabs und Bild-Anhänge.', dragDemo)}
  </div>
  <div class="panel"><span class="strong">Wo vue-draggable-plus sonst passt</span>
    <div class="tbl mot"><div class="tr th"><span>Wo</span><span>Was</span><span>Gespeichert</span><span>Hinweis</span></div>
      <div class="tr"><span class="strong">Sessions links</span><span>innerhalb der Gruppe</span><span class="mono">useStorage</span><span>Gruppe folgt dem Status, darin gilt die eigene Reihenfolge</span></div>
      <div class="tr"><span class="strong">Tabs oben</span><span>Reihenfolge der Tabs</span><span class="mono">Tab-Metadaten</span><span>wie in herdr; Tastatur Ctrl Shift ← / →</span></div>
      <div class="tr"><span class="strong">Bild-Anhänge</span><span>Reihenfolge vor dem Senden</span><span>nur im Entwurf</span><span>Claude sieht die Bilder in dieser Reihenfolge</span></div>
      <div class="tr"><span class="strong">Rechner-Umschalter</span><span>Reihenfolge der Rechner</span><span class="mono">useStorage</span><span>später, ab mehr als zwei Rechnern</span></div>
    </div>
  </div>
</div>`
)

const accSwitch = desktop('17 Konto pro Chat wechseln', 'chat', accSwitchMain, true, 2, 'cal', {
  folder: 'kramlos',
  branch: 'feat/calendar-week',
  acc: 'own'
})

// 12 Overview, like the Agent Dashboard
const sessionCard = (status, title, machine, folder, live, mins, tokens) => `
<div class="scard${status === 'approval' ? ' alert' : ''}">
  <div class="row gap8">${pill(status)}<span class="grow"></span><span class="muted sm row gap4">${ic('clock', 12, C.ink3)}${mins}</span></div>
  <div class="strong lg trunc">${title}</div>
  <div class="row gap6 muted sm">${ic('monitor', 12, C.ink3)}${machine}<span>·</span>${ic('folder', 12, C.ink3)}${folder}</div>
  <div class="live">${live}</div>
  <div class="row gap8 sm muted">${clawd(9)}<span>Opus 5.5</span><span>·</span><span>${tokens}</span><span class="grow"></span><span class="link">Öffnen ${ic('arrow-right', 12, C.ink3)}</span></div>
</div>`
const doneRow = (title, machine, summary, dur, files) => `
<div class="drow">${ic('circle-check', 16, C.good)}<div class="col min grow"><span class="strong trunc">${title}</span><span class="muted sm trunc">${summary}</span></div>
<span class="muted sm nowrap">${machine}</span><span class="muted sm nowrap row gap4">${ic('file-diff', 12, C.ink3)}${files}</span><span class="muted sm nowrap">${dur}</span>${iconBtn('archive', false, 14)}${btn('Fortsetzen', 'play')}</div>`
// A free place in the running grid: the row is never left half empty (Agent Dashboard's ghosts).
const ghostCard = () =>
  `<div class="scard ghost"><div class="row gap8"><span class="sk" style="width:72px;height:18px;border-radius:99px"></span><span class="grow"></span><span class="sk" style="width:44px;height:10px"></span></div><span class="sk" style="width:70%;height:14px"></span><span class="sk" style="width:50%;height:10px"></span><span class="sk" style="width:100%;height:30px;border-radius:8px"></span><span class="sk" style="width:40%;height:10px"></span></div>`
const overviewMain = `
<div class="page">
  <div class="between"><div class="col gap4"><h1>Übersicht</h1><span class="muted">Alle Sessions auf allen Rechnern</span></div>
    ${iconBtn('refresh-cw')}</div>
  <div class="quota">
    ${quotaBox('office · Max', 42, 63, '2:14 h')}
    ${quotaBox('privat · Pro', 12, 31, '4:40 h')}
    <div class="qbox"><span class="muted sm">Heute</span><span class="big">1,8 Mio</span><span class="muted sm">Tokens in 6 Sessions</span></div>
  </div>
  <div class="sect2">${ic('radio', 15, C.ink3)}<span>Laufend</span><span class="count">4</span></div>
  <div class="grid3">
    ${sessionCard('approval', 'Bull-Brand: Figma-Design', 'Dieser PC', 'nexron-chat', `${ic('shield-alert', 13, C.crit)}<span>Bash · git push -u origin feat/bull-brand</span>`, '24 min', '182k')}
    ${sessionCard('working', 'PWA installierbar', 'Dieser PC', 'nexron-chat', `${ic('file-pen', 13, C.change)}<span>Edit · public/site.webmanifest</span>`, '6 min', '41k')}
    ${sessionCard('working', 'Kalender Wochenansicht', 'Dieser PC', 'kramlos', `${ic('file-search', 13, C.read)}<span>Read · CalendarWeek.vue</span>`, '12 min', '96k')}
    ${sessionCard('waiting', 'Homeserver Deploy', 'nexron-server', 'homeserver', `${ic('hourglass', 13, C.warn)}<span>Wartet auf 1 Shell im Hintergrund</span>`, '3 min', '18k')}
    ${ghostCard()}${ghostCard()}
  </div>
  <div class="sect2">${ic('history', 15, C.ink3)}<span>Fertig</span><span class="count">5</span><span class="grow"></span><span class="seg"><span class="on">Heute</span><span>Woche</span><span>Alle</span></span></div>
  <div class="dlist">
    ${doneRow('Quota-Header fixen', 'Dieser PC', 'Header bei 1200 px nicht mehr abgeschnitten, Countdowns im Tooltip', '18 min', '4')}
    ${doneRow('Blender Reel Shots', 'Dieser PC', 'Fünf Kamerafahrten, ein Ordner pro Shot', '41 min', '7')}
    ${doneRow('agentd auf Nexron PC', 'nexron-server', 'agentd.exe deployt, Tabs überleben Neustart', '9 min', '2')}
  </div>
</div>`
function quotaBox(acc, h5, wk, reset) {
  return `<div class="qbox"><div class="between"><span class="strong">${acc}</span><span class="muted xs">Reset ${reset}</span></div>
   <div class="col gap4"><div class="between xs muted"><span>5 h</span><span>${h5} %</span></div>${meter(h5, C.brand)}</div>
   <div class="col gap4"><div class="between xs muted"><span>Woche</span><span>${wk} %</span></div>${meter(wk, wk > 60 ? C.warn : C.brand)}</div></div>`
}
const overview = desktop(
  '12 Übersicht · laufende und fertige Chats',
  'overview',
  overviewMain,
  false,
  -1
)

// ---------- usage chart (mirrors src/components/usage/UsageDayChart.vue) ----------
// Real-shaped data: one heavy day next to quiet ones, in millions, as the app sees it.
const SERIES = { opus: '#3987e5', sonnet: '#199e70', haiku: '#c98500' }
const SERIES_NAMES = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' }
const USAGE_DAYS = [
  ['3.11.', 152, 0, 8],
  ['4.11.', 0, 0, 0],
  ['5.11.', 4, 0, 0],
  ['6.11.', 26, 0, 4],
  ['7.11.', 3, 0, 0],
  ['8.11.', 14, 0, 1],
  ['9.11.', 18, 2, 5],
  ['10.11.', 6, 0, 0],
  ['11.11.', 0, 0, 0],
  ['12.11.', 0, 0, 0],
  ['13.11.', 214, 6, 10],
  ['14.11.', 540, 4, 16],
  ['15.11.', 1452, 18, 30],
  ['16.11.', 112, 0, 8]
]
const compactDe = new Intl.NumberFormat('de', { notation: 'compact', maximumFractionDigits: 1 })
const mio = (m) => compactDe.format(m * 1e6)
// Copy of `stackOf` and `liftThin` in src/utils/dayChart.ts (the generator cannot import TS):
// true height, 4 px minimum per day and per model, 2 px gap, segments plus gaps fill the bar.
const SEG_MIN = 4
const SEG_GAP = 2
const liftThin = (used, room, lifted) => {
  const free = room - SEG_MIN * lifted.size
  const freeSum = used.reduce((t, [k, v]) => (lifted.has(k) ? t : t + v), 0)
  const shareOf = (v) => (v / freeSum) * free
  const thin = used.filter(([k, v]) => !lifted.has(k) && shareOf(v) < SEG_MIN)
  if (thin.length) return liftThin(used, room, new Set([...lifted, ...thin.map(([k]) => k)]))
  return used.map(([k, v]) => [k, lifted.has(k) ? SEG_MIN : shareOf(v)])
}
const stackPx = (parts, height) => {
  const used = parts.filter(([, v]) => v > 0)
  if (!used.length) return []
  const biggest = used.reduce((a, b) => (b[1] > a[1] ? b : a))
  const room = height - SEG_GAP * (used.length - 1)
  if (used.length === 1 || room < SEG_MIN * used.length) return [[biggest[0], height]]
  return liftThin(used, room, new Set())
}
const usageTip = (o, so, h) =>
  `<div class="ctip"><span class="ctipd">Samstag, 14. November</span><span class="ctipv">${mio(o + so + h)} Tokens</span>${Object.entries(
    { opus: o, sonnet: so, haiku: h }
  )
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<span class="row gap8"><span class="ckey" style="background:${SERIES[k]}"></span><b>${mio(v)}</b><span class="ctipd">${SERIES_NAMES[k]}</span></span>`
    )
    .join('')}</div>`
const usageSwitch = (phone) =>
  `<span class="seg cseg${phone ? ' full' : ''}"><span class="on">Alle</span>${Object.keys(SERIES)
    .map((k) => `<span>${dot(SERIES[k], 7)}${SERIES_NAMES[k]}</span>`)
    .join('')}</span>`
const usageChart = ({ plot = 224, phone = false, hover = -1 } = {}) => {
  const top = 1500
  const ticks = [0, 500, 1000, 1500]
  const total = USAGE_DAYS.reduce((t, [, o, so, h]) => t + o + so + h, 0)
  const avg = total / USAGE_DAYS.length
  const step = phone ? 3 : 1
  const last = USAGE_DAYS.length - 1
  const cols = USAGE_DAYS.map(([day, o, so, h], i) => {
    const t = o + so + h
    const height = t ? Math.max(4, (t / top) * plot) : 0
    const segs = stackPx(
      [
        ['opus', o],
        ['sonnet', so],
        ['haiku', h]
      ],
      height
    )
    const text = i === last ? 'Heute' : (last - i) % step === 0 ? day : ''
    return {
      bar: `<div class="ccol${i === hover ? ' on' : ''}">${i === hover ? usageTip(o, so, h) : ''}<div class="cbar" style="height:${height}px">${segs
        .map(([k, px]) => `<span style="height:${px}px;background:${SERIES[k]}"></span>`)
        .join('')}</div></div>`,
      label: `<span class="cday${i === last ? ' today' : ''}">${text}</span>`
    }
  })
  return `<div class="panel cpanel">
    <div class="${phone ? 'col gap12' : 'between'}" style="align-items:${phone ? 'stretch' : 'flex-start'}"><div class="col"><span class="strong">Tokens pro Tag</span><span class="xs muted">Eingabe, Ausgabe und Cache</span></div>${usageSwitch(phone)}</div>
    <div class="cstats${phone ? ' narrow' : ''}"><div class="col gap2"><span class="xs muted">Gesamt</span><span class="cstat">${mio(total)}</span></div><div class="col gap2"><span class="xs muted row gap6"><span class="cavgkey"></span>Ø pro Tag</span><span class="cstat">${mio(avg)}</span></div><div class="col gap2"><span class="xs muted">Spitzentag</span><span class="${phone ? 'col' : 'row gap6'}" style="align-items:${phone ? 'flex-start' : 'baseline'}"><span class="cstat">${mio(1500)}</span><span class="xs muted">So., 15.11.</span></span></div></div>
    <div class="cplotwrap"><div class="cplot" style="height:${plot}px">
      ${ticks.map((t) => `<div class="cgrid" style="bottom:${(t / top) * plot}px"><span class="ctick">${t ? mio(t) : '0'}</span></div>`).join('')}
      <div class="cbars">${cols.map((c) => c.bar).join('')}</div>
      <div class="cavg" style="bottom:${(avg / top) * plot}px"></div>
    </div><div class="cdays">${cols.map((c) => c.label).join('')}</div></div>
  </div>`
}

// 13 Usage
const usageMain = `
<div class="page">
  <div class="between"><div class="col gap4"><h1>Nutzung</h1><span class="muted">Tokens, Limits und Kosten aller Konten</span></div><span class="seg"><span>7 Tage</span><span class="on">14 Tage</span><span>30 Tage</span></span></div>
  <div class="quota">
    ${quotaBox('office · Max', 42, 63, '2:14 h')}${quotaBox('privat · Pro', 12, 31, '4:40 h')}
    <div class="qbox"><span class="muted sm">14 Tage</span><span class="big">19,4 Mio</span><span class="muted sm row gap4">${ic('trending-up', 13, C.good)}+12 % zur Vorwoche</span></div>
  </div>
  ${usageChart({ hover: 11 })}
  <div class="grid2">
    <div class="panel"><span class="strong">Nach Projekt</span>
      ${[
        ['nexron-chat', 38],
        ['kramlos', 24],
        ['agentdashboard', 17],
        ['homeserver', 11],
        ['reels', 10]
      ]
        .map(
          ([p, v]) =>
            `<div class="col gap4"><div class="between sm"><span class="mono">${p}</span><span class="muted">${v} %</span></div>${meter(v * 2.4, C.read, '100%', 5)}</div>`
        )
        .join('')}
    </div>
    <div class="panel"><span class="strong">Nach Rechner und Modell</span>
      <div class="tbl"><div class="tr th"><span>Rechner</span><span>Opus</span><span>Sonnet</span><span>Haiku</span></div>
      <div class="tr"><span>Dieser PC</span><span>12,1 Mio</span><span>3,4 Mio</span><span>0,9 Mio</span></div>
      <div class="tr"><span>nexron-server</span><span>1,8 Mio</span><span>0,9 Mio</span><span>0,3 Mio</span></div></div>
    </div>
  </div>
</div>`
const usage = desktop('13 Nutzung · AI Usage', 'usage', usageMain, false, -1)

// The sleeping Clawd as pixels, traced from src/assets/clawd-sleeping-still.png. The app tints the
// GIF with an SVG filter, which the Figma import drops; inline fills follow withAccent instead.
const CLAWD_BODY = [
  [27, 97, 6, 6],
  [39, 97, 5, 6],
  [62, 97, 5, 6],
  [72, 97, 7, 6],
  [16, 103, 74, 14],
  [16, 117, 14, 2],
  [42, 117, 22, 2],
  [76, 117, 14, 2],
  [16, 119, 74, 1],
  [5, 120, 96, 12]
]
const CLAWD_EYES = [
  [30, 117, 12, 2],
  [64, 117, 12, 2]
]
const pixelRects = (list) =>
  list.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('')
const clawdSleeping = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="68" viewBox="0 0 107 136" shape-rendering="crispEdges" style="flex:none;display:block"><g fill="${C.brand}">${pixelRects(CLAWD_BODY)}</g><g fill="#000">${pixelRects(CLAWD_EYES)}</g></svg>`
const clawdEmpty = (title, hint, typed = '', action = '', h = 300, bare = false) => `
<div class="cempty${bare ? ' bare' : ''}" style="${bare ? '' : `height:${h}px`}">
  <div class="cglow"></div><div class="cdots"></div>
  <div class="cbody">
    ${clawdSleeping()}
    <div class="col gap4 center"><span class="strong" style="color:${C.ink2}">${title}</span><span class="muted sm" style="max-width:300px">${hint}</span></div>
    <div class="cprompt"><span style="color:${C.brand}">&gt;</span><span style="color:${C.ink2}">${typed}</span><span class="caret"></span></div>
    ${action}
  </div>
</div>`

// 14 New session, herdr-simple: + opens a tab, small popover for the folder
const newSessionMain = `
<div class="chat"><div class="stream emptyc">
  ${clawdEmpty('Clawd wartet auf die erste Anfrage', 'Neue Session auf Dieser PC in nexron-chat. Tippen, Enter, fertig.', 'mach den fokusring', '', 340)}
  ${suggestions()}
</div><div class="inputwrap">${promptInput({ focus: true })}</div>
<div class="popover">
  <div class="psearch">${ic('search', 14, C.ink3)}<span class="muted">Ordner suchen …</span></div>
  <div class="plabel">Zuletzt</div>
  ${[
    ['nexron-chat', 'C:\\me\\dev\\projects', true],
    ['agentdashboard', 'C:\\me\\dev\\projects'],
    ['kramlos', 'C:\\me\\dev\\projects'],
    ['nexron-homeserver', 'C:\\me\\dev\\projects']
  ]
    .map(
      ([n, p, on]) =>
        `<div class="pitem${on ? ' on' : ''}">${ic('folder', 14, on ? C.brand : C.ink3)}<div class="col min"><span>${n}</span><span class="muted xs trunc">${p}</span></div>${on ? kbd('Enter') : ''}</div>`
    )
    .join('')}
  <div class="pdiv"></div>
  <div class="row gap8 xs muted"><span class="chip">${clawd(9)}Opus 5.5</span><span class="chip">${ic('zap', 12, C.ink3)}Auto</span><span class="chip">${ic('user', 12, C.ink3)}office</span></div>
</div></div>`
const newSession = desktop(
  '14 Neue Session · so einfach wie herdr',
  'chat',
  newSessionMain,
  false,
  5
)

// 15 Empty states
const empty = (icon, title, text, action, h = 300, bare = false) => `
<div class="empty${bare ? ' bare' : ''}" style="${bare ? '' : `height:${h}px`}">${tile(icon, C.ink2, 48)}<span class="strong lg">${title}</span><span class="muted center" style="max-width:280px">${text}</span>${action}</div>`
const emptyMain = `
<div class="page">
  <div class="col gap4"><h1>Leere Zustände</h1><span class="muted">Leerer Chat: schlafender Clawd wie im Agent Dashboard. Alles andere: Icon in weicher Kachel, kurzer Titel, eine Zeile mit dem nächsten Schritt.</span></div>
  <div class="grid3">
    ${clawdEmpty('Noch kein Chat offen', 'Starte eine neue Session oder setze eine frühere fort.', '', btn('Neuer Chat', 'plus', 'light'))}
    ${clawdEmpty('Gerade läuft nichts', 'Auf diesem Rechner läuft keine Session. Mit Ctrl T startest du eine.', '', btn('Neue Session', 'plus'))}
    ${empty('search-x', 'Nichts gefunden', 'Keine Session passt zu „pwa manifest“.', btn('Suche zurücksetzen', 'rotate-ccw'))}
    ${empty('server-off', 'nexron-server nicht erreichbar', 'Die SSH-Verbindung ist abgebrochen. Laufende Tabs dort arbeiten weiter.', btn('Neu verbinden', 'refresh-cw'))}
    ${empty('check-check', 'Alles freigegeben', 'Gerade wartet keine Session auf dich.', '')}
    ${empty('history', 'Noch nichts fertig', 'Abgeschlossene Chats erscheinen hier mit Zusammenfassung.', '')}
  </div>
</div>`
const empties = desktop('15 Leere Zustände', 'overview', emptyMain, false, -1)

// 16 Motion
const motionRow = (what, dur, ease, how) =>
  `<div class="tr"><span class="strong">${what}</span><span class="mono">${dur}</span><span class="mono">${ease}</span><span>${how}</span></div>`
const motionFrame = (label, t, contentX, contentO, barX) => `
<div class="mframe"><div class="mlabel">${label} <span class="muted mono">${t}</span></div>
  <div class="mmini">
    <div class="mtabs"><span class="mtab">${statusIcon('approval', 11)}Bull-Brand</span><span class="mtab">${statusIcon('working', 11)}PWA</span><span class="mbar" style="left:${barX}px"></span></div>
    <div class="mcontent" style="transform:translateX(${contentX}px);opacity:${contentO}"><span class="ml" style="width:70%"></span><span class="ml" style="width:90%"></span><span class="ml" style="width:55%"></span><span class="mb"></span></div>
  </div></div>`
const motionMain = `
<div class="page">
  <div class="col gap4"><h1>Motion</h1><span class="muted">Nur transform und opacity, nichts länger als 300 ms, Exits 20 % schneller. Bei reduzierter Bewegung: sofort.</span></div>
  <div class="panel"><span class="strong">Tab wechseln · Storyboard</span>
    <div class="row gap16">
      ${motionFrame('Start', '0 ms', 0, 1, 12)}
      ${motionFrame('Alter Inhalt raus', '120 ms', -8, 0, 70)}
      ${motionFrame('Neuer Inhalt rein', '160 ms', 8, 0.4, 112)}
      ${motionFrame('Ende', '200 ms', 0, 1, 120)}
    </div>
    <span class="muted sm">Die Tab-Linie gleitet mit transform unter den neuen Tab (200 ms, ease-out-soft). Der alte Chat blendet in 120 ms aus und rückt 8 px zur Seite, der neue kommt aus der Richtung des Tabs.</span>
  </div>
  <div class="panel"><span class="strong">Übergänge</span>
    <div class="tbl mot"><div class="tr th"><span>Was</span><span>Dauer</span><span>Kurve</span><span>Wie</span></div>
      ${motionRow('Tab wechseln', '200 / 120 ms', 'ease-out-soft', 'Linie gleitet, Inhalt 8 px + Fade, Richtung = Tab-Richtung')}
      ${motionRow('Neue Nachricht', '150 ms', 'ease-out', 'von 4 px unten, Fade')}
      ${motionRow('Tool-Karte aufklappen', '200 ms', 'ease-out', 'Chevron dreht 90°, Inhalt blendet ein')}
      ${motionRow('Popover / Menü', '180 / 140 ms', 'ease-out', 'Scale 0,97 → 1 vom Auslöser, Fade')}
      ${motionRow('Rechtes Panel', '250 / 200 ms', 'ease-out-soft', 'von 16 px rechts, Fade')}
      ${motionRow('Status-Wechsel', '150 ms', 'ease', 'Icon crossfade, Fertig: kurzer Scale 1,15 → 1')}
      ${motionRow('Text-Shimmer, Loader', 'Schleife 2 s', 'linear (nur Verlauf)', 'Ausnahme: zeigt laufende Arbeit an, stoppt bei Fertig')}
    </div>
  </div>
</div>`
const motion = desktop('16 Motion · Übergänge', 'chat', motionMain, false, -1)

// 01 Foundations
const swatch = (name, hex, job) =>
  `<div class="sw"><span class="swc" style="background:${hex}"></span><div class="col"><span class="strong sm">${name}</span><span class="mono xs muted">${hex}</span><span class="xs muted">${job}</span></div></div>`
const foundations = frame(
  '01 Foundations · Night Desk + Bull',
  1440,
  1100,
  `<div class="page pad">
  <div class="row gap16">${bull(48)}<div class="col"><h1>Night Desk + Bull</h1><span class="muted">Farben aus dem Agent Dashboard. Neu ist nur die Marke: Blau.</span></div></div>
  <div class="panel"><span class="strong">Farbe nach Wichtigkeit</span>
    <div class="swgrid">
      ${swatch('critical', C.crit, 'Freigabe, Fehler, Stopp')}${swatch('warning', C.warn, 'arbeitet, wartet')}${swatch('good', C.good, 'fertig, erlaubt')}
      ${swatch('act-read', C.read, 'liest, sucht · Links')}${swatch('act-change', C.change, 'schreibt, führt aus')}${swatch('act-outside', C.outside, 'Web, MCP')}
      ${swatch('brand', C.brand, 'nur Bull-Logo, Senden')}${swatch('brand-light', C.brandL, 'Verlauf')}${swatch('brand-deep', C.brandD, 'Verlauf')}
      ${swatch('ink', C.ink, 'Inhalt')}${swatch('ink-2', C.ink2, 'Nebentext')}${swatch('ink-3', C.ink3, 'Meta, Icons')}
      ${swatch('app', C.app, 'Hintergrund')}${swatch('card', C.card, 'Karten, Panels')}${swatch('surface-2', C.s2, 'Hover, Chips')}
      ${swatch('surface-3', C.s3, 'aktiv')}${swatch('line', C.line, 'Linien')}${swatch('line-strong', C.line2, 'Eingaben')}
      ${swatch('claude', C.claude, 'nur Skills im Kontext')}${swatch('ring', C.ring, 'Fokus (offen)')}
    </div></div>
  <div class="grid2">
    <div class="panel"><span class="strong">Schrift · Geist, Geist Mono</span>
      <div class="col gap8"><span style="font-size:24px;font-weight:700;letter-spacing:-0.5px">Display 24 · Übersicht</span><span style="font-size:18px;font-weight:600">Title 18 · Neue Session auf Dieser PC</span><span style="font-size:15px">Body 15 · Claudes Antworten und Anfragen, 72 Zeichen breit.</span><span style="font-size:13px;color:${C.ink2}">Small 13 · Tool-Ziele, Chips, Listen</span><span style="font-size:12px;color:${C.ink3}">Meta 12 · Zeiten, Zähler, Modell</span><span class="mono" style="font-size:13px">Mono 13 · npm run build &amp;&amp; npm test</span></div></div>
    <div class="panel"><span class="strong">Radius, Abstände, Logos</span>
      <div class="row gap12">${[6, 8, 10, 14, 18].map((r) => `<span class="col gap4 center"><span style="width:44px;height:44px;border:1px solid ${C.line2};background:${C.s2};border-radius:${r}px"></span><span class="xs muted">${r}</span></span>`).join('')}</div>
      <div class="row gap8">${[4, 8, 12, 16, 24, 32].map((s) => `<span class="col gap4 center"><span style="width:${s}px;height:24px;background:${C.brand}55;border-radius:3px"></span><span class="xs muted">${s}</span></span>`).join('')}</div>
      <div class="row gap16"><span class="brandrow">${bull(24)}<span class="wordmark">Bull</span><span class="vr"></span>${nexron(20)}</span><span class="row gap8">${clawd(14)}<span class="muted sm">Claude-Modelle</span></span></div>
    </div>
  </div>
  <div class="panel"><span class="strong">Icons · Lucide, 16 px in Listen, 14 px in Chips, Strich 2</span>
    <div class="row gap12 wrap">${['plus', 'search', 'layout-dashboard', 'gauge', 'monitor', 'server', 'folder', 'git-branch', 'square-terminal', 'globe', 'panel-right', 'paperclip', 'mic', 'arrow-up', 'copy', 'thumbs-up', 'rotate-ccw', 'brain', 'list-tree', 'file-search', 'file-pen', 'loader-circle', 'shield-alert', 'hourglass', 'circle-check', 'message-circle-question', 'clipboard-list', 'radio', 'history', 'archive', 'play', 'zap', 'user', 'settings', 'plug', 'calendar', 'figma', 'server-off', 'search-x', 'check-check'].map((n) => `<span class="icell">${ic(n, 18, C.ink2)}<span class="xs muted">${n}</span></span>`).join('')}</div>
  </div>
</div>`
)

// 02 Components (all prompt-kit components)
const comp = (name, inner, span = 1) =>
  `<div class="comp" style="grid-column:span ${span}"><div class="compname">${ic('component', 13, C.brand)}<span>${name}</span><span class="xs muted">prompt-kit</span></div><div class="compbody">${inner}</div></div>`
const components = frame(
  '02 Komponenten · prompt-kit in Bull',
  1440,
  2050,
  `<div class="page pad">
  <div class="col gap4"><h1>Komponenten</h1><span class="muted">Alle 19 Bausteine von prompt-kit, in Vue nachgebaut, in den Bull-Farben</span></div>
  <div class="cgrid">
    ${comp('Prompt Input', promptInput({ text: 'Mach den Fokusring passend zur Marke' }), 2)}
    ${comp('Prompt Suggestion', suggestions())}
    ${comp('File Upload', `<div class="drop">${ic('image-down', 22, C.read)}<span>Bilder hier ablegen</span><span class="muted xs">oder Strg+V</span></div><div class="row gap8">${fileChip('screenshot.png', 'image')}</div>`)}
    ${comp('Chat Container', `<div class="mini">${userMessage('Wie viel ist noch frei?')}<div class="md sm"><p>Im 5-Stunden-Fenster sind noch 58 % frei.</p></div></div>`)}
    ${comp('Message', `${userMessage('Push den Branch bitte.')}<div class="row gap8"><span class="avatar sm2">${bull(14, '#fff')}</span><div class="md"><p>Gepusht nach <code>origin/feat/bull-brand</code>.</p></div></div>`)}
    ${comp('System Message', `${systemMessage('play', 'Session gestartet · Dieser PC · Opus 5.5')}${systemMessage('triangle-alert', 'API-Fehler 529: überlastet, neuer Versuch in 8 s', C.warn)}${systemMessage('arrow-right-left', 'Konto gewechselt: privat → office', C.read)}`)}
    ${comp('Scroll Button', `<div class="row gap12 center">${scrollButton()}<span class="muted sm">erscheint, sobald man hochscrollt</span></div>`)}
    ${comp('Markdown', `<div class="md"><p><b>Fett</b>, <i>kursiv</i>, <code>inline code</code> und <a>Links in act-read</a>.</p><ul><li>Liste mit Punkt</li><li>Zweiter Punkt</li></ul><blockquote>Zitat mit linker Linie</blockquote></div>`)}
    ${comp('Code Block', codeBlock())}
    ${comp('Image', `<div class="uimg"><div class="imgph" style="height:120px">${ic('image', 22, C.ink3)}<span>bull-logo.png · 512 × 512</span></div></div>`)}
    ${comp('Reasoning', reasoning(true))}
    ${comp('Chain of Thought', chainOfThought(), 2)}
    ${comp('Thinking Bar', thinkingBar())}
    ${comp('Steps', steps())}
    ${comp('Tool', `${toolCard('read', 'Read', 'src/styles/tokens.css', 'ok')}${toolCard('change', 'Bash', 'npm test', 'run')}${toolCard('outside', 'WebFetch', 'prompt-kit.com/docs/tool', 'err')}`)}
    ${comp('Loader', `<div class="row gap16 center">${ic('loader-circle', 18, C.warn)}${loaderDots()}<span class="shimmer">Lädt …</span></div>`)}
    ${comp('Text Shimmer', `<span class="shimmer lg">Claude schreibt …</span>`)}
    ${comp('Source', sources())}
    ${comp('Feedback Bar', feedbackBar())}
  </div>
</div>`
)

// 00 Cover
const cover = frame(
  '00 Cover',
  1440,
  900,
  `<div class="cover">
  <div class="glow"></div>
  ${bull(160)}
  <div class="row gap16"><span class="wordmark" style="font-size:76px">Bull</span><span class="vr" style="height:56px"></span>${nexron(52)}</div>
  <span class="muted" style="font-size:18px">Claude-Code-Sessions als Chat. Auf jedem Rechner, in Tabs, so einfach wie herdr.</span>
  <div class="row gap8">${['Tauri 2', 'Vue 3', 'prompt-kit', 'Lucide', 'Night Desk'].map((t) => `<span class="chip">${t}</span>`).join('')}</div>
</div>`
)

// 20 Mobile
const phone = (title, inner, bottom = '') =>
  `<div class="phone"><div class="pstatus"><span>9:41</span><span class="row gap4">${ic('wifi', 12, C.ink)}${ic('battery-full', 14, C.ink)}</span></div>${inner}${bottom}</div>`
const mobileChat = phone(
  'chat',
  `
  <div class="mtop">${iconBtn('menu')}<span class="row gap6">${statusIcon('approval', 14)}<span class="strong">Bull-Brand</span>${ic('chevron-down', 14, C.ink3)}</span><span class="grow"></span>${iconBtn('plus')}</div>
  <div class="mstream">${userMessage('Mach den Header wie beim Homeserver.')}${reasoning(false)}${toolCard('change', 'Edit', 'ChatView.vue', 'ok')}<div class="md"><p>Fertig: Bulle, „Bull“, Trennstrich, NEXRON-Logo.</p></div>${feedbackBar()}${approvalCard}</div>`,
  `<div class="mbottom">${promptInput({ compact: true })}</div>`
)
const mobileList = phone(
  'list',
  `
  <div class="mtop"><span class="brandrow">${bull(20)}<span class="wordmark" style="font-size:17px">Bull</span></span><span class="grow"></span>${iconBtn('search')}${iconBtn('plus')}</div>
  <div class="mstream"><div class="seg full"><span class="on">Dieser PC</span><span>nexron-server</span></div>
  ${agentRow('approval', 'Bull-Brand: Figma-Design', 'nexron-chat', 'work', '24 min', 'Bash · git push', true)}${agentRow('working', 'PWA installierbar', 'nexron-chat', 'work', '6 min', 'Edit · site.webmanifest')}${agentRow('working', 'Kalender Wochenansicht', 'kramlos', 'own', '12 min', 'Read · CalendarWeek.vue')}
  <div class="sect">Fertig heute</div>${agentRow('done', 'Quota-Header fixen', 'agentdashboard', 'work', '18 min')}${agentRow('done', 'Blender Reel Shots', 'reels', 'own', '41 min')}</div>`,
  `<div class="mnav">${[
    ['messages-square', 'Chats', true],
    ['layout-dashboard', 'Übersicht'],
    ['gauge', 'Nutzung'],
    ['settings', 'Mehr']
  ]
    .map(
      ([i, t, on]) =>
        `<span class="mnavi${on ? ' on' : ''}">${ic(i, 20, on ? C.brand : C.ink3)}<span>${t}</span></span>`
    )
    .join('')}</div>`
)
const mobileUsage = phone(
  'usage',
  `
  <div class="mtop"><span class="strong lg">Nutzung</span><span class="grow"></span>${iconBtn('refresh-cw')}</div>
  <div class="mstream">${quotaBox('office · Max', 42, 63, '2:14 h')}${quotaBox('privat · Pro', 12, 31, '4:40 h')}
  <div class="panel"><span class="strong">Heute</span><span class="big">1,8 Mio</span><span class="muted sm">Tokens in 6 Sessions</span></div></div>`,
  `<div class="mnav">${[
    ['messages-square', 'Chats'],
    ['layout-dashboard', 'Übersicht'],
    ['gauge', 'Nutzung', true],
    ['settings', 'Mehr']
  ]
    .map(
      ([i, t, on]) =>
        `<span class="mnavi${on ? ' on' : ''}">${ic(i, 20, on ? C.brand : C.ink3)}<span>${t}</span></span>`
    )
    .join('')}</div>`
)
const mobileEmpty = phone(
  'empty',
  `
  <div class="mtop">${iconBtn('menu')}<span class="strong">Bull</span><span class="grow"></span>${iconBtn('plus')}</div>
  <div class="mstream emptyc">${clawdEmpty('Noch kein Chat offen', 'Starte eine neue Session oder setze eine frühere fort.', '', btn('Neuer Chat', 'plus', 'light'), 0, true)}</div>`,
  `<div class="mnav">${[
    ['messages-square', 'Chats', true],
    ['layout-dashboard', 'Übersicht'],
    ['gauge', 'Nutzung'],
    ['settings', 'Mehr']
  ]
    .map(
      ([i, t, on]) =>
        `<span class="mnavi${on ? ' on' : ''}">${ic(i, 20, on ? C.brand : C.ink3)}<span>${t}</span></span>`
    )
    .join('')}</div>`
)
const mobile = frame(
  '20 Mobile · Chat, Sessions, Nutzung, leer',
  1840,
  980,
  `<div class="row gap40 pad" style="align-items:flex-start">${mobileChat}${mobileList}${mobileUsage}${mobileEmpty}</div>`
)

// 03 Flow
const flowStep = (n, title, text, icon, keys) =>
  `<div class="flow"><span class="fnum">${n}</span>${tile(icon, C.brand, 44)}<span class="strong lg">${title}</span><span class="muted center">${text}</span><div class="row gap4">${keys}</div></div>`
const flow = frame(
  '03 Ablauf · wie in herdr',
  1440,
  520,
  `<div class="page pad">
  <div class="col gap4"><h1>Ablauf</h1><span class="muted">Drei Schritte vom Start bis zur ersten Antwort. Alles per Tastatur, nichts dazwischen.</span></div>
  <div class="row gap16" style="align-items:stretch">
    ${flowStep(1, 'Rechner wählen', 'Links in der Liste oder mit Ctrl 1 / Ctrl 2', 'monitor', kbd('Ctrl 1') + kbd('Ctrl 2'))}
    <span class="farrow">${ic('arrow-right', 20, C.ink3)}</span>
    ${flowStep(2, 'Neuer Tab', '„+“ öffnet sofort einen Tab, der zuletzt benutzte Ordner ist vorgewählt', 'plus', kbd('Ctrl T'))}
    <span class="farrow">${ic('arrow-right', 20, C.ink3)}</span>
    ${flowStep(3, 'Tippen, Enter', 'Claude legt los. Status steht im Tab und links in der Agent-Liste', 'arrow-up', kbd('Enter'))}
    <span class="farrow">${ic('arrow-right', 20, C.ink3)}</span>
    ${flowStep(4, 'Weiter oder wechseln', 'Freigaben springen nach oben, Tabs wechseln mit Ctrl Tab', 'arrow-left-right', kbd('Ctrl Tab'))}
  </div>
</div>`
)

// ---------- Mobile screens (390 x 844), one frame each, plus loading skeletons ----------
const M_W = 390
const M_H = 844
const sk = (w, h = 10, extra = '') =>
  `<span class="sk" style="width:${w};height:${h}px;${extra}"></span>`
const statusBar = () =>
  `<div class="pstatus"><span>9:41</span><span class="row gap4">${ic('wifi', 12, C.ink)}${ic('battery-full', 14, C.ink)}</span></div>`
const NAV_ITEMS = [
  ['messages-square', 'Chats'],
  ['layout-dashboard', 'Übersicht'],
  ['gauge', 'Nutzung'],
  ['settings', 'Einstellungen']
]
const mNav = (active) =>
  `<div class="mnav">${NAV_ITEMS.map(([i, t]) => `<span class="mnavi${t === active ? ' on' : ''}">${ic(i, 20, t === active ? C.brand : C.ink3)}<span>${t}</span></span>`).join('')}</div>`
const mScreen = (name, top, body, bottom = '', overlay = '') =>
  frame(
    name,
    M_W,
    M_H,
    `<div class="mscreen">${statusBar()}${top}<div class="mstream">${body}</div>${bottom}${overlay}</div>`
  )
const listTop = `<div class="mtop"><span class="brandrow">${bull(22)}<span class="wordmark" style="font-size:16px">Bull</span></span><span class="grow"></span>${iconBtn('search')}<span class="ibtn" style="background:${C.brandS}">${ic('plus', 16, '#fff')}</span></div>`
const chatTop = (status, title, acc = 'work') =>
  `<div class="mtop">${iconBtn('chevron-left')}<div class="col min grow" style="align-items:center"><span class="row gap6">${statusIcon(status, 14)}<span class="strong trunc">${title}</span></span><span class="row gap6 xs muted">${ic('monitor', 11, C.ink3)}Dieser PC ${accChip(acc)}</span></div>${iconBtn('ellipsis')}</div>`
const machineSeg = `<div class="seg full"><span class="on">Dieser PC · 6</span><span>nexron-server · 2</span></div>`
const mComposer = (opts = {}) =>
  `<div class="mbottom">${promptInput({ compact: true, ...opts })}</div>`

const mSessions = mScreen(
  'M01 Sessions',
  listTop,
  `${machineSeg}
  <div class="grp">${ic('shield-alert', 13, C.crit)}<span>Braucht dich</span><span class="count">1</span></div>
  ${agentRow('approval', 'Bull-Brand: Figma-Design', 'nexron-chat', 'work', '24 min', 'Bash · git push -u origin', true)}
  <div class="grp">${ic('loader-circle', 13, C.warn)}<span>Läuft</span><span class="count">2</span></div>
  ${agentRow('working', 'PWA installierbar', 'nexron-chat', 'work', '6 min', 'Edit · site.webmanifest')}
  ${agentRow('working', 'Kalender Wochenansicht', 'kramlos', 'own', '12 min', 'Read · CalendarWeek.vue')}
  <div class="grp">${ic('circle-check', 13, C.good)}<span>Fertig heute</span><span class="count">3</span></div>
  ${agentRow('done', 'Quota-Header fixen', 'agentdashboard', 'work', '18 min')}
  ${agentRow('done', 'Blender Reel Shots', 'reels', 'own', '41 min')}
  <span class="link" style="padding:2px 10px">${ic('chevron-down', 12, C.ink3)}Alle anzeigen (1)</span>`,
  mNav('Chats')
)

const mSessionsSearch = mScreen(
  'M02 Sessions · Suche ohne Treffer',
  `<div class="mtop">${iconBtn('chevron-left')}<div class="msearch">${ic('search', 14, C.ink3)}<span>pwa manifest</span><span class="grow"></span>${ic('x', 14, C.ink3)}</div></div>`,
  `${empty('search-x', 'Nichts gefunden', 'Keine Session passt zu „pwa manifest“.', btn('Suche zurücksetzen', 'rotate-ccw'), 0, true)}`,
  mNav('Chats')
)

const skRow = () =>
  `<div class="skrow">${sk('16px', 16, 'border-radius:99px')}<div class="col gap6 grow">${sk('70%', 11)}${sk('45%', 9)}</div>${sk('34px', 9)}</div>`
const mSessionsLoading = mScreen(
  'M03 Sessions · lädt',
  listTop,
  `${machineSeg}
  <div class="grp">${sk('90px', 10)}</div>${skRow()}${skRow()}
  <div class="grp">${sk('70px', 10)}</div>${skRow()}${skRow()}${skRow()}`,
  mNav('Chats')
)

const mChatRunning = mScreen(
  'M04 Chat · läuft',
  chatTop('working', 'Bull-Brand: Header'),
  `
  ${userMessage('Mach den Header wie beim Homeserver.')}
  ${reasoning(false)}
  <div class="cot">
    <div class="cothead">${ic('list-tree', 14, C.ink3)}<span>Zwischenschritte</span><span class="muted">· 3 Schritte</span>${ic('chevron-down', 14, C.ink3)}</div>
    <div class="cotlist">
      <div class="cotstep"><span class="cotdot">${dot(C.ink3, 6)}</span><div class="col gap6 grow">${toolCard('read', 'Read', 'SiteHeader.vue', 'ok')}</div></div>
      <div class="cotstep"><span class="cotdot">${dot(C.ink3, 6)}</span><div class="col gap6 grow">${toolCard('change', 'Edit', 'ChatView.vue', 'ok')}</div></div>
      <div class="cotstep"><span class="cotdot">${dot(C.warn, 6)}</span><div class="col gap6 grow">${toolCard('change', 'Bash', 'npm test', 'run')}</div></div>
    </div>
  </div>
  ${steps()}`,
  `<div class="mthink">${thinkingBar()}</div>${mComposer({ text: '' })}`
)

const mChatDone = mScreen(
  'M05 Chat · Antwort',
  chatTop('done', 'Bull-Brand: Header'),
  `
  ${userMessage('Mach den Header wie beim Homeserver.')}
  <div class="cothead">${ic('list-tree', 14, C.ink3)}<span>Zwischenschritte</span><span class="muted">· 6 Schritte</span>${ic('chevron-right', 14, C.ink3)}</div>
  <div class="md"><p>Der Header sieht jetzt aus wie auf der Startseite: <b>Bulle und „BULL“</b>, Trennstrich, <b>NEXRON-Logo</b>.</p>${codeBlock()}<ul><li>Build und Tests laufen durch.</li></ul>${sources()}</div>
  ${feedbackBar()}`,
  mComposer({})
)

const mChatApproval = mScreen(
  'M06 Chat · Freigabe',
  chatTop('approval', 'Bull-Brand: Push'),
  `
  ${userMessage('Push den Branch bitte.')}
  ${toolCard('change', 'Bash', 'npm run build &amp;&amp; npm test', 'ok')}
  ${approvalCard}`,
  `<div class="mthink">${thinkingBar().replace('Claude führt Befehle aus …', 'Claude wartet auf dich')}</div>${mComposer({})}`
)

const mChatQuestion = mScreen(
  'M07 Chat · Frage und Plan',
  chatTop('approval', 'App-Icon'),
  `
  <div class="m1col">${questionCard}</div>
  ${planCard}`,
  mComposer({})
)

const skMsg = (right) =>
  `<div class="col gap6" style="align-items:${right ? 'flex-end' : 'flex-start'}">${sk(right ? '62%' : '88%', right ? 36 : 12, right ? 'border-radius:14px' : '')}${right ? '' : sk('76%', 12) + sk('52%', 12)}</div>`
const mChatLoading = mScreen(
  'M08 Chat · lädt',
  chatTop('idle', 'Kalender Wochenansicht', 'own'),
  `
  ${skMsg(true)}${skMsg(false)}<div class="sktool">${sk('16px', 16)}${sk('40%', 10)}</div>${skMsg(false)}${skMsg(true)}${skMsg(false)}`,
  mComposer({})
)

const mChatEmpty = mScreen(
  'M09 Chat · leer',
  `<div class="mtop">${iconBtn('chevron-left')}<span class="strong grow" style="text-align:center">Neue Session</span>${iconBtn('ellipsis')}</div>`,
  `${clawdEmpty('Clawd wartet auf die erste Anfrage', 'Dieser PC · nexron-chat. Tippen, senden, fertig.', '', '', 0, true)}${suggestions()}`,
  mComposer({ focus: true })
)

const sheet = (title, inner) =>
  `<div class="mdim"></div><div class="msheet"><span class="grabber"></span><div class="strong" style="padding:0 4px 6px">${title}</div>${inner}</div>`
const FOLDERS = [
  ['nexron-chat', 'C:\\me\\dev\\projects', true],
  ['agentdashboard', 'C:\\me\\dev\\projects'],
  ['kramlos', 'C:\\me\\dev\\projects'],
  ['nexron-homeserver', 'C:\\me\\dev\\projects']
]
const mNewSession = mScreen(
  'M10 Neue Session · Ordner',
  listTop,
  `${machineSeg}${agentRow('approval', 'Bull-Brand: Figma-Design', 'nexron-chat', 'work', '24 min')}${agentRow('working', 'PWA installierbar', 'nexron-chat', 'work', '6 min')}`,
  mNav('Chats'),
  sheet(
    'Neue Session auf Dieser PC',
    `<div class="psearch">${ic('search', 14, C.ink3)}<span class="muted">Ordner suchen …</span></div><div class="plabel">Zuletzt</div>${FOLDERS.map(([n, p, on]) => `<div class="pitem${on ? ' on' : ''}">${ic('folder', 14, on ? C.brand : C.ink3)}<div class="col min"><span>${n}</span><span class="muted xs trunc">${p}</span></div></div>`).join('')}<div class="pdiv"></div><div class="row gap8 xs"><span class="chip">${clawd(9)}Opus 5.5</span><span class="chip">${ic('zap', 12, C.ink3)}Auto</span><span class="chip">${dot(C.brand, 6)}office</span></div><span class="btn btn-strong" style="justify-content:center;margin-top:6px">${ic('play', 15, '#fff')}Starten</span>`
  )
)

const mAccount = mScreen(
  'M11 Konto wechseln',
  chatTop('working', 'Kalender Wochenansicht', 'own'),
  `${userMessage('Bau die Wochenansicht fertig.')}${systemMessage('triangle-alert', 'privat · Pro: 5-Stunden-Fenster zu 96 % voll', C.warn)}`,
  mComposer({ acc: 'own', accOpen: true }),
  sheet(
    'Konto für diesen Chat',
    `${accRow('own', 96, 71, true)}${accRow('work', 42, 63, false, '58 % frei')}<div class="xs muted pnote">${ic('info', 12, C.ink3)}Nur dieser Chat wechselt. Verlauf und Subagents kommen mit.</div>`
  )
)

const thumbs = (n) =>
  `<div class="row gap6">${Array.from({ length: n }, (_, i) => `<span class="mthumb${i === 1 ? ' sel' : ''}">${i === n - 1 ? '' : ''}</span>`).join('')}<span class="xs muted">${n} von 10</span></div>`
const mAttach = mScreen(
  'M12 Bilder anhängen',
  chatTop('idle', 'Farben prüfen'),
  `${userMessage('Welche Farben haben diese Bilder?', true)}<div class="md"><p>Rot, Grün, Blau und Gelb.</p></div>`,
  `<div class="mbottom">${promptInputCompact({ focus: true, text: 'Und welches ist am dunkelsten?', attach: `<div class="row gap6 wrap">${attach5('Bild 19-11-54.png', { shot: true })}${attach5('header-homeserver-final-v2.png', { shot: true })}</div><span class="xs muted">2 von 10 Bildern</span>` })}</div>`
)

const mLightbox = frame(
  'M13 Bild-Großansicht',
  M_W,
  M_H,
  `<div class="mscreen" style="background:#000">${statusBar()}<div class="mtop" style="border:none"><span class="strong grow">screenshot-2.png</span><span class="xs muted">2 / 4 · 1,2 MB</span>${iconBtn('x')}</div><div class="lbimg">${ic('image', 40, C.ink3)}</div><div class="row" style="justify-content:space-between;padding:16px 24px 40px">${iconBtn('chevron-left')}<span class="row gap6">${dot(C.ink3, 6)}${dot(C.ink, 6)}${dot(C.ink3, 6)}${dot(C.ink3, 6)}</span>${iconBtn('chevron-right')}</div></div>`
)

const mOverview = mScreen(
  'M14 Übersicht',
  `<div class="mtop"><span class="strong lg grow">Übersicht</span>${iconBtn('refresh-cw')}</div>`,
  `
  <div class="row gap6 wrap"><span class="cnt" style="color:${C.crit}">${ic('shield-alert', 13, C.crit)}1</span><span class="cnt" style="color:${C.warn}">${ic('loader-circle', 13, C.warn)}3</span><span class="cnt" style="color:${C.good}">${ic('circle-check', 13, C.good)}5</span></div>
  ${sessionCard('approval', 'Bull-Brand: Figma-Design', 'Dieser PC', 'nexron-chat', `${ic('shield-alert', 13, C.crit)}<span>Bash · git push</span>`, '24 min', '182k')}
  ${sessionCard('working', 'PWA installierbar', 'Dieser PC', 'nexron-chat', `${ic('file-pen', 13, C.change)}<span>Edit · site.webmanifest</span>`, '6 min', '41k')}`,
  mNav('Übersicht')
)

const mUsage = mScreen(
  'M15 Nutzung',
  `<div class="mtop"><span class="strong lg grow">Nutzung</span><span class="seg"><span class="on">14 T</span><span>30 T</span></span></div>`,
  `
  ${quotaBox('office · Max', 42, 63, '2:14 h')}${quotaBox('privat · Pro', 96, 71, '3:05 h')}
  ${usageChart({ plot: 176, phone: true })}`,
  mNav('Nutzung')
)

const skBox = (h) =>
  `<div class="qbox">${sk('40%', 11)}${sk('100%', 6)}${sk('100%', 6)}${h ? sk('30%', 9) : ''}</div>`
const mUsageLoading = mScreen(
  'M16 Nutzung · lädt',
  `<div class="mtop"><span class="strong lg grow">Nutzung</span><span class="seg"><span class="on">14 T</span><span>30 T</span></span></div>`,
  `
  ${skBox(true)}${skBox(true)}<div class="panel cpanel"><div class="col gap12">${sk('40%', 12)}${sk('100%', 28, 'border-radius:8px')}</div><div class="cstats narrow">${[0, 1, 2].map(() => `<div class="col gap6">${sk('60%', 9)}${sk('80%', 14)}</div>`).join('')}</div><div class="cplotwrap"><div class="cbars sk-bars">${[38, 62, 30, 78, 54, 46, 22, 44, 70, 84, 52, 60, 88, 56].map((b) => `<div class="ccol"><span class="sk cbar" style="height:${b}%"></span></div>`).join('')}</div></div></div>`,
  mNav('Nutzung')
)

const mOffline = mScreen(
  'M17 Rechner nicht erreichbar',
  listTop,
  `<div class="seg full"><span>Dieser PC · 6</span><span class="on">nexron-server</span></div>${empty('server-off', 'nexron-server nicht erreichbar', 'Die SSH-Verbindung ist abgebrochen. Laufende Tabs dort arbeiten weiter.', btn('Neu verbinden', 'refresh-cw'), 0, true)}`,
  mNav('Chats')
)

// Desktop skeletons
const skCard = () =>
  `<div class="scard">${sk('30%', 18, 'border-radius:99px')}${sk('70%', 14)}${sk('50%', 10)}${sk('100%', 30, 'border-radius:8px')}${sk('40%', 10)}</div>`
const skeletonFrame = frame(
  '19 Laden · Skeletons',
  1440,
  900,
  `<div class="shell">
  <aside class="side">${'<div class="brandrow">' + bull(24) + '<span class="wordmark">Bull</span><span class="vr"></span>' + nexron(20) + '</div>'}${sk('100%', 34, 'border-radius:9px')}${sk('100%', 30, 'border-radius:10px')}<div class="grp">${sk('80px', 10)}</div>${skRow()}${skRow()}<div class="grp">${sk('60px', 10)}</div>${skRow()}${skRow()}${skRow()}</aside>
  <div class="mainw"><div class="top">${sk('110px', 22, 'border-radius:8px')}${sk('90px', 22, 'border-radius:8px')}${sk('100px', 22, 'border-radius:8px')}</div>
    <div class="body"><div class="chat"><div class="stream">
      <div class="col gap4" style="margin-bottom:6px"><h2>Laden: Skeleton in der Form des Inhalts</h2><span class="muted sm">Verlauf, Sessions, Übersicht und Nutzung zeigen beim Laden ihre eigene Form. Spinner nur für Aktionen, die du ausgelöst hast.</span></div>
      ${skMsg(true)}${skMsg(false)}<div class="sktool">${sk('16px', 16)}${sk('30%', 10)}</div><div class="sktool">${sk('16px', 16)}${sk('24%', 10)}</div>${skMsg(false)}${skMsg(true)}
      <div class="grid3" style="margin-top:10px">${skCard()}${skCard()}${skCard()}</div>
    </div><div class="inputwrap">${promptInput({})}</div></div></div></div></div>`
)

const mobileScreens = [
  mSessions,
  mSessionsSearch,
  mSessionsLoading,
  mChatRunning,
  mChatDone,
  mChatApproval,
  mChatQuestion,
  mChatLoading,
  mChatEmpty,
  mNewSession,
  mAccount,
  mAttach,
  mLightbox,
  mOverview,
  mUsage,
  mUsageLoading,
  mOffline
]

// ---------- document ----------
const FONT_FACE = `@font-face{font-family:'Climate Crisis';src:url(data:font/woff2;base64,${readFileSync(fromRoot('src/assets/fonts/climate-crisis-latin-400.woff2')).toString('base64')}) format('woff2')}`
const css = `${FONT_FACE}
.diff8{border-top:1px solid ${C.line};padding:6px 0;font-family:'Geist Mono',monospace;font-size:12px}
.dl8{display:flex;gap:8px;padding:1px 12px;color:${C.ink2}}
.dl8.add{background:${C.good}17;color:${C.ink}}
.dl8.del{background:${C.crit}17;color:${C.ink}}
.dn8{width:24px;text-align:right;color:${C.ink3};flex:none}
.ds8{width:10px;flex:none}
.dl8.add .ds8{color:${C.good}}.dl8.del .ds8{color:${C.crit}}
.sbar .crumb{color:${C.line2};font-size:12px}
.ph8{display:flex;align-items:center;gap:10px}
.phk{font-size:12px;color:${C.ink3};margin-left:auto}
.denyph{display:flex;align-items:center;border:1px solid ${C.line};border-radius:8px;padding:6px 10px}

*{box-sizing:border-box;margin:0;padding:0}
body{background:#050506;font-family:'Geist',system-ui,sans-serif;color:${C.ink};font-size:14px;line-height:1.5;display:flex;flex-direction:column;gap:80px;padding:80px}
.frame{background:${C.app};overflow:hidden;position:relative;flex:none}
.mono{font-family:'Geist Mono',monospace}
.row{display:flex;align-items:center}.col{display:flex;flex-direction:column}.grow{flex:1}.min{min-width:0}.wrap{flex-wrap:wrap}.center{justify-content:center;text-align:center}
.gap4{gap:4px}.gap6{gap:6px}.gap8{gap:8px}.gap12{gap:12px}.gap16{gap:16px}.gap40{gap:40px}
.between{display:flex;align-items:center;justify-content:space-between;gap:8px}
.muted{color:${C.ink3}}.strong{font-weight:600;color:${C.ink}}.sm{font-size:13px}.xs{font-size:12px}.lg{font-size:16px}.nowrap{white-space:nowrap}
.trunc{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pad{padding:48px}
h1{font-size:24px;font-weight:700;letter-spacing:-0.4px}h2{font-size:20px;font-weight:700;letter-spacing:-0.3px}
.kbd{font-family:'Geist Mono',monospace;font-size:11px;color:${C.ink3};border:1px solid ${C.line2};border-bottom-width:2px;border-radius:5px;padding:0 5px;line-height:17px;background:${C.s2}}
.tile{display:flex;align-items:center;justify-content:center;border-radius:12px;flex:none}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:2px 8px 2px 6px;border-radius:99px}
.meter{display:block;background:${C.line2};border-radius:99px;overflow:hidden}.meter>span{display:block;height:100%;border-radius:99px}
.btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;padding:7px 12px;border-radius:9px;color:${C.ink2};border:1px solid ${C.line2};background:${C.card};white-space:nowrap}
.btn-primary{background:${C.brand};border-color:${C.brand};color:#fff}.btn-light{background:${C.ink};border-color:${C.ink};color:${C.app}}
.ibtn{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px;flex:none}.ibtn-on{background:${C.s2}}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:${C.ink2};padding:4px 9px;border-radius:8px;background:${C.s2};white-space:nowrap}
.seg{display:inline-flex;background:${C.s2};border-radius:8px;padding:2px;font-size:12px;color:${C.ink3}}.seg span{padding:3px 9px;border-radius:6px}.seg .on{background:${C.s3};color:${C.ink}}.seg.full{display:flex}.seg.full span{flex:1;text-align:center}
.count{font-size:11px;color:${C.ink3};background:${C.s2};border-radius:99px;padding:0 7px;line-height:18px}
.link{display:inline-flex;align-items:center;gap:3px;color:${C.ink3};font-size:12px}
.avatar{width:30px;height:30px;border-radius:99px;background:${C.brandD};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex:none}.sm2{width:28px;height:28px}
.vr{width:1px;height:24px;background:${C.line2};flex:none;display:block}
.brandrow{display:flex;align-items:center;gap:10px}.wordmark{font-family:'Climate Crisis',sans-serif;font-size:17px;font-weight:400;letter-spacing:0.02em;text-transform:uppercase;line-height:1}
/* shell */
.shell{display:flex;height:100%}
.side{width:320px;flex:none;background:${C.app};border-right:1px solid ${C.line};display:flex;flex-direction:column;padding:16px 12px;gap:6px}
.side .brandrow{padding:4px 8px 14px}
.nav{display:flex;flex-direction:column;gap:2px}
.navi{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;color:${C.ink2};font-size:14px}.navi span:nth-child(2){flex:1}.navi.on{background:${C.s2};color:${C.ink}}
.sect{font-size:12px;font-weight:600;color:${C.ink3};padding:14px 10px 4px;text-transform:none}.sect.between{display:flex}
.tree{display:flex;flex-direction:column;gap:1px}
.treeh{display:flex;align-items:center;gap:7px;padding:5px 8px;color:${C.ink2};font-size:13px}.treeh span{flex:1}
.treei{display:flex;align-items:center;gap:9px;padding:5px 10px 5px 38px;border-radius:7px;font-size:13px;color:${C.ink2}}.treei span:nth-child(2){flex:1}.treei.on{background:${C.s2};color:${C.ink}}
.agents{display:flex;flex-direction:column;gap:2px}
.agent{display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:10px;font-size:13px;position:relative}.agent.on{background:${C.s2}}.agent.on::before{content:'';position:absolute;left:0;top:10px;bottom:10px;width:2px;border-radius:2px;background:${C.brand}}
.gap2{gap:2px}.strongish{font-weight:500;color:${C.ink}}
.acc{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${C.ink2};background:${C.s2};border-radius:99px;padding:0 7px 0 5px;line-height:17px;white-space:nowrap}
.agent.on .acc{background:${C.s3}}
.liveline{font-family:'Geist Mono',monospace;font-size:11px;color:${C.ink3}}
.newbtn{flex:1;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#fff;background:${C.brandS};border-radius:9px;padding:7px 10px}
.kbdw{font-family:'Geist Mono',monospace;font-size:11px;color:#ffffffb3}
.ibtn-line{border:1px solid ${C.line2};width:34px;height:34px}
.navp{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:${C.ink3};padding:6px 0;border-radius:8px}.navp.on{background:${C.s2};color:${C.ink}}
.machines{display:flex;gap:4px;background:${C.card};border:1px solid ${C.line};border-radius:10px;padding:3px}
.mach{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:${C.ink3};padding:5px 0;border-radius:7px}.mach.on{background:${C.s3};color:${C.ink}}
.grp{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:${C.ink3};padding:12px 10px 2px}
.foot{display:flex;flex-direction:column;gap:8px;padding:12px 8px 2px;border-top:1px solid ${C.line}}.frow{display:flex;align-items:center;gap:8px;font-size:12px}.fname{width:62px;color:${C.ink2}}.frow .meter{flex:1}
.swap{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${C.ink2};border:1px solid ${C.line2};border-radius:6px;padding:1px 6px;margin-left:6px}
.chipon{outline:1px solid ${C.brand}}
.accpop{position:absolute;left:calc(50% - 205px);bottom:118px;width:340px;background:${C.s2};border:1px solid ${C.line2};border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:4px;box-shadow:0 12px 32px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.4)}
.pnote{display:flex;align-items:center;gap:6px;padding:2px 10px 4px}
.account{display:flex;align-items:center;gap:10px;padding:10px 8px 2px;border-top:1px solid ${C.line}}
.mainw{flex:1;display:flex;flex-direction:column;min-width:0}
.top{height:48px;flex:none;border-bottom:1px solid ${C.line};display:flex;align-items:center;gap:6px;padding:0 12px 0 8px}
.tabs{display:flex;align-items:center;gap:2px;height:100%}
.tab{position:relative;display:flex;align-items:center;gap:7px;height:34px;padding:0 10px;border-radius:8px;font-size:13px;color:${C.ink3}}.tab.on{background:${C.card};color:${C.ink}}
.tabbar{position:absolute;left:10px;right:10px;bottom:-7px;height:2px;border-radius:2px;background:${C.brand}}
.tabadd{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px}
.crumb{display:flex;align-items:center;gap:6px;font-family:'Geist Mono',monospace;font-size:12px;color:${C.ink3};padding:0 8px}
.body{flex:1;display:flex;min-height:0}
.chat{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;position:relative}
.body>.col{min-height:0}
.stream>*{flex-shrink:0}
.stream{flex:1;overflow:hidden;display:flex;flex-direction:column;gap:16px;padding:28px max(40px,calc(50% - 380px)) 16px}
.inputwrap{padding:0 max(40px,calc(50% - 390px)) 20px}
.right{width:300px;flex:none;border-left:1px solid ${C.line};padding:18px 18px;display:flex;flex-direction:column;gap:20px}
.rsect{display:flex;flex-direction:column;gap:10px;padding-bottom:18px;border-bottom:1px solid ${C.line}}.rsect:last-child{border:none}
.rtitle{font-size:13px;font-weight:600;color:${C.ink}}
.kv{display:flex;align-items:center;gap:9px;font-size:13px;color:${C.ink2}}
/* chat parts */
.sysmsg{display:flex;align-items:center;gap:8px;font-size:12px;color:${C.ink3};padding:6px 12px;border:1px dashed ${C.line2};border-radius:10px;align-self:center}
.umsg{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.bubble{background:${C.s2};padding:10px 14px;border-radius:16px 16px 4px 16px;max-width:520px;font-size:15px}
.msgact{display:flex;gap:2px;opacity:.9}
.uimg{border-radius:12px;overflow:hidden;border:1px solid ${C.line}}
.imgph{width:220px;height:96px;background:linear-gradient(135deg,${C.s2},${C.s3});display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px;color:${C.ink3}}
.reason{display:flex;flex-direction:column;gap:6px}
.rhead{display:flex;align-items:center;gap:7px;font-size:13px;color:${C.ink3}}
.rbody{border-left:2px solid ${C.line2};padding:2px 0 2px 12px;font-size:13px;color:${C.ink3};max-width:640px}
.cot{display:flex;flex-direction:column;gap:10px}
.cothead{display:flex;align-items:center;gap:7px;font-size:13px;color:${C.ink2}}
.cotlist{display:flex;flex-direction:column;gap:12px;padding-left:4px;border-left:1px solid ${C.line2};margin-left:6px}
.cotstep{display:flex;gap:10px;font-size:14px;color:${C.ink2};margin-left:-8px}.cotdot{width:16px;height:22px;display:flex;align-items:center;justify-content:center;background:${C.app};flex:none}
.tool{border:1px solid ${C.line};border-radius:10px;background:${C.card};overflow:hidden;width:100%}
.thead{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:13px}.tname{font-weight:600}.ttarget{font-family:'Geist Mono',monospace;font-size:12px;color:${C.ink2};min-width:0}
.tbody{border-top:1px solid ${C.line};padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:${C.app}}
.tlabel{font-size:11px;font-weight:600;color:${C.ink3};text-transform:uppercase;letter-spacing:.06em}
.out{color:${C.good}}
.md{display:flex;flex-direction:column;gap:12px;font-size:15px;line-height:1.65;max-width:680px}
.md code,.codeinline{font-family:'Geist Mono',monospace;font-size:13px;background:${C.s2};border-radius:5px;padding:1px 5px}
.codeinline{padding:6px 10px;display:inline-block}
.md ul{padding-left:20px;display:flex;flex-direction:column;gap:4px}.md a{color:${C.read};text-decoration:underline}
.md blockquote{border-left:2px solid ${C.line2};padding-left:12px;color:${C.ink2}}
.code{border:1px solid ${C.line};border-radius:10px;overflow:hidden;background:#141415}
.codehead{display:flex;align-items:center;padding:4px 6px 4px 12px;border-bottom:1px solid ${C.line}}
.codebody{padding:12px 14px;font-size:13px;line-height:1.7}
.src{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:${C.ink2};background:${C.s2};border-radius:99px;padding:3px 10px 3px 4px}
.fav{width:18px;height:18px;border-radius:99px;display:flex;align-items:center;justify-content:center}
.feedback{display:flex;align-items:center;gap:2px}.feedback .muted{margin-left:8px}
.thinking{display:flex;align-items:center;gap:8px;font-size:13px;padding:8px 8px 8px 12px;border-radius:10px;background:${C.card};border:1px solid ${C.line}}
.shimmer{color:${C.ink2};font-weight:500}
.stop{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:${C.ink2};padding:4px 6px 4px 10px;border-radius:7px;background:${C.s2}}
.steps{display:flex;flex-direction:column;gap:6px;font-size:13px}.step{display:flex;align-items:center;gap:8px}
.scrollpos{position:absolute;right:calc(50% - 18px);bottom:150px}
.scrollbtn{width:36px;height:36px;border-radius:99px;background:${C.s2};border:1px solid ${C.line2};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.4)}
.pinput{border:1px solid ${C.line2};background:${C.card};border-radius:16px;padding:10px 10px 8px;display:flex;flex-direction:column;gap:8px}
.pinput.focus{border-color:${C.brand};box-shadow:0 0 0 3px ${C.brand}2e}
.ptext{font-size:15px;padding:4px 6px;min-height:28px}.ptext.ph{color:${C.ink3}}
.prow{display:flex;align-items:center;gap:4px}
.send{width:32px;height:32px;border-radius:99px;background:${C.brand};display:flex;align-items:center;justify-content:center}.send.off{background:${C.s3}}
.ctx{display:flex;align-items:center;gap:6px;padding:0 6px}
.ring{width:16px;height:16px;border-radius:99px;display:flex;align-items:center;justify-content:center}.ring span{width:10px;height:10px;border-radius:99px;background:${C.card}}
.fchip{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:${C.ink2};border:1px solid ${C.line2};border-radius:8px;padding:5px 8px;background:${C.s2}}
.sugg{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:${C.ink2};border:1px solid ${C.line2};border-radius:99px;padding:6px 12px}
.appr{border:1px solid ${C.crit}66;background:${C.crit}12;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
.quest{border:1px solid ${C.read}66;background:${C.read}10;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.opt{display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid ${C.line2};border-radius:10px;background:${C.card}}.opt.on{border-color:${C.brand}}
.plan{border:1px solid ${C.change}66;background:${C.change}10;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}.plan ol{padding-left:20px;display:flex;flex-direction:column;gap:4px;font-size:14px;color:${C.ink2}}
/* pages */
.page{flex:1;display:flex;flex-direction:column;gap:22px;padding:32px 40px;min-width:0}
.cnt{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:6px 12px;border-radius:99px;background:${C.card};border:1px solid ${C.line}}
.quota{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.qbox{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px}
.big{font-size:28px;font-weight:700;letter-spacing:-0.6px}
.sect2{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.scard{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px}.scard.alert{border-color:${C.crit}80}
.live{display:flex;align-items:center;gap:8px;font-family:'Geist Mono',monospace;font-size:12px;color:${C.ink2};background:${C.app};border-radius:8px;padding:8px 10px}
.dlist{display:flex;flex-direction:column;background:${C.card};border:1px solid ${C.line};border-radius:14px}
.drow{display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid ${C.line}}.drow:last-child{border:none}
.panel{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:14px}
.chart{display:flex;align-items:flex-end;gap:10px;height:230px}
.cpanel{gap:20px}
.cseg span{display:flex;align-items:center;gap:6px;justify-content:center}
.cstats{display:flex;gap:40px}.cstats.narrow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.cstat{font-size:18px;font-weight:600;color:${C.ink}}.cstats.narrow .cstat{font-size:15px}.gap2{gap:2px}
.cavgkey{width:12px;border-top:1px dashed ${C.ink3};display:block}
.cplotwrap{margin:8px 0 0 56px;display:flex;flex-direction:column;gap:8px}
.cplot{position:relative}
.cgrid{position:absolute;left:0;right:0;height:1px;background:${C.line}}
.ctick{position:absolute;right:calc(100% + 8px);top:-8px;font-size:12px;line-height:16px;color:${C.ink3};white-space:nowrap}
.cbars{position:absolute;inset:0;display:flex}.cbars.sk-bars{position:static;height:200px;padding-bottom:24px}
.ccol{position:relative;flex:1;display:flex;align-items:flex-end;justify-content:center;border-radius:8px;margin:0 1px}.ccol.on{background:${C.s2}}
.cbar{width:60%;max-width:56px;min-width:4px;display:flex;flex-direction:column-reverse;gap:2px;border-radius:4px 4px 0 0;overflow:hidden}.cbar span{display:block;flex:none}
.cavg{position:absolute;left:0;right:0;border-top:1px dashed ${C.ink3}}
.cdays{display:flex}.cday{flex:1;display:flex;justify-content:center;font-size:12px;color:${C.ink3};white-space:nowrap}.cday.today{color:${C.ink};font-weight:500}
.ctip{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);z-index:2;background:${C.ink};color:${C.app};border-radius:8px;padding:8px 12px;display:flex;flex-direction:column;gap:6px;font-size:12px;white-space:nowrap}
.ctip .ctipd{opacity:.7}.ctip .ctipv{font-size:13px;font-weight:600}.ctip b{font-weight:600}
.ckey{width:12px;height:2px;border-radius:2px;display:block}
.barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px}
.bar{width:100%;display:flex;flex-direction:column-reverse;border-radius:5px;overflow:hidden}.bar span{display:block}
.tbl{display:flex;flex-direction:column;font-size:13px}.tr{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;gap:10px;padding:9px 0;border-bottom:1px solid ${C.line}}.th{color:${C.ink3};font-size:12px}
.tbl.mot .tr{grid-template-columns:1.1fr .8fr .9fr 2.4fr}
.emptyc{align-items:center;justify-content:center}
.hero{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:10px}
.popover{position:absolute;left:96px;top:6px;width:340px;background:${C.s2};border:1px solid ${C.line2};border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:2px;box-shadow:0 12px 32px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.4)}
.psearch{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid ${C.line2};margin-bottom:4px;font-size:13px}
.plabel{font-size:11px;color:${C.ink3};padding:4px 10px;font-weight:600}
.pitem{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;font-size:13px}.pitem .col{flex:1}.pitem.on{background:${C.s3}}
.pdiv{height:1px;background:${C.line2};margin:6px 0}
.empty{background:${C.card};border:1px solid ${C.line};border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px}
.mframe{flex:1;display:flex;flex-direction:column;gap:8px}.mlabel{font-size:12px;font-weight:600}
.mmini{background:${C.app};border:1px solid ${C.line};border-radius:10px;height:150px;overflow:hidden}
.mtabs{position:relative;display:flex;gap:4px;padding:8px;border-bottom:1px solid ${C.line}}.mtab{display:flex;align-items:center;gap:5px;font-size:11px;color:${C.ink2};padding:2px 6px}
.mbar{position:absolute;bottom:-1px;width:80px;height:2px;background:${C.brand};border-radius:2px}
.mcontent{padding:12px;display:flex;flex-direction:column;gap:8px}.ml{display:block;height:7px;border-radius:4px;background:${C.s3}}.mb{display:block;height:26px;border-radius:7px;background:${C.s2};margin-top:4px}
.swgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
.sw{display:flex;align-items:center;gap:10px}.swc{width:44px;height:44px;border-radius:10px;border:1px solid ${C.line2};flex:none;display:block}
.icell{display:flex;flex-direction:column;align-items:center;gap:6px;width:84px;padding:10px 0;border-radius:10px;background:${C.s2}}
.cgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.comp{background:${C.card};border:1px solid ${C.line};border-radius:14px;overflow:hidden;display:flex;flex-direction:column}.compbody{flex:1}
.stream.end{justify-content:flex-end}.appr .row{flex-wrap:wrap}.empty.bare{background:none;border:none;flex:1}
.p18{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px}
.stage{height:300px;border-radius:10px;overflow:hidden;border:1px solid ${C.line};background:${C.app}}
.mshell{display:flex;height:100%}
.mside{position:relative;border-right:1px solid ${C.line};padding:10px 8px;display:flex;flex-direction:column;gap:4px;background:${C.app}}
.mside.full{width:100%;border-right:none;padding:12px}
.mchat{flex:1;padding:16px;display:flex;flex-direction:column;gap:10px}
.drow2{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:10px;font-size:13px;position:relative}
.drow2 .grip{opacity:0}.drow2.lifted .grip,.drow2:first-child .grip{opacity:1}
.drow2.lifted{background:${C.s2};box-shadow:0 10px 24px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.35);transform:rotate(-1deg);outline:1px solid ${C.brand}}
.drow2.ghost{opacity:.35}
.dropline{height:2px;background:${C.brand};border-radius:2px;margin:0 8px}
.rhandle{position:absolute;top:0;bottom:0;right:-3px;width:6px}
.rhandle.on{background:linear-gradient(90deg,transparent 2px,${C.brand} 2px,${C.brand} 4px,transparent 4px)}
.wtip{position:absolute;top:40%;left:12px;background:${C.s3};border:1px solid ${C.line2};border-radius:6px;padding:2px 6px;font-size:11px;font-family:'Geist Mono',monospace;white-space:nowrap}
.rail{width:56px;border-right:1px solid ${C.line};display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0}
.rdiv{width:24px;height:1px;background:${C.line2};display:block}
.rdot{width:34px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px}
.frow2{display:flex;align-items:center;gap:12px;padding:8px 10px;border-bottom:1px solid ${C.line};font-size:13px}
.lifted2{box-shadow:0 10px 24px rgba(0,0,0,.45);transform:rotate(-2deg);outline:1px solid ${C.brand}}
.tabdrop{width:2px;height:28px;background:${C.brand};border-radius:2px;display:block}
.thumb{width:44px;height:44px;border-radius:8px;background:linear-gradient(135deg,${C.s2},${C.s3});display:block}

.mscreen{position:relative;display:flex;flex-direction:column;height:100%;background:${C.app};overflow:hidden}
.mscreen .mstream{flex:1;overflow:hidden}
.mscreen .agent{padding:9px 8px}
.msearch{flex:1;display:flex;align-items:center;gap:8px;background:${C.s2};border-radius:10px;padding:7px 10px;font-size:14px}
.mthink{padding:0 12px 6px}
.mthink .thinking{font-size:12px}
.m1col .opts{grid-template-columns:1fr}
.sk{display:block;background:linear-gradient(90deg,${C.s2} 0%,${C.s3} 50%,${C.s2} 100%);border-radius:6px}
.skrow{display:flex;align-items:center;gap:12px;padding:10px 10px}
.sktool{display:flex;align-items:center;gap:10px;border:1px solid ${C.line};border-radius:10px;padding:10px 12px;background:${C.card}}
.mdim{position:absolute;inset:0;background:rgba(0,0,0,.55)}
.msheet{position:absolute;left:0;right:0;bottom:0;background:${C.s2};border-top:1px solid ${C.line2};border-radius:20px 20px 0 0;padding:10px 14px 34px;display:flex;flex-direction:column;gap:4px;box-shadow:0 -12px 32px rgba(0,0,0,.5)}
.grabber{width:40px;height:4px;border-radius:99px;background:${C.line2};display:block;margin:0 auto 8px}
.mthumb{width:52px;height:52px;border-radius:10px;background:linear-gradient(135deg,#3987e5,#9085e9);display:block;border:1px solid ${C.line2}}
.mthumb:nth-child(2){background:linear-gradient(135deg,#0ca30c,#1fa9bd)}
.mthumb:nth-child(3){background:linear-gradient(135deg,#fab219,#d95926)}
.mthumb:nth-child(4){background:linear-gradient(135deg,#e05252,#c98500)}
.mthumb.sel{outline:2px solid ${C.brand};outline-offset:1px}
.lbimg{flex:1;margin:0 16px;border-radius:16px;background:linear-gradient(135deg,#0ca30c,#1fa9bd);display:flex;align-items:center;justify-content:center}
.btn-strong{background:${C.brandS};border-color:${C.brandS};color:#fff}

.cempty{position:relative;overflow:hidden;border:1px dashed ${C.line2};border-radius:14px;display:flex;width:100%}
.stream.emptyc .cempty{max-width:620px}
.cempty.bare{border:none;flex:1}
.cglow{position:absolute;inset:0;background:radial-gradient(circle at 50% 36%, ${C.brand}33, transparent 58%)}
.cdots{position:absolute;inset:0;opacity:.4;background-image:radial-gradient(${C.line2} 1px, transparent 1px);background-size:16px 16px;-webkit-mask-image:radial-gradient(ellipse at 50% 50%, transparent 55%, black 95%);mask-image:radial-gradient(ellipse at 50% 50%, transparent 55%, black 95%)}
.cbody{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;text-align:center}
.cprompt{display:flex;align-items:center;gap:8px;width:220px;border:1px solid ${C.line2};background:${C.app};border-radius:6px;padding:4px 10px;font-family:'Geist Mono',monospace;font-size:12px}
.caret{width:6px;height:14px;border-radius:1px;background:${C.ink2};display:block}
.compname{display:flex;align-items:center;gap:7px;padding:10px 14px;border-bottom:1px solid ${C.line};font-size:13px;font-weight:600}.compname .muted{margin-left:auto;font-weight:400}
.compbody{padding:16px;display:flex;flex-direction:column;gap:10px;background:${C.app}}
.drop{border:2px dashed ${C.read};border-radius:12px;padding:18px;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:13px}
.mini{display:flex;flex-direction:column;gap:10px}
.cover{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;position:relative}
.glow{position:absolute;width:760px;height:760px;border-radius:999px;background:radial-gradient(circle,${C.brand}26 0%,transparent 65%);top:20px}
.phone{width:390px;height:844px;background:${C.app};border:1px solid ${C.line2};border-radius:44px;overflow:hidden;display:flex;flex-direction:column;position:relative;flex:none}
.pstatus{display:flex;justify-content:space-between;padding:16px 28px 6px;font-size:13px;font-weight:600}
.mtop{display:flex;align-items:center;gap:8px;padding:6px 12px 10px;border-bottom:1px solid ${C.line}}
.mstream{flex:1;display:flex;flex-direction:column;gap:12px;padding:14px 16px;overflow:hidden}
.mbottom{padding:8px 12px 28px}
.mnav{display:flex;border-top:1px solid ${C.line};padding:8px 8px 26px}.mnavi{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:${C.ink3}}.mnavi.on{color:${C.ink}}
.flow{flex:1;background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px;position:relative}
.fnum{position:absolute;left:14px;top:12px;font-size:12px;font-weight:700;color:${C.ink3}}
.farrow{display:flex;align-items:center}
`

const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Design</title><style>${css}</style></head><body>
${cover}${foundations}${components}${flow}${chatActive}${chatApprovals}${overview}${usage}${newSession}${accSwitch}${sidebarFrame}${empties}${motion}${mobile}
</body></html>`

writeFileSync(new URL('bull-desktop.html', OUT), html)
console.log('bytes', html.length, 'missing icons:', [...missing].join(', ') || 'none')

writeFileSync(
  new URL('bull-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Mobile</title><style>${css}</style></head><body>${mobileScreens.join('')}${skeletonFrame}</body></html>`
)

// ---------- Round 5 (16.11.2026): notifications, finish order, image preview and markup,
// activity in the right panel, 5 h + week bottom left, a calmer empty-state glow ----------
// Written to out/bull-round5.html and out/bull-round5-mobile.html, so the screens that already
// live in Figma (bound to variables, edited there) are not imported a second time.

const chat5Stream = `
  ${userImages5('Mach den Header wie beim Homeserver, nur mit Bull-Logo und danach dem NEXRON-Logo.')}
  ${reasoning(false)}
  ${chainOfThought()}
  <div class="agentmsg">${ic('bot', 14, C.ink3)}<span>Rückmeldung von Subagent „Header-Muster suchen“</span>${ic('chevron-down', 13, C.ink3)}</div>
  <div class="md"><p>Der Header sieht jetzt aus wie auf der Homeserver-Startseite: <b>Bulle und „Bull“</b>, ein Trennstrich, dann das <b>NEXRON-Logo</b>.</p></div>
  ${feedbackBar()}
  ${steps()}
  ${thinkingBar()}`

// 10 (round 5): the chat with everything new at once
const chat5 = desktop5(
  '10 Chat · Fassung 5 · Aktivität rechts, Fertig-Reihenfolge, 5 h + Woche',
  `<div class="chat"><div class="stream end">${chat5Stream}</div><div class="inputwrap">${promptInput5({ text: 'Super, mach noch den Fokusring passend zur Marke', focus: true, files: true })}</div></div>`
)

// 19 Notifications: the bell opens one popover, everything is set there
const sw = (on) => `<span class="sw5${on ? ' on' : ''}"><span></span></span>`
const notifyRow = (icon, color, title, hint, on) =>
  `<div class="nrow">${ic(icon, 15, color)}<div class="col min grow"><span class="sm">${title}</span><span class="xs muted">${hint}</span></div>${sw(on)}</div>`
const notifyPanel = (opts = {}) => `
  <div class="between" style="padding:4px 6px 2px"><span class="strong">Benachrichtigungen</span>${sw(true)}</div>
  ${
    opts.blocked
      ? `<div class="okline warn"><div class="col gap2 grow"><div class="row gap6">${ic('circle-alert', 13, C.warn)}<span>Vom System blockiert</span><span class="grow"></span><span class="link">Testen</span></div><span class="xs muted" style="padding-left:19px">Erlauben unter Einstellungen › System › Benachrichtigungen › Bull. Bis dahin nur im Fenster.</span><span class="row gap6 xs" style="padding-left:19px;color:${C.ink}">${ic('external-link', 12, C.ink)}Windows-Einstellungen öffnen</span></div></div>`
      : `<div class="okline">${ic('circle-check', 13, C.good)}<span>Windows zeigt sie an</span><span class="grow"></span><span class="link">Testen</span></div>`
  }
  <div class="plabel">Sag mir Bescheid, wenn …</div>
  ${notifyRow('shield-alert', C.crit, 'eine Freigabe nötig ist', 'Claude wartet auf dein Okay für ein Tool', true)}
  ${notifyRow('message-circle-question', C.read, 'Claude etwas fragt', 'Auswahlkarte im Chat', true)}
  ${notifyRow('clipboard-list', C.change, 'ein Plan bereitsteht', 'Plan prüfen und annehmen', true)}
  ${notifyRow('circle-check', C.good, 'ein Chat fertig ist', 'Claude hat seine Antwort beendet', true)}
  ${notifyRow('triangle-alert', C.warn, 'etwas schiefgeht', 'Fehler, Abbruch, Kontingent leer', true)}
  ${notifyRow('gauge', C.ink2, 'ein Kontingent knapp wird', 'ab 80 % im 5-Stunden-Fenster', false)}
  <div class="pdiv"></div>
  <div class="plabel">Wie</div>
  <div class="nrow">${ic('monitor', 15, C.ink3)}<span class="sm grow">Im Hintergrund</span><span class="seg"><span class="on">System</span><span>Im Fenster</span></span></div>
  <div class="nrow">${ic('volume-2', 15, C.ink3)}<span class="sm grow">Ton</span>${sw(opts.sound ?? false)}</div>
  <div class="pdiv"></div>
  <div class="xs muted pnote">${ic('info', 12, C.ink3)}Der Chat, den du gerade ansiehst, meldet sich nie. Einzelne Chats stummschalten: Rechtsklick auf den Tab.</div>`
const toastInApp = `
<div class="toast5">${ic('message-circle-question', 16, C.read)}<div class="col min grow gap2"><span class="sm strong">Kalender Wochenansicht</span><span class="xs ink2">Claude fragt: Mit welcher Woche anfangen?</span></div><span class="btn btn-ghost" style="padding:4px 10px">Ansehen</span>${ic('x', 13, C.ink3)}</div>`
const notify = desktop5(
  '19 Benachrichtigungen · einrichten',
  `<div class="chat"><div class="stream end">${chat5Stream}</div><div class="inputwrap">${promptInput5({ files: true })}</div></div>`,
  {
    bell: 'open',
    overlay: `<div class="npop">${notifyPanel()}</div><div class="toastpos">${toastInApp}</div>`
  }
)

// 19c Windows blocks Bull's notifications: warning dot on the bell, path and link in the panel
const notifyBlocked = desktop5(
  '19c Benachrichtigungen · von Windows blockiert',
  `<div class="chat"><div class="stream end">${chat5Stream}</div><div class="inputwrap">${promptInput5({})}</div></div>`,
  { bell: 'blocked', overlay: `<div class="npop">${notifyPanel({ blocked: true })}</div>` }
)

// 19b How notifications behave, as a board
const winToast = `
<div class="wtoast"><div class="row gap8 xs" style="color:#c8c8c8">${bull(14)}<span>Bull</span><span class="grow"></span>${ic('ellipsis', 14, '#c8c8c8')}${ic('x', 14, '#c8c8c8')}</div>
  <div class="col gap2"><span class="strong" style="color:#fff">Freigabe nötig · Bull-Brand</span><span class="sm" style="color:#d6d6d6">Bash · git push -u origin feat/bull-brand</span><span class="xs" style="color:#9a9a9a">Dieser PC · nexron-chat</span></div>
  <div class="row gap8"><span class="wbtn">Öffnen</span></div></div>`
const bellStates = `<div class="row gap16 wrap">${[
  [ic('bell', 16, C.ink2), 'An'],
  [ic('bell-off', 16, C.ink3), 'Alle aus'],
  [
    `${ic('bell', 16, C.ink2)}<span class="bdot" style="background:${C.warn}"></span>`,
    'Im System blockiert'
  ],
  [
    `<span class="tab" style="height:30px;padding:0 8px">${statusIcon('working', 13)}<span>Kalender</span>${ic('bell-off', 12, C.ink3)}</span>`,
    'Chat stumm'
  ]
]
  .map(
    ([i, t]) =>
      `<span class="col gap6 center" style="align-items:center"><span class="ibtn ibtn-line" style="position:relative;width:auto;min-width:34px;padding:0 6px">${i}</span><span class="xs muted">${t}</span></span>`
  )
  .join('')}</div>`
const ruleRow = (what, other, away, same) =>
  `<div class="tr"><span class="strong">${what}</span><span>${other}</span><span>${away}</span><span>${same}</span></div>`
const notifyBoard = frame(
  '19b Benachrichtigungen · wann, wie, wo',
  1440,
  900,
  `<div class="page pad">
  <div class="col gap4"><h1>Benachrichtigungen</h1><span class="muted">Eine Glocke oben in der Seitenleiste öffnet alles, was man einstellen kann. Was eine Meldung auslöst, ist pro Ereignis schaltbar, nicht pro Chat; ein einzelner Chat lässt sich stummschalten.</span></div>
  <div class="grid3">
    <div class="p18"><span class="strong">Bull im Hintergrund</span><span class="muted sm">Windows-Benachrichtigung. „Öffnen“ holt Bull nach vorn und springt in den Chat. Kein „Erlauben“ im Toast: Den Befehl soll man sehen, bevor er läuft.</span><div class="stage center" style="display:flex;align-items:center;justify-content:center;background:#1c1c1c">${winToast}</div></div>
    <div class="p18"><span class="strong">Bull vorn, anderer Chat offen</span><span class="muted sm">Hinweis unten rechts im Fenster, verschwindet nach 6 s. War das Fenster weg, wartet er, bis man zurück ist.</span><div class="stage" style="display:flex;align-items:flex-end;justify-content:flex-end;padding:16px">${toastInApp}</div></div>
    <div class="p18"><span class="strong">Glocke und stumme Chats</span><span class="muted sm">Die Glocke zeigt den Zustand. Ein stummer Chat trägt die durchgestrichene Glocke im Tab und in der Seitenleiste.</span><div class="stage" style="display:flex;align-items:center;justify-content:center;padding:16px">${bellStates}</div></div>
  </div>
  <div class="panel"><span class="strong">Wann kommt was</span>
    <div class="tbl mot"><div class="tr th"><span>Ereignis</span><span>Bull vorn, anderer Chat</span><span>Bull im Hintergrund</span><span>Genau dieser Chat ist offen</span></div>
      ${ruleRow('Freigabe nötig', 'Hinweis im Fenster', 'Windows-Benachrichtigung', 'nichts, die Karte steht im Chat')}
      ${ruleRow('Frage, Plan', 'Hinweis im Fenster', 'Windows-Benachrichtigung', 'nichts')}
      ${ruleRow('Fertig', 'Hinweis + Nummer am Tab', 'Windows-Benachrichtigung + Nummer', 'nur die Nummer entfällt')}
      ${ruleRow('Fehler, Abbruch', 'Hinweis im Fenster', 'Windows-Benachrichtigung', 'Hinweis über dem Eingabefeld (wie heute)')}
      ${ruleRow('Kontingent ab 80 %', 'einmal pro Fenster und Konto', 'einmal pro Fenster und Konto', 'einmal pro Fenster und Konto')}
    </div>
    <span class="xs muted">Selbst gestoppt, Konto gewechselt, Chat geleert: keine Meldung (wie heute). Mehrere Ereignisse eines Chats in 5 s werden zu einer Meldung.</span>
  </div>
</div>`
)

// 20 Image preview: click any image, in the composer or in the chat
const lbTools = (mode, compact = false) => `
<div class="lbtools${compact ? ' wrapped' : ''}">
  <span class="seg"><span${mode === 'view' ? ' class="on"' : ''}>${ic('image', 13, mode === 'view' ? C.ink : C.ink3)} Ansehen</span><span${mode === 'mark' ? ' class="on"' : ''}>${ic('pencil', 13, mode === 'mark' ? C.ink : C.ink3)} Markieren</span></span>
  ${
    mode === 'mark'
      ? `<span class="lbsep"></span>
  ${[
    ['pencil', 'Stift', true],
    ['highlighter', 'Marker'],
    ['move-up-right', 'Pfeil'],
    ['square', 'Rahmen'],
    ['eraser', 'Radierer']
  ]
    .map(
      ([i, t, on]) =>
        `<span class="ltool${on ? ' on' : ''}" title="${t}">${ic(i, 16, on ? C.ink : C.ink2)}</span>`
    )
    .join('')}
  <span class="lbsep"></span>
  ${[C.crit, C.warn, C.good, C.brand, '#ffffff'].map((c, i) => `<span class="lcolor${i === 0 ? ' on' : ''}" style="background:${c}"></span>`).join('')}
  <span class="lbsep"></span>
  ${[4, 7, 11].map((s, i) => `<span class="lsize${i === 1 ? ' on' : ''}"><span style="width:${s}px;height:${s}px"></span></span>`).join('')}
  <span class="lbsep"></span>
  <span class="ltool">${ic('undo-2', 16, C.ink2)}</span><span class="ltool">${ic('redo-2', 16, C.ink3)}</span>`
      : `<span class="lbsep"></span><span class="ltool">${ic('minus', 16, C.ink2)}</span><span class="xs ink2" style="width:38px;text-align:center">100 %</span><span class="ltool">${ic('plus', 16, C.ink2)}</span><span class="lbsep"></span><span class="ltool">${ic('copy', 16, C.ink2)}</span><span class="ltool">${ic('download', 16, C.ink2)}</span>`
  }
</div>`
const lbTop = (count = '1 / 2') =>
  `<div class="lbtop"><span class="row gap8 min">${ic('image', 15, C.ink2)}<span class="strong trunc">header-homeserver-final-v2.png</span><span class="xs muted nowrap">1280 × 720 · 240 KB</span></span><span class="grow"></span><span class="xs muted">${count}</span>${iconBtn('x')}</div>`
const marks = (w = 880, h = 495) => `
<svg class="marks" viewBox="0 0 880 495" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" fill="none">
  <path d="M603 30 C 610 8, 850 4, 868 26 C 882 46, 760 66, 640 60 C 606 57, 598 44, 603 30" stroke="${C.crit}" stroke-width="5" stroke-linecap="round"/>
  <path d="M80 34 L 204 34" stroke="${C.warn}" stroke-width="22" stroke-linecap="round" opacity=".38"/>
  <path d="M470 262 L 632 76" stroke="${C.crit}" stroke-width="5" stroke-linecap="round"/>
  <path d="M632 76 L 604 84 M632 76 L 626 104" stroke="${C.crit}" stroke-width="5" stroke-linecap="round"/>
  <rect x="40" y="198" width="263" height="196" rx="8" stroke="${C.brand}" stroke-width="4"/>
</svg>`
const lbStage = (mode) =>
  `<div class="lbstage"><div class="lbimgwrap">${mode === 'mark' ? shot(720, 405, 1.22) + marks(720, 405) : shot(880, 495, 1.5)}</div>${mode === 'view' ? `<span class="lbnav l">${ic('chevron-left', 18, C.ink)}</span><span class="lbnav r">${ic('chevron-right', 18, C.ink)}</span>` : ''}</div>`
const lbCommentBelow = `
<div class="lbbelow">
  <div class="lbtext small">Das NEXRON-Logo rechts oben soll weg, dafür der Bulle links größer. Der Abstand im blauen Rahmen ist zu eng.</div>
  <div class="between"><span class="row gap8 xs ink2"><span class="cbox on">${ic('check', 11, '#fff')}</span>Original zusätzlich mitschicken</span><span class="row gap6">${sbtn('Verwerfen')}${sbtn('Ins Eingabefeld', 'arrow-down', 'primary')}</span></div>
</div>`
const lightbox = (mode) => `
<div class="lbdim"></div>
<div class="lb">${lbTop(mode === 'mark' ? '4 Striche' : '1 / 2')}<div class="lbmain"><div class="col grow" style="gap:12px;align-items:center">${lbStage(mode)}${lbTools(mode)}${mode === 'mark' ? lbCommentBelow : ''}</div></div></div>`
const imageView = desktop5(
  '20 Bild-Vorschau · ansehen',
  `<div class="chat"><div class="stream end">${chat5Stream}</div><div class="inputwrap">${promptInput5({ files: true })}</div></div>`,
  { overlay: lightbox('view') }
)
const imageMark = desktop5(
  '20b Bild-Vorschau · markieren und kommentieren',
  `<div class="chat"><div class="stream end">${chat5Stream}</div><div class="inputwrap">${promptInput5({ files: true })}</div></div>`,
  { overlay: lightbox('mark') }
)

// 20c Attachments: states of the small preview
const attachBoard = frame(
  '20c Anhänge · Vorschau, Name, Tooltip',
  1440,
  900,
  `<div class="page pad">
  <div class="col gap4"><h1>Bilder im Chat</h1><span class="muted">Jedes Bild hat eine kleine Vorschau mit Namen. Der Name endet nach 16 Zeichen mit „…“, der Tooltip zeigt ihn ganz. Ein Klick öffnet die große Vorschau, dort kann man markieren.</span></div>
  <div class="grid3">
    <div class="p18"><span class="strong">Im Eingabefeld</span><span class="muted sm">Vorschau 32 px, Name höchstens 16 Zeichen. Hover zeigt den Tooltip, × entfernt das Bild.</span><div class="stage" style="padding:20px;display:flex;flex-direction:column;gap:22px;justify-content:center">
      <div class="row gap8" style="padding-top:44px">${attach5('header-homeserver-final-v2.png', { shot: true, hover: true, tip: '<b>header-homeserver-final-v2.png</b><span>1280 × 720 · 240 KB · Klick öffnet die Vorschau</span>' })}${attach5('logo.png')}</div>
      <div class="row gap8">${attach5('header-homeserver-final-v2.png', { shot: true, marked: true })}<span class="xs muted">markiert: Stift-Abzeichen</span></div>
    </div></div>
    <div class="p18"><span class="strong">Im Verlauf</span><span class="muted sm">Gesendete Bilder als Kachel 160 × 100 mit Namen darunter. Klick: große Vorschau, nur ansehen; „Markieren“ legt eine Kopie ins Eingabefeld.</span><div class="stage" style="padding:20px;display:flex;align-items:center;justify-content:flex-end">${userImages5('Mach den Header wie beim Homeserver.')}</div></div>
    <div class="p18"><span class="strong">Beim Markieren</span><span class="muted sm">Stift, Marker, Pfeil, Rahmen, Radierer; fünf Farben, drei Stärken, Rückgängig mit Ctrl Z. Der Kommentar wandert mit dem Bild ins Eingabefeld.</span><div class="stage" style="display:flex;align-items:center;justify-content:center;padding:12px">${lbTools('mark', true)}</div></div>
  </div>
  <div class="panel"><span class="strong">Ablauf</span>
    <div class="tbl mot"><div class="tr th"><span>Wo</span><span>Klick</span><span>Ergebnis</span><span>Hinweis</span></div>
      <div class="tr"><span class="strong">Anhang im Eingabefeld</span><span>große Vorschau</span><span>Markieren ersetzt den Anhang</span><span>„Original mitschicken“ hängt beide an, das markierte zuerst</span></div>
      <div class="tr"><span class="strong">Bild im Verlauf</span><span>große Vorschau</span><span>Markieren legt eine Kopie ins Eingabefeld</span><span>der Verlauf selbst bleibt unverändert</span></div>
      <div class="tr"><span class="strong">Kommentar</span><span>„Ins Eingabefeld“</span><span>Text landet vor dem Entwurf: „Zu header-homeserver…: …“</span><span>nichts wird ungefragt gesendet</span></div>
      <div class="tr"><span class="strong">Tastatur</span><span>Pfeile, Esc, Ctrl Z</span><span>blättern, schließen, rückgängig</span><span>Esc mit ungespeicherten Strichen fragt einmal nach</span></div>
    </div>
  </div>
</div>`
)

// 12 (round 5): the overview with the finish order strip from the Agent Dashboard
const strip = `<ol class="fstrip">
  <li class="first">${finishBadge(1, 20)}<span class="strong nowrap">Blender Reel Shots</span><span class="trunc grow">Fünf Kamerafahrten, ein Ordner pro Shot</span><span class="xs nowrap" style="color:${C.good}">gerade</span></li>
  <li>${finishBadge(2, 20)}<span class="strongish nowrap ink2">Quota-Header fixen</span><span class="trunc grow ink2">Header bei 1200 px nicht mehr abgeschnitten</span><span class="xs muted nowrap">vor 9 min</span></li>
  <li class="free"><span class="xs muted">frei · 4 arbeiten noch</span></li>
  <li class="free"></li><li class="free"></li><li class="free"></li>
</ol>`
const overview5 = desktop5(
  '12 Übersicht · Fassung 5 · Fertig-Reihenfolge',
  overviewMain.replace(
    /<div class="quota">[\s\S]*?<div class="sect2">/,
    `<div class="sect2">${ic('circle-check', 15, C.good)}<span>Fertig, neueste zuerst</span><span class="count">2 neu</span></div>${strip}<div class="sect2">`
  ),
  { right: false, sel: 'none', nav: 'overview', tab: -1 }
)

// 21 Activity board: what the panel and the rows show, state by state
const activityBoard = frame(
  '21 Aktivität · Tools und Subagents',
  1440,
  900,
  `<div class="page pad">
  <div class="col gap4"><h1>Was Claude gerade tut</h1><span class="muted">Rechts im Panel steht für den offenen Chat, welches Tool läuft, was zuletzt lief und welche Subagents arbeiten. Links trägt jede Session nur das Nötigste: den Live-Schritt und wie viele Subagents und Shells laufen.</span></div>
  <div class="grid3">
    <div class="p18"><span class="strong">Panel rechts · läuft</span><span class="muted sm">Ersetzt „Nutzung“, das jetzt unten links steht. Klick auf ein Tool springt im Chat zu seiner Karte.</span><div class="stage" style="height:600px;padding:14px 16px;display:flex;flex-direction:column;gap:16px">${activitySection()}</div></div>
    <div class="p18"><span class="strong">Panel rechts · wartet auf dich, fertig</span><span class="muted sm">Bei einer Freigabe steht oben, was freigegeben werden soll. Läuft nichts mehr, steht dort die Summe des letzten Turns; „0 Subagents“ fällt weg.</span><div class="stage" style="height:600px;padding:14px 16px;display:flex;flex-direction:column;gap:16px">
      ${activitySection({ state: 'waiting', shell: false }).replace(
        /<div class="rsect"><div class="between"><span class="rtitle">Subagents[\s\S]*$/,
        ''
      )}
      <div class="rtitle" style="margin-top:6px">Nichts läuft mehr</div>
      ${NOW_CARD.idle()}
      <div class="col gap2">${recentTool('Edit', 'src/views/ChatView.vue', '0:02')}${recentTool('Read', 'SiteHeader.vue', '0:01')}</div>
      <span class="link">Alle 14 im Chat zeigen ${ic('chevron-right', 12, C.ink3)}</span>
      <div class="rtitle" style="margin-top:6px">Subagents</div><span class="sm muted">Keine Subagents</span>
    </div></div>
    <div class="p18"><span class="strong">Seitenleiste</span><span class="muted sm">Dritte Zeile: Live-Schritt, rechts Zähler für laufende Subagents (Bot) und Shells im Hintergrund. Tooltip nennt sie.</span><div class="stage" style="height:600px;padding:10px 8px;display:flex;flex-direction:column;gap:2px">
      ${agentRow5('approval', 'Bull-Brand: Figma-Design', 'nexron-chat', 'work', '24 min', 'Bash · git push -u origin', { on: true, agents: 1 })}
      ${agentRow5('working', 'PWA installierbar', 'nexron-chat', 'work', '6 min', 'Edit · site.webmanifest', { agents: 2 })}
      ${agentRow5('waiting', 'Homeserver Deploy', 'homeserver', 'work', '3 min', 'wartet auf Shell', { shells: 1 })}
      <div class="tipbox"><b>PWA installierbar</b><span>2 Subagents laufen: Explore · Manifest-Felder, general-purpose · Icons</span></div>
      <div class="grp">${ic('circle-check', 13, C.good)}<span>Fertig heute</span><span class="count">3</span><span class="newc">2 neu</span></div>
      ${agentRow5('done', 'Blender Reel Shots', 'reels', 'own', 'gerade', '', { finish: 1 })}
      ${agentRow5('done', 'Quota-Header fixen', 'agentdashboard', 'work', 'vor 9 min', '', { finish: 2 })}
      ${agentRow5('done', 'README-Banner', 'nexron-chat', 'work', 'vor 1 h', '', { seen: true })}
    </div></div>
  </div>
</div>`
)

// 15b Empty-state glow: three calmer options than the orange haze
const glowCard = (variant, title, hint) => `
<div class="p18"><span class="strong">${title}</span><span class="muted sm">${hint}</span>
  <div class="stage" style="height:360px;display:flex">
    <div class="cempty v-${variant}"><div class="cglow"></div><div class="cdots"></div><div class="cbody">
      ${clawdSleeping()}
      <div class="col gap4 center"><span class="strong" style="color:${C.ink2}">Clawd wartet auf die erste Anfrage</span><span class="muted sm" style="max-width:300px">Neue Session auf Dieser PC in nexron-chat.</span></div>
      <div class="cprompt"><span style="color:${C.brand}">&gt;</span><span style="color:${C.ink2}">mach den fokusring</span><span class="caret"></span></div>
    </div></div>
  </div></div>`
const glowBoard = frame(
  '15b Leerer Chat · Schein neu',
  1440,
  620,
  `<div class="page pad">
  <div class="col gap4"><h1>Leerer Chat: ruhiger Schein</h1><span class="muted">Der orange Schleier stand als einzige warme Fläche im kühlen „Night Desk“. Der Schein kommt aus der Marke oder fällt weg.</span></div>
  <div class="grid3">
    ${glowCard('blue', 'A · Marken-Blau (Empfehlung)', 'Blauer Schein mit 10 % Deckkraft, darunter das Punktraster. Gehört zur Marke.')}
    ${glowCard('neutral', 'B · Neutrales Licht', 'Heller Lichtkegel ohne Farbe, wie eine Schreibtischlampe. Am ruhigsten, aber ohne Bezug zur Marke.')}
    ${glowCard('none', 'C · Ohne Schein', 'Nur gestrichelter Rahmen und Punktraster. Am klarsten, wirkt aber leerer.')}
  </div>
</div>`
)

// ---------- mobile, round 5 ----------
const mNotify = mScreen(
  'M18 Benachrichtigungen',
  `<div class="mtop">${iconBtn('chevron-left')}<span class="strong grow">Einstellungen</span></div>`,
  `<div class="sect">Darstellung</div><div class="nrow">${ic('moon', 15, C.ink3)}<span class="sm grow">Design</span><span class="xs muted">System</span></div>`,
  mNav('Einstellungen'),
  `<div class="mdim"></div><div class="msheet">${'<span class="grabber"></span>'}${notifyPanel().replace('Der Chat, den du gerade ansiehst, meldet sich nie. Einzelne Chats stummschalten: Rechtsklick auf den Tab.', 'Der offene Chat meldet sich nie. Einzelne Chats: lange auf die Session drücken.')}</div>`
)
const mImageView = frame(
  'M19 Bild-Vorschau · ansehen',
  M_W,
  M_H,
  `<div class="mscreen" style="background:#000">${statusBar()}<div class="mtop" style="border:none">${iconBtn('x')}<div class="col min grow" style="align-items:center"><span class="strong trunc" style="max-width:200px">header-homeserver-fi…</span><span class="xs muted">1 / 2 · 240 KB</span></div>${iconBtn('download')}</div>
  <div class="mlbimg">${shot(358, 201, 0.62)}</div>
  <div class="row center gap6" style="padding:10px 0">${dot(C.ink, 6)}${dot(C.ink3, 6)}</div>
  <div class="mlbbar"><span class="btn" style="flex:1;justify-content:center">${ic('copy', 15, C.ink2)}Kopieren</span><span class="btn btn-strong" style="flex:1;justify-content:center">${ic('pencil', 15, '#fff')}Markieren</span></div></div>`
)
const mImageMark = frame(
  'M20 Bild-Vorschau · markieren',
  M_W,
  M_H,
  `<div class="mscreen" style="background:#000">${statusBar()}<div class="mtop" style="border:none"><span class="link sm" style="color:${C.ink2}">Abbrechen</span><span class="strong grow center">Markieren</span><span class="ltool">${ic('undo-2', 16, C.ink2)}</span><span class="ltool">${ic('redo-2', 16, C.ink3)}</span></div>
  <div class="mlbimg" style="position:relative">${shot(358, 201, 0.62)}<svg class="marks" viewBox="0 0 358 201" width="358" height="201" xmlns="http://www.w3.org/2000/svg" fill="none" style="position:absolute;left:16px;top:0"><path d="M232 6 C 258 2, 320 4, 338 12 C 352 20, 346 30, 330 32 C 296 36, 248 34, 232 28 C 220 22, 222 10, 232 6 Z" stroke="${C.crit}" stroke-width="3" stroke-linecap="round"/><rect x="22" y="66" width="104" height="62" rx="5" stroke="${C.brand}" stroke-width="2.5"/></svg></div>
  <div class="grow"></div>
  <div class="mmarkbar">
    <div class="row" style="justify-content:space-between">${[['pencil', true], ['highlighter'], ['move-up-right'], ['square'], ['eraser']].map(([i, on]) => `<span class="ltool big${on ? ' on' : ''}">${ic(i, 20, on ? C.ink : C.ink2)}</span>`).join('')}</div>
    <div class="row" style="justify-content:space-between">${[C.crit, C.warn, C.good, C.brand, '#ffffff'].map((c, i) => `<span class="lcolor big${i === 0 ? ' on' : ''}" style="background:${c}"></span>`).join('')}<span class="lbsep"></span>${[4, 7, 11].map((s, i) => `<span class="lsize${i === 1 ? ' on' : ''}"><span style="width:${s}px;height:${s}px"></span></span>`).join('')}</div>
    <div class="mcomment"><span class="sm ink2 grow">Logo rechts weg, Bulle größer …</span><span class="send">${ic('arrow-down', 16, '#fff')}</span></div>
    <span class="xs muted center">Pfeil: markiertes Bild und Kommentar ins Eingabefeld</span>
  </div></div>`
)
const mActivity = mScreen(
  'M21 Aktivität · Tools und Subagents',
  chatTop('working', 'Bull-Brand: Header'),
  `${userMessage('Mach den Header wie beim Homeserver.')}${reasoning(false)}`,
  `<div class="mthink">${thinkingBar()}</div>${mComposer({ text: '' })}`,
  `<div class="mdim"></div><div class="msheet" style="gap:14px"><span class="grabber"></span><span class="xs muted center" style="margin-top:-6px">Tipp auf „Claude führt Befehle aus …“ öffnet das</span>${activitySection({ shell: false })}</div>`
)
const mSessions5 = mScreen(
  'M01 Sessions',
  listTop,
  `${machineSeg}
  <div class="grp">${ic('shield-alert', 13, C.crit)}<span>Braucht dich</span><span class="count">1</span></div>
  ${agentRow5('approval', 'Bull-Brand: Figma-Design', 'nexron-chat', 'work', '24 min', 'Bash · git push', { agents: 1 })}
  <div class="grp">${ic('loader-circle', 13, C.warn)}<span>Läuft</span><span class="count">2</span></div>
  ${agentRow5('working', 'PWA installierbar', 'nexron-chat', 'work', '6 min', 'Edit · site.webmanifest', { agents: 2 })}
  ${agentRow5('waiting', 'Homeserver Deploy', 'homeserver', 'work', '3 min', 'wartet auf Shell', { shells: 1 })}
  <div class="grp">${ic('circle-check', 13, C.good)}<span>Fertig heute</span><span class="count">3</span><span class="newc">2 neu</span></div>
  ${agentRow5('done', 'Blender Reel Shots', 'reels', 'own', 'gerade', '', { finish: 1 })}
  ${agentRow5('done', 'Quota-Header fixen', 'agentdashboard', 'work', 'vor 9 min', '', { finish: 2 })}
  ${agentRow5('done', 'README-Banner', 'nexron-chat', 'work', 'vor 1 h', '', { seen: true })}`,
  mNav('Chats')
)

const cssBuilt = `
.dim{opacity:.72}
.sbar{display:flex;align-items:center;gap:10px;height:40px;flex:none;padding:0 12px 0 24px;border-bottom:1px solid ${C.line};color:${C.ink2}}
.now5.crit{border-color:${C.crit}66;background:${C.crit}12}
.okline.warn{background:${C.warn}14;align-items:flex-start}
.agentmsg{display:flex;align-items:center;gap:8px;font-size:13px;color:${C.ink2}}
.chip.plain{background:none;padding:4px 6px}
`
const css5 = `
.fnum5{display:inline-flex;align-items:center;justify-content:center;border-radius:99px;background:${C.s3};color:${C.ink2};font-weight:700;flex:none;line-height:1}
.fnum5.first{background:${C.good};color:${C.app}}
.ficon{width:16px;display:flex;justify-content:center;flex:none}
.agent.seen{opacity:.72}
.newc{font-size:11px;font-weight:600;color:${C.good};margin-left:auto}
.abadge{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:${C.ink2};background:${C.s2};border-radius:6px;padding:0 5px;line-height:16px;flex:none}
.agent.on .abadge{background:${C.s3}}
.foot5{display:flex;flex-direction:column;gap:10px;padding:12px 8px 2px;border-top:1px solid ${C.line}}
.facc{display:flex;flex-direction:column;gap:5px}
.fname5{font-size:12px;color:${C.ink2}}
.qpair{flex:1;display:flex;align-items:center;gap:6px;min-width:0}.qpair .meter{flex:1}
.qlab{font-size:11px;color:${C.ink3};white-space:nowrap}.qpct{font-size:11px;color:${C.ink2};white-space:nowrap;width:30px;text-align:right}.qpct.hot{color:${C.warn}}
.tab.fresh{color:${C.ink2}}
.r5{gap:16px}.r5 .rsect{gap:9px;padding-bottom:16px}
.livedot{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:${C.warn}}
.now5{display:flex;align-items:center;gap:8px;background:${C.card};border:1px solid ${C.line};border-radius:10px;padding:8px 10px}
.tcount{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${C.ink2};background:${C.s2};border-radius:6px;padding:1px 6px}.tcount b{font-weight:600;color:${C.ink}}
.atool{display:flex;align-items:center;gap:7px;padding:4px 0;font-size:12px}.tname5{font-weight:600;font-size:12px;width:34px}
.ink2{color:${C.ink2}}
.sub5{display:flex;flex-direction:column;gap:3px}
.stype{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:${C.ink2};background:${C.s2};border-radius:6px;padding:0 5px;line-height:17px;white-space:nowrap}
.sublive{display:flex;align-items:center;gap:6px;font-family:'Geist Mono',monospace;font-size:11px;color:${C.ink3};padding-left:22px}
.shot{background:#16161a;overflow:hidden;flex:none;display:flex;flex-direction:column;border-radius:4px}
.shothead{display:flex;align-items:center;background:#202026;border-bottom:1px solid #2e2e36}
.shotl{display:block;border-radius:4px;background:#5c5c66}
.shotcard{flex:1;display:block;background:#24242b;border:1px solid #33333c}
.timg{display:block;overflow:hidden;border-radius:6px;flex:none}
.att5{position:relative;display:inline-flex;align-items:center;gap:7px;font-size:12px;color:${C.ink2};border:1px solid ${C.line2};border-radius:9px;padding:3px 8px 3px 3px;background:${C.s2}}
.att5.hover{border-color:${C.ink3};background:${C.s3}}
.attimg{position:relative;width:30px;height:30px;border-radius:6px;background:linear-gradient(135deg,#24242b,#3a3a44);display:flex;align-items:center;justify-content:center;flex:none}
.att5:nth-child(2) .attimg{background:linear-gradient(135deg,#1c2b4a,#4d7cff)}
.attname{max-width:16ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.markbadge{position:absolute;right:-4px;bottom:-4px;width:15px;height:15px;border-radius:99px;background:${C.brandS};border:2px solid ${C.s2};display:flex;align-items:center;justify-content:center}
.tip5{position:absolute;left:0;bottom:calc(100% + 8px);background:${C.ink};color:${C.app};border-radius:8px;padding:7px 10px;display:flex;flex-direction:column;gap:2px;font-size:12px;white-space:nowrap;z-index:3}.tip5 b{font-weight:600}.tip5 span{opacity:.7}
.tipbox{align-self:flex-start;margin:2px 0 6px 40px;background:${C.ink};color:${C.app};border-radius:8px;padding:7px 10px;display:flex;flex-direction:column;gap:2px;font-size:12px}.tipbox span{opacity:.7}
.uimg5{display:flex;flex-direction:column;gap:5px;width:160px}
.uthumb{width:160px;height:100px;border-radius:10px;overflow:hidden;border:1px solid ${C.line2};display:block}
.uname{font-size:12px;color:${C.ink3};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}
.sw5{width:30px;height:18px;border-radius:99px;background:${C.line2};display:flex;align-items:center;padding:2px;flex:none}.sw5 span{width:14px;height:14px;border-radius:99px;background:${C.ink2};display:block}
.sw5.on{background:${C.brandS};justify-content:flex-end}.sw5.on span{background:#fff}
.npop{position:absolute;left:236px;top:52px;width:360px;background:${C.s2};border:1px solid ${C.line2};border-radius:12px;padding:10px 8px;display:flex;flex-direction:column;gap:2px;box-shadow:0 12px 32px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.4);z-index:5}
.nrow{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px}
.okline{display:flex;align-items:center;gap:6px;font-size:12px;color:${C.ink2};background:${C.good}14;border-radius:8px;padding:6px 8px;margin:6px 0 4px}
.toastpos{position:absolute;right:316px;bottom:24px;z-index:4}
.toast5{display:flex;align-items:center;gap:10px;width:380px;background:${C.s2};border:1px solid ${C.line2};border-radius:12px;padding:10px 10px 10px 12px;box-shadow:0 12px 32px rgba(0,0,0,.5)}
.btn-ghost{background:transparent;border-color:${C.line2}}
.wtoast{width:360px;background:#2b2b2b;border:1px solid #3d3d3d;border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 28px rgba(0,0,0,.5)}
.wbtn{flex:1;text-align:center;font-size:13px;color:#fff;background:#3b3b3b;border:1px solid #4a4a4a;border-radius:5px;padding:5px 0}
.bdot{position:absolute;right:5px;top:5px;width:7px;height:7px;border-radius:99px;display:block;border:1.5px solid ${C.app}}
.lbdim{position:absolute;inset:0;background:rgba(5,5,6,.86);z-index:6}
.lb{position:absolute;inset:24px 40px;z-index:7;display:flex;flex-direction:column;gap:14px}
.lbtop{display:flex;align-items:center;gap:12px;padding:4px 4px 0}
.lbmain{flex:1;display:flex;gap:20px;min-height:0}
.lbstage{position:relative;flex:1;display:flex;align-items:center;justify-content:center;width:100%}
.lbimgwrap{position:relative;border-radius:8px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6);border:1px solid ${C.line2}}
.marks{position:absolute;left:0;top:0}
.lbnav{position:absolute;top:calc(50% - 20px);width:40px;height:40px;border-radius:99px;background:${C.s2};border:1px solid ${C.line2};display:flex;align-items:center;justify-content:center}.lbnav.l{left:16px}.lbnav.r{right:16px}
.lbtools{display:flex;align-items:center;gap:6px;background:${C.s2};border:1px solid ${C.line2};border-radius:12px;padding:6px 8px;box-shadow:0 10px 28px rgba(0,0,0,.5)}
.lbtools .seg span{display:inline-flex;align-items:center;gap:5px;padding:4px 10px}
.lbsep{width:1px;height:22px;background:${C.line2};display:block;margin:0 4px;flex:none}
.ltool{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:none}.ltool.on{background:${C.s3};outline:1px solid ${C.line2}}.ltool.big{width:44px;height:44px}
.lcolor{width:20px;height:20px;border-radius:99px;display:block;flex:none;border:2px solid ${C.s2};box-shadow:0 0 0 1px ${C.line2}}.lcolor.on{box-shadow:0 0 0 2px ${C.ink}}.lcolor.big{width:28px;height:28px}
.lsize{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:none}.lsize span{display:block;border-radius:99px;background:${C.ink2}}.lsize.on{background:${C.s3}}
.lbtext{min-height:120px;background:${C.card};border:1px solid ${C.brand};border-radius:10px;padding:10px 12px;font-size:14px;color:${C.ink};box-shadow:0 0 0 3px ${C.brand}2e}
.cbox{width:16px;height:16px;border-radius:4px;border:1px solid ${C.line2};display:flex;align-items:center;justify-content:center;flex:none}.cbox.on{background:${C.brandS};border-color:${C.brandS}}
.grid3{grid-template-columns:repeat(3,minmax(0,1fr))}
.lbtools.wrapped{flex-wrap:wrap;justify-content:center;max-width:330px;row-gap:8px}.lbtools.wrapped .seg,.lbtools.wrapped .lbsep:first-of-type{display:none}
.fstrip{list-style:none;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 14px}
.fstrip li{display:flex;align-items:center;gap:9px;height:38px;padding:0 10px 0 8px;border-radius:10px;border:1px solid ${C.line};background:${C.card};font-size:13px;min-width:0}
.fstrip li.first{border-color:${C.good}66;background:${C.good}1a}
.fstrip li.free{border-style:dashed;background:none}
.cempty.v-blue .cglow{background:radial-gradient(circle at 50% 36%, ${C.brand}38, transparent 58%)}
.cempty.v-neutral .cglow{background:radial-gradient(ellipse 45% 55% at 50% 30%, #ffffff10, transparent 70%)}
.cempty.v-none .cglow{display:none}
.mlbimg{padding:0 16px;margin-top:90px;display:flex;justify-content:center}
.mlbbar{margin-top:auto;display:flex;gap:10px;padding:14px 16px 40px}
.mmarkbar{display:flex;flex-direction:column;gap:14px;padding:14px 16px 34px;background:${C.card};border-top:1px solid ${C.line2};border-radius:18px 18px 0 0}
.mcomment{display:flex;align-items:center;gap:8px;background:${C.s2};border:1px solid ${C.line2};border-radius:14px;padding:6px 6px 6px 12px}
`

const round5Desktop = [
  chat5,
  notify,
  notifyBoard,
  imageView,
  imageMark,
  attachBoard,
  overview5,
  activityBoard,
  glowBoard
]
// ---------- built state (16.11.2026): every screen the round-5 code changed ----------
const builtDesktop = [
  chat5,
  chatApprovals,
  overview5,
  usage,
  newSession,
  accSwitch,
  notify,
  notifyBlocked,
  notifyBoard,
  imageView,
  imageMark,
  attachBoard,
  activityBoard,
  empties
]
const builtMobile = [
  mSessions5,
  ...mobileScreens.slice(1),
  mNotify,
  mImageView,
  mImageMark,
  mActivity
]
const builtCss = `${css}${css5}${cssBuilt}`
writeFileSync(
  new URL('bull-built.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull gebaut</title><style>${builtCss}</style></head><body>${builtDesktop.join('')}</body></html>`
)
writeFileSync(
  new URL('bull-built-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull gebaut Mobile</title><style>${builtCss}</style></head><body>${builtMobile.join('')}</body></html>`
)

const round5Mobile = [mNotify, mImageView, mImageMark, mActivity, mSessions5]
writeFileSync(
  new URL('bull-round5.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 5</title><style>${css}${css5}</style></head><body>${round5Desktop.join('')}</body></html>`
)
writeFileSync(
  new URL('bull-round5-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 5 Mobile</title><style>${css}${css5}</style></head><body>${round5Mobile.join('')}</body></html>`
)
console.log('round 5 missing icons:', [...missing].join(', ') || 'none')

// ---------- Round 6 (17.11.2026): settings with accounts, a real terminal in the project folder ----------
// User request: a settings tab "to set up the accounts Bull may use", and a terminal view of its own, meaning
// a real shell in the chat's project folder in Bull's look (not Claude's session rendered as a terminal).

// Settings: one page, sections on the left, the accounts per machine on the right
const SETTINGS_SECTIONS = [
  ['user', 'Konten'],
  ['monitor', 'Rechner'],
  ['bell', 'Benachrichtigungen'],
  ['square-terminal', 'Terminal'],
  ['sun', 'Darstellung']
]
const settingsNav = (active) =>
  `<nav class="snav">${SETTINGS_SECTIONS.map(([i, t]) => `<span class="snavi${t === active ? ' on' : ''}">${ic(i, 15, t === active ? C.ink : C.ink3)}${t}</span>`).join('')}</nav>`
const accountCard = (o) => `
<div class="acard${o.isOff ? ' off' : ''}">
  <div class="row gap12">${dot(o.color, 10)}<div class="col min grow gap2"><div class="row gap8"><span class="strong trunc">${o.email}</span><span class="pbadge">${o.plan}</span>${o.isDefault ? `<span class="defb">${ic('star', 11, C.warn)}Standard</span>` : ''}</div><span class="xs muted mono trunc">${o.dir}</span></div>
    ${o.isExpired ? `<span class="stat" style="color:${C.warn}">${ic('triangle-alert', 13, C.warn)}Abgemeldet</span>${sbtn('Neu anmelden', 'log-in')}` : `<span class="stat" style="color:${C.good}">${ic('circle-check', 13, C.good)}Angemeldet</span>`}
    ${iconBtn('ellipsis')}</div>
  ${o.isExpired ? '' : `<div class="row gap16">${quotaPair('5 h', o.h5)}${quotaPair('Woche', o.wk)}</div>`}
</div>`
const settingsAccountsMain = `
<div class="page"><div class="row" style="gap:32px;align-items:flex-start;flex:1;min-height:0">
  ${settingsNav('Konten')}
  <div class="col gap12 grow min">
    <div class="between" style="align-items:flex-start"><div class="col gap4"><h1>Konten</h1><span class="muted" style="max-width:620px">Die Claude-Konten, die Bull anbietet. Neue Chats starten auf dem Konto mit „Standard“, umschalten geht am Eingabefeld.</span></div>${btn('Konto hinzufügen', 'plus', 'strong')}</div>
    <div class="machhead">${ic('monitor', 14, C.ink3)}Dieser PC<span class="count">2</span></div>
    ${accountCard({ plan: 'Max', color: ACC.work.color, email: 'alex@office.example', dir: '.claude-office', h5: 42, wk: 63, isDefault: true })}
    ${accountCard({ plan: 'Pro', color: ACC.own.color, email: 'alex.privat@gmail.example', dir: '.claude', h5: 96, wk: 71 })}
    <div class="machhead">${ic('server', 14, C.ink3)}nexron-server<span class="count">1</span></div>
    ${accountCard({ plan: 'Max', color: ACC.work.color, email: 'alex@office.example', dir: '.claude-office', isDefault: true, isExpired: true })}
  </div>
</div></div>`
const settingsAccounts = desktop5('22 Einstellungen · Konten', settingsAccountsMain, {
  nav: 'settings',
  tab: -1,
  right: false
})

// 22b Adding an account: name, machine, colour; the login runs in a small terminal in the dialog
const term = (lines, extra = '') => `<div class="term"${extra}>${lines.join('')}</div>`
const tl = (html) => `<div class="tl">${html || '&nbsp;'}</div>`
const tPrompt = (cmd, cursor = false) =>
  tl(
    `<span style="color:${C.brandL}">nexron-chat</span> <span style="color:${C.change}">feat/bull-brand</span> <span style="color:${C.good}">❯</span> ${cmd}${cursor ? '<span class="tcursor"></span>' : ''}`
  )
const addAccountDialog = `
<div class="lbdim" style="background:rgba(5,5,6,.6)"></div>
<div class="dlg">
  <div class="between"><span class="strong lg">Konto hinzufügen</span>${iconBtn('x')}</div>
  <span class="seg full"><span class="on">Neu anmelden</span><span>Schon angemeldet</span></span>
  <span class="muted sm">Bull legt einen neuen Profilordner an und meldet dich darin an.</span>
  <div class="field"><span class="flabel">Name</span><div class="finput">kunde-x</div></div>
  <div class="row gap16">
    <div class="field grow"><span class="flabel">Rechner</span><span class="seg"><span class="on">Dieser PC</span><span>nexron-server</span></span></div>
    <div class="field"><span class="flabel">Farbe</span><span class="row gap8">${[C.outside, C.brand, C.change, C.warn].map((c, i) => `<span class="lcolor${i === 0 ? ' on' : ''}" style="background:${c}"></span>`).join('')}</span></div>
  </div>
  <div class="field"><span class="flabel">Profilordner</span><span class="mono xs muted">C:\\Users\\Home\\.claude-kunde-x</span></div>
  ${term(
    [
      tl(
        `<span style="color:${C.ink3}">.claude-kunde-x</span> <span style="color:${C.good}">❯</span> claude /login`
      ),
      tl('Browser wird geöffnet, dort mit dem Konto anmelden …'),
      tl(`Oder Code eingeben: <span style="color:${C.ink}">7Q4K-9HXM</span>`),
      tl(`<span style="color:${C.warn}">●</span> Warte auf Anmeldung`)
    ],
    ' style="flex:none;height:132px;border-radius:10px;border:1px solid ' + C.line + '"'
  )}
  <div class="row gap8" style="justify-content:flex-end">${btn('Abbrechen')}${btn('Im Terminal anmelden', 'log-in', 'strong')}</div>
</div>`
const existingRow = (email, plan, dir, isAdded = false) =>
  `<div class="row gap12 exrow">${dot(isAdded ? C.ink3 : C.outside, 10)}<div class="col min grow gap2"><div class="row gap8"><span class="strong trunc">${email}</span><span class="pbadge">${plan}</span></div><span class="xs muted mono">${dir}</span></div>${isAdded ? '<span class="xs muted">Schon in Bull</span>' : sbtn('Hinzufügen', 'plus')}</div>`
const addExistingDialog = `
<div class="lbdim" style="background:rgba(5,5,6,.6)"></div>
<div class="dlg">
  <div class="between"><span class="strong lg">Konto hinzufügen</span>${iconBtn('x')}</div>
  <span class="seg full"><span>Neu anmelden</span><span class="on">Schon angemeldet</span></span>
  <div class="field"><span class="flabel">Rechner</span><span class="seg"><span class="on">Dieser PC</span><span>nexron-server</span></span></div>
  <span class="muted sm">Profile von Claude Code auf diesem PC. Hinzufügen nimmt das Konto in Bull auf, ohne neue Anmeldung.</span>
  <div class="col gap8">
    ${existingRow('alex@office.example', 'Max', '.claude-office', true)}
    ${existingRow('alex.privat@gmail.example', 'Pro', '.claude', true)}
    ${existingRow('alex.privat@gmail.example', 'Pro', '.claude-gmail')}
  </div>
  <div class="row gap8" style="justify-content:flex-end">${btn('Fertig')}</div>
</div>`
const settingsAddExisting = desktop5(
  '22b2 Einstellungen · Konto hinzufügen, schon angemeldet',
  settingsAccountsMain,
  {
    nav: 'settings',
    tab: -1,
    right: false,
    overlay: addExistingDialog
  }
)
const settingsAdd = desktop5('22b Einstellungen · Konto hinzufügen', settingsAccountsMain, {
  nav: 'settings',
  tab: -1,
  right: false,
  overlay: addAccountDialog
})

// 23 Terminal as a tab: a real shell in the project folder, Bull's colours and Geist Mono
const BUILD_LINES = [
  tPrompt('git status --short'),
  tl(` <span style="color:${C.warn}">M</span> src/components/chat/ChatPane.vue`),
  tl(`<span style="color:${C.ink3}">??</span> public/favicon_new.svg`),
  tPrompt('npm run build'),
  tl(`<span style="color:${C.ink3}">&gt; nexron-chat@0.2.1 build</span>`),
  tl(`<span style="color:${C.ink3}">&gt; vue-tsc -b &amp;&amp; vite build</span>`),
  tl(`<span style="color:${C.outside}">vite v8.0.0</span> building for production...`),
  tl(`<span style="color:${C.good}">✓</span> 1840 modules transformed.`),
  tl(
    `<span style="color:${C.read}">dist/index.html</span>                   0.62 kB │ gzip:   0.38 kB`
  ),
  tl(
    `<span style="color:${C.read}">dist/assets/index-BxJ3.css</span>       48.21 kB │ gzip:   9.80 kB`
  ),
  tl(
    `<span style="color:${C.read}">dist/assets/index-C9aQ.js</span>       612.40 kB │ gzip: 189.02 kB`
  ),
  tl(`<span style="color:${C.good}">✓ built in 1.35s</span>`),
  tPrompt('npx vitest run'),
  tl(
    ` <span style="color:${C.ink3}">Test Files</span>  <span style="color:${C.good}">50 passed</span> (50)`
  ),
  tl(
    `      <span style="color:${C.ink3}">Tests</span>  <span style="color:${C.good}">499 passed</span> (499)`
  ),
  tPrompt('', true)
]
const terminalBar = `<div class="tbar">${ic('square-terminal', 15, C.ink2)}<span class="sm strong">PowerShell 7</span>${ic('chevron-down', 12, C.ink3)}<span class="mono xs muted trunc grow">C:\\me\\dev\\projects\\nexron-chat</span>${iconBtn('plus', false, 14)}${iconBtn('eraser', false, 14)}${iconBtn('ellipsis', false, 14)}</div>`
const newTabMenu = `<div class="newmenu">
  <div class="pitem">${ic('messages-square', 14, C.ink2)}<span class="grow">Neuer Chat</span>${kbd('Ctrl T')}</div>
  <div class="pitem on">${ic('square-terminal', 14, C.ink)}<span class="grow">Terminal in nexron-chat</span>${kbd('Ctrl Shift `')}</div>
  <div class="pitem">${ic('server', 14, C.ink2)}<span class="grow">Terminal auf nexron-server</span></div>
</div>`
const terminalTab = desktop5(
  '23 Terminal · eigener Tab im Projektordner',
  `<div class="col grow min">${terminalBar}${term(BUILD_LINES)}</div>`,
  { tab: 5, right: false, bar: false, overlay: newTabMenu }
)

// 23b Terminal under the chat: Ctrl ` opens it in the same folder, the chat stays visible above
const drawer = `<div class="tdrawer"><div class="tdhead"><span class="ttab on">${ic('square-terminal', 12, C.ink)}PowerShell 1</span><span class="ttab">${ic('square-terminal', 12, C.ink3)}npm run dev</span>${iconBtn('plus', false, 13)}<span class="grow"></span><span class="xs muted">Ctrl \`</span>${iconBtn('maximize-2', false, 13)}${iconBtn('x', false, 13)}</div>${term(BUILD_LINES.slice(3))}</div>`
const terminalDrawer = desktop5(
  '23b Terminal · unter dem Chat',
  `<div class="chat"><div class="stream end">${chat5Stream}</div><div class="inputwrap">${promptInput5({})}</div>${drawer}</div>`
)

// Phone: settings list, accounts, terminal with a key row above the keyboard
const sRow = (icon, title, value) =>
  `<div class="srow">${tile(icon, C.ink2, 32)}<span class="grow">${title}</span><span class="xs muted">${value}</span>${ic('chevron-right', 14, C.ink3)}</div>`
const mSettings = mScreen(
  'M22 Einstellungen',
  `<div class="mtop"><span class="strong lg grow">Einstellungen</span></div>`,
  `<div class="slist">${sRow('user', 'Konten', '3 aktiv')}${sRow('monitor', 'Rechner', '2')}${sRow('bell', 'Benachrichtigungen', 'An')}${sRow('square-terminal', 'Terminal', 'PowerShell 7')}${sRow('sun', 'Darstellung', 'System')}</div>`,
  mNav('Einstellungen')
)
const mAccounts = mScreen(
  'M23 Einstellungen · Konten',
  `<div class="mtop">${iconBtn('chevron-left')}<span class="strong grow">Konten</span><span class="ibtn" style="background:${C.brandS}">${ic('plus', 16, '#fff')}</span></div>`,
  `<div class="machhead">${ic('monitor', 14, C.ink3)}Dieser PC</div>
  ${accountCard({ plan: 'Max', color: ACC.work.color, email: 'alex@office.example', dir: '.claude-office', h5: 42, wk: 63, isDefault: true })}
  ${accountCard({ plan: 'Pro', color: ACC.own.color, email: 'alex.privat@gmail.example', dir: '.claude', h5: 96, wk: 71 })}
  <div class="machhead">${ic('server', 14, C.ink3)}nexron-server</div>
  ${accountCard({ plan: 'Max', color: ACC.work.color, email: 'alex@office.example', dir: '.claude-office', isDefault: true, isExpired: true })}`
)
const mTerminal = mScreen(
  'M24 Terminal',
  `<div class="mtop">${iconBtn('chevron-left')}<div class="col min grow" style="align-items:center"><span class="strong">Terminal</span><span class="xs muted mono">nexron-chat · PowerShell 7</span></div>${iconBtn('ellipsis')}</div>`,
  term(BUILD_LINES.slice(3), ' style="margin:-14px -16px;font-size:11.5px;padding:12px 14px"'),
  `<div class="keyrow">${['Esc', 'Tab', 'Ctrl', '↑', '↓', '←', '→', '|', '~', '/'].map((k) => `<span class="key">${k}</span>`).join('')}</div>`
)

const cssR6 = `
.btn.s{padding:4px 10px;font-size:12px;gap:5px;border-radius:7px}
.kbd.inbtn{margin-left:2px;line-height:15px;padding:0 4px;font-size:10px;background:transparent;border-color:currentColor;opacity:.6;color:inherit}
.mscreen .kbd{display:none}
.appr.c,.quest.c,.plan.c{padding:10px 12px;gap:8px}
.appr.c .codeinline{padding:5px 9px;display:block}
.opts.c{grid-template-columns:1fr;gap:4px}
.opt.c{align-items:center;padding:6px 10px;gap:10px}
.plan.c ol{font-size:13px;gap:2px}
.scard.ghost{opacity:.55}
.drow.fresh1{background:${C.good}12}
.right{position:relative;overflow:hidden}
.rscroll{position:absolute;right:3px;top:150px;width:4px;height:36%;border-radius:4px;background:${C.brand}73}
.subacts{display:flex;flex-direction:column;gap:1px;margin:4px 0 2px 6px;padding-left:14px;border-left:1px solid ${C.line2}}
.subact{display:flex;align-items:center;gap:6px;padding:2px 0}
.sublive{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.lb{inset:20px 40px}
.lbbelow{width:720px;background:${C.s2};border:1px solid ${C.line2};border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
.lbtext.small{min-height:52px;font-size:13px;padding:8px 10px}
.snav{width:200px;flex:none;display:flex;flex-direction:column;gap:2px}
.snavi{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;font-size:13px;color:${C.ink2}}.snavi.on{background:${C.s2};color:${C.ink}}
.acard{background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:10px}.acard.off{opacity:.6}
.pbadge{font-size:11px;padding:0 6px;border-radius:6px;background:${C.s2};color:${C.ink2};line-height:18px}
.defb{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:0 6px;border-radius:6px;line-height:18px;color:${C.warn};background:${C.s2}}
.exrow{padding:10px 12px;border:1px solid ${C.line};border-radius:10px;background:${C.card}}
.stat{display:inline-flex;gap:5px;align-items:center;font-size:12px;white-space:nowrap}
.machhead{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:${C.ink2};margin-top:8px}
.term{background:${C.app};font-family:'Geist Mono',monospace;font-size:13px;line-height:1.65;padding:14px 22px;color:${C.ink2};flex:1;overflow:hidden;display:flex;flex-direction:column}
.tl{white-space:pre}
.tcursor{display:inline-block;width:8px;height:16px;background:${C.ink2};vertical-align:-3px;margin-left:2px}
.tbar{display:flex;align-items:center;gap:8px;height:40px;flex:none;padding:0 12px 0 24px;border-bottom:1px solid ${C.line}}
.tdrawer{border-top:1px solid ${C.line2};display:flex;flex-direction:column;height:260px;flex:none;background:${C.app}}
.tdrawer .term{padding:10px 22px;font-size:12px}
.tdhead{display:flex;align-items:center;gap:4px;height:36px;flex:none;padding:0 8px 0 16px;border-bottom:1px solid ${C.line}}
.ttab{display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 8px;border-radius:6px;color:${C.ink3}}.ttab.on{background:${C.s2};color:${C.ink}}
.newmenu{position:absolute;left:1000px;top:44px;width:300px;background:${C.s2};border:1px solid ${C.line2};border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:2px;box-shadow:0 12px 32px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.4);z-index:5}
.dlg{position:absolute;left:calc(50% - 260px);top:150px;width:520px;background:${C.s2};border:1px solid ${C.line2};border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 50px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4);z-index:7}
.field{display:flex;flex-direction:column;gap:6px}.flabel{font-size:12px;font-weight:600;color:${C.ink2}}
.finput{border:1px solid ${C.brand};box-shadow:0 0 0 3px ${C.brand}2e;background:${C.card};border-radius:9px;padding:7px 10px;font-size:14px}
.slist{display:flex;flex-direction:column;background:${C.card};border:1px solid ${C.line};border-radius:14px;overflow:hidden}
.srow{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid ${C.line};font-size:15px}.srow:last-child{border:none}
.mscreen .acard{padding:12px}
.keyrow{display:flex;gap:6px;padding:8px 10px 30px;background:${C.card};border-top:1px solid ${C.line2};overflow:hidden}
.key{font-family:'Geist Mono',monospace;font-size:12px;padding:6px 9px;border-radius:7px;background:${C.s3};color:${C.ink};flex:none}
`

// ---------- Settings sections (18.11.2026): machines, notifications, terminal, appearance ----------
// User request: Figma designs for every settings section, not only "Konten". The content follows what the
// app shows (SettingsMachines, SettingsNotifications, SettingsTerminal, SettingsAppearance) and the
// version line under the section list. Own output (`bull-settings*.html`) so frames already in
// Figma are not imported twice.
const settingsNavV = (active) =>
  `<div class="col gap16" style="width:200px;flex:none">${settingsNav(active)}<span class="sver">Bull 0.2.1</span></div>`
const settingsHead = (title, text) =>
  `<div class="col gap4"><h1>${title}</h1><span class="muted" style="max-width:620px">${text}</span></div>`
const settingsPage = (active, title, text, body) => `
<div class="page"><div class="row" style="gap:32px;align-items:flex-start;flex:1;min-height:0">
  ${settingsNavV(active)}
  <div class="col gap16 grow min">${settingsHead(title, text)}${body}</div>
</div></div>`
const settingsFrame = (name, main) =>
  desktop5(name, main, { nav: 'settings', tab: -1, right: false })

const MACHINES_TEXT =
  'Dieser PC und die SSH-Hosts aus <span class="mono">~/.ssh/config</span>, auf denen Bull Claude starten kann.'
const machineRow = (icon, name, meta, accounts, isReachable) => `
<div class="strow">${ic(icon, 16, C.ink3)}<div class="col min grow gap2"><span class="sm strong trunc">${name}</span><span class="xs muted trunc">${meta}</span></div>
  ${accounts ? `<span class="xs muted">${accounts}</span>` : ''}
  ${isReachable ? `<span class="stat" style="color:${C.good}">${ic('circle-check', 13, C.good)}Erreichbar</span>` : `<span class="stat" style="color:${C.warn}">${ic('circle-x', 13, C.warn)}Nicht erreichbar</span>`}
</div>`
const machineList = `<div class="stlist">
  ${machineRow('monitor', 'Dieser PC', 'agentd 0.2.1', '2 Konten', true)}
  ${machineRow('server', 'nexron-server', 'SSH-Host · agentd 0.2.1', '2 Konten', true)}
  ${machineRow('server', 'nexron-pc', 'SSH-Host · agentd ohne Versionsangabe, neu deployen', '1 Konto', true)}
  ${machineRow('server', 'laptop', 'SSH-Host', '', false)}
</div>`
const settingsMachines = settingsFrame(
  '22c Einstellungen · Rechner',
  settingsPage(
    'Rechner',
    'Rechner',
    MACHINES_TEXT,
    `<div style="max-width:672px">${machineList}</div>`
  )
)

const NOTIFY_TEXT = 'Wann Bull dich holt, und wie. Die Glocke in der Seitenleiste öffnet dasselbe.'
// The section title replaces the popover's own heading; its master switch stays as the first row.
const notifySection = (opts = {}) =>
  `<div class="stcard pop">${notifyPanel(opts).replace('<span class="strong">Benachrichtigungen</span>', '<span class="sm strong">Alle Meldungen</span>')}</div>`
const settingsNotify = settingsFrame(
  '22d Einstellungen · Benachrichtigungen',
  settingsPage(
    'Benachrichtigungen',
    'Benachrichtigungen',
    NOTIFY_TEXT,
    `<div style="max-width:576px">${notifySection()}</div>`
  )
)

const TERMINAL_TEXT =
  'Gilt für jedes neue Terminal in Bull, auf diesem PC und auf anderen Rechnern.'
const SHELLS = [
  'Automatisch',
  'PowerShell 7',
  'Windows PowerShell',
  'Eingabeaufforderung',
  'Git Bash'
]
const choiceGrid = (items, active, cols) =>
  `<div class="stgrid" style="grid-template-columns:repeat(${cols},1fr)">${items.map(([icon, label], index) => `<span class="stbtn${label === active ? ' on' : ''}"${cols === 2 && index === 0 ? ' style="grid-column:span 2"' : ''}>${icon ? ic(icon, 15, label === active ? C.ink : C.ink3) : ''}${label}</span>`).join('')}</div>`
const terminalPreview = (size) =>
  `<div class="col gap6"><span class="xs muted">Vorschau</span><div class="tprev" style="font-size:${size}px"><div><span style="color:${C.change}">nexron-chat</span> <span style="color:${C.good}">❯</span> <span style="color:${C.ink}">git status --short</span></div><div> M src/views/SettingsView.vue</div></div></div>`
const terminalSection = (size = 13) => `<div class="stcard">
  <div class="col gap8"><span class="sm strong">Shell</span>${choiceGrid(
    SHELLS.map((s) => [null, s]),
    'PowerShell 7',
    2
  )}</div>
  <div class="between"><span class="sm strong">Schriftgröße</span><span class="selbox">${size} px${ic('chevron-down', 14, C.ink3)}</span></div>
  ${terminalPreview(size)}
</div>`
const settingsTerminal = settingsFrame(
  '22e Einstellungen · Terminal',
  settingsPage(
    'Terminal',
    'Terminal',
    TERMINAL_TEXT,
    `<div style="max-width:576px">${terminalSection()}</div>`
  )
)

const APPEARANCE_TEXT =
  'Hell oder dunkel, und die Farbe, in der Bull akzentuiert. Die Bulle und die Claude-Marke färben sich mit, bis in Favicon und Taskleiste.'
const THEMES = [
  ['monitor', 'System'],
  ['sun', 'Hell'],
  ['moon', 'Dunkel']
]
// Presets in the spirit of the tweakcn community themes: an accent plus two neighbours, applied to
// both modes. The accent drives buttons, focus, meters and the bull.
const PRESETS = [
  { name: 'Night Desk', note: 'Standard', accent: C.brand, side: [C.change, C.outside] },
  { name: 'Claude', note: 'warm', accent: C.claude, side: ['#e8a87c', '#b5654a'] },
  { name: 'Violett', note: '', accent: C.change, side: ['#b6aef2', '#6a5fd0'] },
  { name: 'Türkis', note: '', accent: C.outside, side: ['#6fd0dc', '#13808f'] },
  { name: 'Wald', note: '', accent: '#2fa36b', side: ['#7cc9a0', '#1d7a4c'] },
  { name: 'Rose', note: '', accent: '#e0527f', side: ['#ef93b1', '#b03a5f'] }
]
const presetCard = (p, isOn) => `
<div class="pcard${isOn ? ' on' : ''}">
  <div class="pprev"><span class="ptile">${bull(22, p.accent)}</span><span class="col gap4 grow min"><span class="pbar" style="background:${p.accent};width:70%"></span><span class="pbar" style="width:46%"></span></span><span class="row gap4">${[p.accent, ...p.side].map((c) => dot(c, 10)).join('')}</span></div>
  <div class="between"><span class="sm${isOn ? ' strong' : ''}">${p.name}</span>${isOn ? ic('check', 14, C.ink) : p.note ? `<span class="xs muted">${p.note}</span>` : ''}</div>
</div>`
const customCard = `
<div class="pcard dashed"><div class="pprev" style="justify-content:center">${ic('pipette', 18, C.ink3)}</div><div class="between"><span class="sm">Eigene Farbe</span><span class="xs muted mono">#4d7cff</span></div></div>`
const presetGrid = (active, cols = 4) =>
  `<div class="pgrid" style="grid-template-columns:repeat(${cols},1fr)">${PRESETS.map((p) => presetCard(p, p.name === active)).join('')}${customCard}</div>`
const tweakRow = `<div class="tweak">${ic('palette', 16, C.ink2)}<div class="col min grow gap2"><span class="sm">Theme von tweakcn</span><span class="xs muted">Auf tweakcn.com/community ein Theme wählen, „Code“ kopieren und hier einfügen. Bull übernimmt die Farben für Hell und Dunkel.</span></div>${sbtn('Einfügen', 'clipboard-paste')}</div>`
// Where the accent shows up outside the page: browser tab, app icon in the taskbar, header mark
const brandPreview = (accent, label = true) => `
<div class="col gap8">${label ? '<span class="xs muted">Färbt sich mit</span>' : ''}<div class="row gap12" style="align-items:stretch">
  <div class="bprev"><span class="btab">${bull(14, accent)}<span class="xs trunc">Bull · nexron-chat</span>${ic('x', 11, C.ink3)}</span><span class="xs muted">Favicon</span></div>
  <div class="bprev"><span class="appico">${bull(30, accent)}</span><span class="xs muted">Taskleiste</span></div>
  <div class="bprev"><span class="row gap8">${bull(20, accent)}<span class="wordmark" style="font-size:15px">Bull</span></span><span class="xs muted">Kopfzeile</span></div>
  <div class="bprev"><span class="chip plain">${clawd(10, accent)}<span>Opus 5.5</span></span><span class="xs muted">Claude-Marke</span></div>
</div></div>`
const appearanceSection = (
  active = 'Night Desk',
  accent = C.brand,
  cols = 4
) => `<div class="stcard">
  <div class="col gap8"><span class="sm strong">Design</span>${choiceGrid(THEMES, 'System', 3)}</div>
  <div class="col gap8"><span class="sm strong">Farbschema</span>${presetGrid(active, cols)}</div>
  ${tweakRow}
  ${brandPreview(accent)}
</div>`
const appearancePage = (section) =>
  settingsPage(
    'Darstellung',
    'Darstellung',
    APPEARANCE_TEXT,
    `<div style="max-width:720px">${section}</div>`
  )
const settingsAppearance = settingsFrame(
  '22f Einstellungen · Darstellung',
  appearancePage(appearanceSection())
)
const TWEAK_CSS = [
  ':root {',
  '  --primary: oklch(0.6171 0.1375 39.0427);',
  '  --primary-foreground: oklch(1 0 0);',
  '  --ring: oklch(0.6171 0.1375 39.0427);',
  '  …',
  '}',
  '.dark {',
  '  --primary: oklch(0.6724 0.1308 38.7559);',
  '  …',
  '}'
].join('\n')
const CLAUDE_PRESET = {
  name: 'Claude (tweakcn)',
  note: '',
  accent: C.claude,
  side: ['#e8a87c', '#b5654a']
}
const tweakDialog = `
<div class="lbdim" style="background:rgba(5,5,6,.6)"></div>
<div class="dlg" style="width:600px;left:calc(50% - 300px);top:110px">
  <div class="between"><span class="strong lg">Theme von tweakcn einfügen</span>${iconBtn('x')}</div>
  <span class="muted sm">Den Block aus „Code“ auf tweakcn einfügen. Bull liest Primär-, Akzent- und Hintergrundfarben für Hell und Dunkel, Schriften und Radien bleiben.</span>
  <div class="field"><span class="flabel">CSS</span><div class="tprev" style="font-size:12px;border-color:${C.brand};box-shadow:0 0 0 3px ${C.brand}2e">${TWEAK_CSS}</div></div>
  <div class="okline">${ic('circle-check', 13, C.good)}<span>Erkannt: Primär, Akzent, Hintergrund, Rahmen · Hell und Dunkel</span></div>
  <div class="field"><span class="flabel">Vorschau</span><div class="row gap12" style="align-items:stretch"><div style="width:170px;flex:none">${presetCard(CLAUDE_PRESET, true)}</div><div class="grow min">${brandPreview(C.claude, false)}</div></div></div>
  <div class="row gap8" style="justify-content:flex-end">${btn('Abbrechen')}${btn('Übernehmen', 'check', 'strong')}</div>
</div>`
const settingsTweak = desktop5(
  '22g Einstellungen · Darstellung · Theme von tweakcn einfügen',
  appearancePage(appearanceSection()),
  { nav: 'settings', tab: -1, right: false, overlay: tweakDialog }
)

// Phone: each section is its own screen behind the list (M22, M31), with a back arrow to it
const mSettingsTop = (title) =>
  `<div class="mtop">${iconBtn('chevron-left')}<span class="strong grow">${title}</span></div>`
const mSettingsBody = (text, body) =>
  `<div class="col gap12"><span class="sm muted">${text}</span>${body}</div>`
const mMachines = mScreen(
  'M32 Einstellungen · Rechner',
  mSettingsTop('Rechner'),
  mSettingsBody(MACHINES_TEXT, machineList)
)
const mNotifySettings = mScreen(
  'M33 Einstellungen · Benachrichtigungen',
  mSettingsTop('Benachrichtigungen'),
  mSettingsBody(NOTIFY_TEXT, notifySection())
)
const mTerminalSettings = mScreen(
  'M34 Einstellungen · Terminal',
  mSettingsTop('Terminal'),
  mSettingsBody(TERMINAL_TEXT, terminalSection(12))
)
const mAppearance = mScreen(
  'M35 Einstellungen · Darstellung',
  mSettingsTop('Darstellung'),
  mSettingsBody(APPEARANCE_TEXT, appearanceSection('Night Desk', C.brand, 2))
)
const mSettingsVersion = mScreen(
  'M31 Einstellungen · mit Version',
  `<div class="mtop"><span class="strong lg grow">Einstellungen</span></div>`,
  `<div class="col gap12"><div class="slist">${sRow('user', 'Konten', '3 aktiv')}${sRow('monitor', 'Rechner', '3 von 4')}${sRow('bell', 'Benachrichtigungen', 'An')}${sRow('square-terminal', 'Terminal', 'PowerShell 7')}${sRow('sun', 'Darstellung', 'System')}</div><span class="sver" style="text-align:center">Bull 0.2.1</span></div>`,
  mNav('Einstellungen')
)

const cssSettings = `
.sver{font-family:'Geist Mono',monospace;font-size:12px;color:${C.ink3};padding:0 10px}
.stcard{background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:20px}
.stcard.pop{padding:8px;gap:0}
.stlist{display:flex;flex-direction:column;background:${C.card};border:1px solid ${C.line};border-radius:12px;overflow:hidden}
.strow{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid ${C.line}}.strow:last-child{border:none}
.stgrid{display:grid;gap:8px}
.stbtn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:1px solid ${C.line};border-radius:9px;font-size:13px;color:${C.ink3}}
.stbtn.on{border-color:${C.brand};background:${C.s2};color:${C.ink};font-weight:500}
.selbox{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;width:112px;height:34px;padding:0 10px;border:1px solid ${C.line2};border-radius:8px;font-size:13px;color:${C.ink}}
.tprev{background:${C.app};border:1px solid ${C.line};border-radius:9px;padding:8px 12px;font-family:'Geist Mono',monospace;line-height:1.65;color:${C.ink3};white-space:pre}
.pgrid{display:grid;gap:8px}
.pcard{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid ${C.line};border-radius:10px}
.pcard.on{border-color:${C.brand};background:${C.s2}}.pcard.dashed{border-style:dashed}
.pprev{display:flex;align-items:center;gap:8px;height:40px;padding:0 8px;border-radius:7px;background:${C.app}}
.ptile{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;background:${C.s2};flex:none}
.pbar{display:block;height:5px;border-radius:3px;background:${C.s3}}
.tweak{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid ${C.line};border-radius:10px}
.bprev{display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border:1px solid ${C.line};border-radius:10px;background:${C.app};flex:1;min-width:0}
.btab{display:flex;align-items:center;gap:6px;padding:5px 9px;border-radius:7px 7px 0 0;background:${C.s2};max-width:100%;min-width:0}
.appico{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:11px;background:#16161a;box-shadow:0 2px 6px rgba(0,0,0,.4)}
.mscreen .pcard{padding:8px}
.mscreen .tweak{flex-wrap:wrap}
.mscreen .strow{padding:12px}
.mscreen .stcard{padding:14px}
.mscreen .stcard.pop{padding:6px}
`
// 22f2: the app right after picking "Violett"; Clawd follows the accent as well. The shell's brand colours come from the stylesheet, so
// the frame carries its own scoped copy of every brand rule in the new accent; the preset cards keep
// their own colours, so "Night Desk" still shows blue and "Claude" orange.
const BRAND_HEXES = [C.brand, C.brandS, C.brandD, C.brandL, C.claude]
const withAccent = (text, accent) =>
  BRAND_HEXES.reduce((out, hex) => out.split(hex).join(accent), text)
// shortcut: rules inside @media are dropped, fine while the scheme frame is a desktop frame;
// parse the sheet properly once a phone frame gets a colour scheme.
const scopedAccentCss = (sheet, scope, accent) =>
  sheet
    .split('}')
    .filter((rule) => BRAND_HEXES.some((hex) => rule.includes(hex)))
    .map((rule) => {
      const [selector, body] = rule.split('{')
      if (!body || selector.includes('@')) return ''
      const scoped = selector
        .split(',')
        .map((part) => `${scope} ${part.trim()}`)
        .join(',')
      return `${scoped}{${withAccent(body, accent)}}`
    })
    .join('')
const SECTION_SLOT = '<!--appearance-section-->'
const SCHEME_FRAME = '22f2 Einstellungen · Darstellung · Farbschema Violett'
const settingsAppearanceScheme = withAccent(
  desktop5(SCHEME_FRAME, appearancePage(SECTION_SLOT), {
    nav: 'settings',
    tab: -1,
    right: false,
    overlay: `<style>${scopedAccentCss(`${css}${css5}${cssBuilt}${cssR6}${cssSettings}`, `section.frame[data-name="${SCHEME_FRAME}"]`, C.change)}</style>`
  }),
  C.change
).replace(SECTION_SLOT, appearanceSection('Violett', C.change))
const settingsDesktop = [
  settingsMachines,
  settingsNotify,
  settingsTerminal,
  settingsAppearance,
  settingsAppearanceScheme,
  settingsTweak
]
const settingsMobile = [
  mSettingsVersion,
  mMachines,
  mNotifySettings,
  mTerminalSettings,
  mAppearance
]
const settingsCss = `${css}${css5}${cssBuilt}${cssR6}${cssSettings}`
writeFileSync(
  new URL('bull-settings.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Einstellungen</title><style>${settingsCss}</style></head><body>${settingsDesktop.join('')}</body></html>`
)
writeFileSync(
  new URL('bull-settings-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Einstellungen Mobile</title><style>${settingsCss}</style></head><body>${settingsMobile.join('')}</body></html>`
)

// 12 (round 6): one list of finished chats, newest first; the unseen ones carry their number there,
// instead of a strip above that repeated the same chats (nothing shown twice).
const doneRow6 = (n, title, machine, summary, dur, files) =>
  doneRow(title, machine, summary, dur, files).replace(
    `<div class="drow">${ic('circle-check', 16, C.good)}`,
    `<div class="drow${n === 1 ? ' fresh1' : ''}">${n ? finishBadge(n, 18) : ic('circle-check', 16, C.good)}`
  )
const overview6 = desktop5(
  '12 Übersicht · laufend und fertig',
  overviewMain
    .replace(/<div class="quota">[\s\S]*?<div class="sect2">/, '<div class="sect2">')
    .replace(/<div class="sect2">\$\{ic\('history'[\s\S]*$/, '')
    .replace(
      /<div class="dlist">[\s\S]*?<\/div>\s*<\/div>\s*$/,
      `<div class="dlist">
    ${doneRow6(1, 'Blender Reel Shots', 'Dieser PC', 'Fünf Kamerafahrten, ein Ordner pro Shot', '41 min', '7')}
    ${doneRow6(2, 'Quota-Header fixen', 'Dieser PC', 'Header bei 1200 px nicht mehr abgeschnitten, Countdowns im Tooltip', '18 min', '4')}
    ${doneRow6(null, 'agentd auf Nexron PC', 'nexron-server', 'agentd.exe deployt, Tabs überleben Neustart', '9 min', '2')}
  </div>
</div>`
    )
    .replace(
      '<span>Fertig</span><span class="count">5</span>',
      '<span>Fertig</span><span class="count">5</span><span class="newc" style="margin-left:0">2 neu</span>'
    ),
  { right: false, sel: 'none', nav: 'overview', tab: -1 }
)

const r6Desktop = [
  chat5,
  chatApprovals,
  overview6,
  usage,
  newSession,
  accSwitch,
  notify,
  notifyBlocked,
  notifyBoard,
  imageView,
  imageMark,
  attachBoard,
  activityBoard,
  empties,
  settingsAccounts,
  settingsAdd,
  terminalTab,
  terminalDrawer
]
const r6Mobile = [...builtMobile, mSettings, mAccounts, mTerminal]
const r6Css = `${css}${css5}${cssBuilt}${cssR6}`
writeFileSync(
  new URL('bull-r6.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 6</title><style>${r6Css}</style></head><body>${r6Desktop.join('')}</body></html>`
)
writeFileSync(
  new URL('bull-r6-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 6 Mobile</title><style>${r6Css}</style></head><body>${r6Mobile.join('')}</body></html>`
)
writeFileSync(
  new URL('bull-accounts.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Konten</title><style>${r6Css}</style></head><body>${[settingsAccounts, settingsAdd, settingsAddExisting].join('')}</body></html>`
)
writeFileSync(
  new URL('bull-accounts-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Konten Mobile</title><style>${r6Css}</style></head><body>${mAccounts}</body></html>`
)
console.log('round 6 missing icons:', [...missing].join(', ') || 'none')

// ---------- Round 7 (18.11.2026): account failover and a queue until the limit resets ----------
// The user picked these two from ten ideas neither Claude Code nor herdr offers. A full account moves
// the chat to another account the folder allows (transfer + --resume); if none is allowed or free,
// the prompt waits for the reset and agentd sends it then.

const FULL_OWN = footAccount('own', 96, 71, '0:48 h')
const FULL_OWN_NOW = footAccount('own', 100, 71, '3:25 h')
const fullOwn = (html) => html.replace(FULL_OWN, FULL_OWN_NOW)
const quotaMini = (key, pct, note) =>
  `<div class="qmini">${dot(ACC[key].color, 7)}<span class="sm strong">${ACC[key].name}</span>${meter(pct, pct >= 100 ? C.crit : pct >= 80 ? C.warn : ACC[key].color, '72px', 4)}<span class="xs ${pct >= 100 ? 'critc' : 'muted'}">${note}</span></div>`

const failoverCard = (compact = false) => `
<div class="fo7">
  <div class="row gap8">${ic('arrow-left-right', 15, C.brand)}<span class="strong sm">Auf office umgezogen</span><span class="muted xs">gerade</span></div>
  <span class="sm ink2">privat ist voll. <span class="mono xs">nexron-chat</span> darf office nutzen, also läuft der Chat dort weiter.${compact ? '' : ' Verlauf, Subagents und /rewind-Stände sind mitgekommen.'}</span>
  <div class="row gap16 wrap">${quotaMini('own', 100, 'voll bis 03:25')}<span class="qarrow">${ic('arrow-right', 13, C.ink3)}</span>${quotaMini('work', 42, '58 % frei')}</div>
  <div class="between wrap gap8"><span class="xs muted row gap6">${ic('corner-down-right', 12, C.ink3)}Claude macht weiter, wo der Turn abbrach</span><span class="row gap6">${sbtn('Rückgängig', 'undo-2')}</span></div>
</div>`

const queuedCard = (compact = false) => `
<div class="q7">
  <div class="row gap8">${ic('timer', 15, C.read)}<span class="strong sm">Wartet auf privat</span><span class="grow"></span><span class="xs muted nowrap">Reset 03:25 · noch 3:05 h</span></div>
  <span class="sm ink2">privat ist voll, und <span class="mono xs">kramlos</span> darf nur privat nutzen. Bull schickt die Nachricht beim Reset${compact ? '.' : ' selbst ab, auch wenn das Fenster zu ist.'}</span>
  <div class="qprompt"><span class="qnum">1</span><span class="sm grow">Jetzt Termine über Mitternacht, danach die Tests.</span>${iconBtn('pencil', false, 13)}${iconBtn('x', false, 13)}</div>
  <div class="row gap6" style="justify-content:flex-end">${sbtn('Nicht senden', 'x')}${sbtn('Einmal auf office', 'arrow-left-right')}</div>
</div>`

const nudgeBar = `
<div class="nudge7">${ic('triangle-alert', 15, C.warn)}<div class="col min grow"><span class="sm strong">privat bei 92 %, Reset in 3:40 h</span><span class="xs muted">Nach diesem Turn auf office weitermachen? Der Chat läuft bis dahin normal.</span></div>${sbtn('Auf privat bleiben')}${sbtn('Nach dem Turn wechseln', 'arrow-left-right', 'primary')}</div>`

// 24 The limit hit, the chat moved on its own
const pwaStream = `
  ${userMessage('Mach die PWA installierbar und prüf es im Browser.')}
  ${toolCard('change', 'Edit', 'public/site.webmanifest', 'ok')}
  ${toolCard('change', 'Write', 'public/sw.js', 'ok')}
  ${failoverCard()}
  <div class="md"><p>Weiter: Manifest und Service Worker stehen. Jetzt baue ich und prüfe im Browser, ob „App installieren“ erscheint.</p></div>
  ${toolCard('change', 'Bash', 'npm run build', 'run')}
  ${thinkingBar()}`
const failover = fullOwn(
  desktop5(
    '24 Limit erreicht · Chat zieht um',
    `<div class="chat"><div class="stream end">${pwaStream}</div><div class="inputwrap">${promptInput5({ acc: 'work' })}</div></div>`,
    { tab: 1, sel: 'none', panel: { folder: 'nexron-chat', branch: 'feat/pwa', acc: 'work' } }
  )
)

// 24b Shortly before the limit: suggest the move at the end of the turn instead of mid-way
const nudge = desktop5(
  '24b Kurz vor dem Limit · Wechsel vorschlagen',
  `<div class="chat"><div class="stream end">
  ${userMessage('Mach die PWA installierbar und prüf es im Browser.')}
  ${toolCard('change', 'Edit', 'public/site.webmanifest', 'ok')}
  ${toolCard('change', 'Write', 'public/sw.js', 'run')}
  ${thinkingBar()}
</div><div class="inputwrap col gap8">${nudgeBar}${promptInput5({ acc: 'own' })}</div></div>`,
  { tab: 1, sel: 'none', panel: { folder: 'nexron-chat', branch: 'feat/pwa', acc: 'own' } }
)

// 25 No allowed account is free: the chat waits, the prompt is parked
const CAL_ROW = agentRow5(
  'working',
  'Kalender Wochenansicht',
  'kramlos',
  'own',
  '12 min',
  'Read · CalendarWeek.vue',
  { on: true }
)
// The waiting group needs room, so the Homeserver row leaves these frames. The waiting chat on
// nexron-server is not in the list (it shows this PC) and appears in the queue popover only.
const HOME_ROW = agentRow5(
  'waiting',
  'Homeserver Deploy',
  'homeserver',
  'work',
  '3 min',
  'wartet auf Shell',
  { shells: 1 }
)
const queuedSidebar = (html) =>
  fullOwn(html)
    .replace(CAL_ROW, '')
    .replace(HOME_ROW, '')
    .replace(
      '<span>Läuft</span><span class="count">3</span>',
      '<span>Läuft</span><span class="count">1</span>'
    )
    .replace(
      `<div class="grp">${ic('circle-check', 13, C.good)}<span>Fertig heute</span>`,
      `<div class="grp">${ic('timer', 13, C.read)}<span>Wartet auf Limit</span><span class="count">1</span></div>
  ${agentRow5('queued', 'Kalender Wochenansicht', 'kramlos', 'own', '03:25', 'sendet beim Reset · 1 Nachricht', { on: true })}
  <div class="grp">${ic('circle-check', 13, C.good)}<span>Fertig heute</span>`
    )
    .replace(
      `<span class="tab on">${statusIcon('working', 14)}<span>Kalender</span>`,
      `<span class="tab on">${statusIcon('queued', 14)}<span>Kalender</span>`
    )
const calStream = `
  ${userMessage('Bau die Wochenansicht im Kalender fertig.')}
  ${toolCard('read', 'Read', 'src/components/calendar/CalendarWeek.vue', 'ok')}
  <div class="md"><p>Die Spalten pro Tag stehen, Termine liegen im Raster.</p></div>
  ${queuedCard()}`
const CAL_PANEL = { folder: 'kramlos', branch: 'feat/calendar-week', acc: 'own' }
const queuedChat = queuedSidebar(
  desktop5(
    '25 Limit erreicht · Nachricht wartet',
    `<div class="chat"><div class="stream end">${calStream}</div><div class="inputwrap">${promptInput5({ acc: 'own' }).replace('Nachricht an Claude …', 'Weitere Nachricht kommt hinten in die Warteschlange …')}</div></div>`,
    { tab: 2, sel: 'cal', panel: CAL_PANEL, right: false }
  )
)

// 26 The queue: opened from the account line bottom left, grouped by the reset that frees it
// agentd keeps running in the background on every machine, so a queued message goes out without the app.
const qRow = (title, folder, text, machineIcon, where) =>
  `<div class="qrow">${ic('grip-vertical', 13, C.ink3)}<div class="col min grow gap2"><div class="between"><span class="sm strong trunc">${title}</span><span class="xs muted">${folder}</span></div><span class="xs ink2 trunc">„${text}“</span><span class="xs row gap4 muted">${ic(machineIcon, 11, C.ink3)}${where}</span></div>${iconBtn('ellipsis', false, 13)}</div>`
const queuePop = `
<div class="qpop">
  <div class="between"><span class="strong">Warteschlange</span><span class="xs muted">2 Nachrichten</span></div>
  <div class="qgroup">${dot(ACC.own.color, 7)}<span class="sm strong">privat</span><span class="xs muted">Reset 03:25 · noch 3:05 h</span></div>
  ${qRow('Kalender Wochenansicht', 'kramlos', 'Jetzt Termine über Mitternacht, danach die Tests.', 'monitor', 'Dieser PC')}
  ${qRow('Reel Shots rendern', 'reels', 'Render alle fünf Shots in ihre Ordner.', 'server', 'nexron-server')}
  <div class="pdiv"></div>
  <div class="between"><span class="xs muted row gap6">${ic('info', 12, C.ink3)}Geht auch bei geschlossener App raus, im Abstand von 10 s.</span>${sbtn('Jetzt senden', 'send')}</div>
</div>`
const queueFrame = queuedSidebar(
  desktop5(
    '26 Warteschlange · alle wartenden Nachrichten',
    `<div class="chat"><div class="stream end">${calStream}</div><div class="inputwrap">${promptInput5({ acc: 'own' })}</div></div>`,
    { tab: 2, sel: 'cal', panel: CAL_PANEL, right: false, overlay: queuePop }
  )
).replace(
  FULL_OWN_NOW,
  FULL_OWN_NOW.replace(
    '<span class="xs muted">5 h Reset 3:25 h</span>',
    `<span class="qbadge">${ic('timer', 11, C.read)}2 warten</span>`
  )
)

// 27 Settings: when Bull may move a chat, and which accounts each folder may use
const SETTINGS_SECTIONS_7 = [
  ['user', 'Konten'],
  ['arrow-left-right', 'Limits'],
  ['monitor', 'Rechner'],
  ['bell', 'Benachrichtigungen'],
  ['square-terminal', 'Terminal'],
  ['sun', 'Darstellung']
]
const settingsNav7 = (active) =>
  `<nav class="snav">${SETTINGS_SECTIONS_7.map(([i, t]) => `<span class="snavi${t === active ? ' on' : ''}">${ic(i, 15, t === active ? C.ink : C.ink3)}${t}</span>`).join('')}</nav>`
const optRow = (title, hint, isOn) =>
  `<div class="nrow"><div class="col min grow"><span class="sm">${title}</span><span class="xs muted">${hint}</span></div>${sw(isOn)}</div>`
const allowChips = (keys) => keys.map((k) => accChip(k)).join('')
const ruleRow7 = (folder, chips, then, isFallback = false) =>
  `<div class="tr r7"><span class="${isFallback ? 'muted sm' : 'mono sm'}">${folder}</span><span class="row gap6">${chips}</span><span class="sm">${then}</span>${iconBtn('ellipsis', false, 13)}</div>`
const limitsMain = `
<div class="page"><div class="row" style="gap:32px;align-items:flex-start;flex:1;min-height:0">
  ${settingsNav7('Limits')}
  <div class="col gap12 grow min">
    <div class="col gap4"><h1>Limits</h1><span class="muted" style="max-width:660px">Was passiert, wenn ein Konto voll ist: Der Chat zieht auf ein anderes Konto um, das der Ordner nutzen darf, oder er wartet auf den Reset.</span></div>
    <div class="acard"><span class="strong">Umziehen</span>
      <div class="row gap12"><span class="sm ink2 grow">Wenn ein Konto voll ist</span><span class="seg"><span class="on">Automatisch umziehen</span><span>Erst fragen</span><span>Nur warten</span></span></div>
      ${optRow('Schon ab 90 % vorschlagen', 'Am Ende des Turns, nicht mittendrin. Der Chat läuft bis dahin normal.', true)}
      <div class="row gap12"><span class="sm ink2" style="width:110px">Reihenfolge</span><span class="ordl">${ic('grip-vertical', 13, C.ink3)}${accChip('work', true)}</span><span class="ordl">${ic('grip-vertical', 13, C.ink3)}${accChip('own', true)}</span><span class="xs muted">Das erste erlaubte Konto mit freiem Kontingent bekommt den Chat.</span></div>
    </div>
    <div class="acard"><div class="between"><span class="strong">Konten pro Ordner</span>${sbtn('Regel hinzufügen', 'plus')}</div>
      <div class="tbl"><div class="tr r7 th"><span>Ordner</span><span>Darf nutzen</span><span>Wenn alle voll sind</span><span></span></div>
        ${ruleRow7('nexron-chat', allowChips(['work', 'own']), 'umziehen, sonst warten')}
        ${ruleRow7('kramlos', allowChips(['own']), 'warten')}
        ${ruleRow7('agentdashboard', allowChips(['work']), 'warten')}
        ${ruleRow7('Alle anderen Ordner', '<span class="sm ink2">jedes Konto, nach Reihenfolge</span>', 'umziehen, sonst warten', true)}
      </div>
      <span class="xs muted row gap6">${ic('info', 12, C.ink3)}Ohne Regel nimmt Bull das erste freie Konto der Reihenfolge. Eine Regel schränkt das ein, etwa private Projekte nur auf privat.</span>
    </div>
    <div class="acard"><span class="strong">Warteschlange</span>
      ${optRow('Nachrichten bis zum Reset parken', 'Was du an einen vollen Chat schickst, wartet und geht beim Reset raus.', true)}
      ${optRow('Melden, wenn eine wartende Nachricht losgeht', 'Wie bei „Fertig“: Benachrichtigung, wenn Bull im Hintergrund ist.', true)}
      <span class="xs muted row gap6">${ic('server', 12, C.ink3)}agentd läuft auf jedem Rechner im Hintergrund weiter und sendet auch bei geschlossener App.</span>
    </div>
  </div>
</div></div>`
const limitsSettings = desktop5('27 Einstellungen · Limits', limitsMain, {
  nav: 'settings',
  tab: -1,
  right: false
})

// 28 Board: the flow and the edge cases
const flowBox = (icon, color, title, text) =>
  `<div class="fbox">${ic(icon, 16, color)}<span class="sm strong">${title}</span><span class="xs muted">${text}</span></div>`
const ARROW_7 = `<span class="farrow">${ic('arrow-right', 16, C.ink3)}</span>`
const caseRow = (what, how) =>
  `<div class="tr c7"><span class="strong">${what}</span><span>${how}</span></div>`
const limitsBoard = frame(
  '28 Limits · Ablauf und Sonderfälle',
  1440,
  900,
  `<div class="page pad">
  <div class="col gap4"><h1>Konto voll: umziehen oder warten</h1><span class="muted">Claude meldet das Limit als <span class="mono">result</span> mit <span class="mono">usage_limit_reached</span>. agentd entscheidet nach der Ordnerregel, die App zeigt das Ergebnis als Karte im Chat.</span></div>
  <div class="panel"><span class="strong">Ablauf</span>
    <div class="flow7">
      ${flowBox('octagon-exclamation-point', C.crit, 'Limit erreicht', 'Turn endet mit usage_limit_reached')}${ARROW_7}
      ${flowBox('list-checks', C.ink2, 'Regel prüfen', 'Welche Konten darf der Ordner nutzen, welches hat Platz?')}${ARROW_7}
      <div class="col gap8 grow">
        <div class="row gap8">${flowBox('arrow-left-right', C.brand, 'Umziehen', 'Prozess beenden, Verlauf kopieren, mit dem anderen Konto <span class="mono nowrap">--resume</span>')}${ARROW_7}${flowBox('corner-down-right', C.brand, 'Weitermachen', '„Mach weiter, wo du warst“, nicht den Prompt doppelt')}</div>
        <div class="row gap8">${flowBox('timer', C.read, 'Warten', 'Nachricht parken, Reset-Zeit aus dem Kontingent')}${ARROW_7}${flowBox('send', C.read, 'Beim Reset senden', 'agentd schickt sie, danach Fertig-Nummer wie gewohnt')}</div>
      </div>
    </div>
  </div>
  <div class="panel"><span class="strong">Sonderfälle</span>
    <div class="tbl">
      ${caseRow('Alle erlaubten Konten voll', 'Warten auf den frühesten Reset unter den erlaubten Konten; die Karte nennt ihn.')}
      ${caseRow('Wochenlimit statt 5 h', 'Wird geparkt wie beim 5-h-Limit, auch über Tage; die Karte nennt Tag und Uhrzeit („Reset Mo 09:00“).')}
      ${caseRow('Limit mitten im Turn', 'Der halbe Turn bleibt im Verlauf. Nach dem Umzug geht „Mach weiter“ raus, damit nichts doppelt läuft.')}
      ${caseRow('Chat auf nexron-server', 'Nur Konten dieses Rechners. agentd dort sendet wartende Nachrichten auch ohne App.')}
      ${caseRow('Bull auf diesem PC geschlossen', 'agentd läuft im Hintergrund weiter wie auf nexron-server und sendet beim Reset; Bull zeigt das Ergebnis beim nächsten Öffnen.')}
      ${caseRow('Rückgängig nach dem Umzug', 'Zurück aufs alte Konto; die Nachricht wartet dann dort auf den Reset.')}
    </div>
  </div>
</div>`
)

// Phone
const mFailover = mScreen(
  'M25 Chat · umgezogen',
  chatTop('working', 'PWA installierbar', 'work'),
  `
  ${userMessage('Mach die PWA installierbar.')}
  ${toolCard('change', 'Edit', 'site.webmanifest', 'ok')}
  ${failoverCard(true)}
  ${toolCard('change', 'Bash', 'npm run build', 'run')}`,
  `<div class="mthink">${thinkingBar()}</div>${mComposer({ acc: 'work' })}`
)
const mQueued = mScreen(
  'M26 Chat · wartet auf Reset',
  chatTop('queued', 'Kalender Woche', 'own'),
  `
  ${userMessage('Bau die Wochenansicht fertig.')}
  ${toolCard('read', 'Read', 'CalendarWeek.vue', 'ok')}
  <div class="md"><p>Die Spalten pro Tag stehen.</p></div>
  ${queuedCard(true)}`,
  mComposer({ acc: 'own' })
)
const mLimits = mScreen(
  'M27 Einstellungen · Limits',
  `<div class="mtop">${iconBtn('chevron-left')}<span class="strong grow">Limits</span></div>`,
  `<div class="acard"><span class="strong sm">Wenn ein Konto voll ist</span><span class="seg full"><span class="on">Umziehen</span><span>Fragen</span><span>Warten</span></span>${optRow('Ab 90 % vorschlagen', 'am Ende des Turns', true)}</div>
  <div class="acard"><span class="strong sm">Konten pro Ordner</span>
    ${[
      ['nexron-chat', ['work', 'own']],
      ['kramlos', ['own']],
      ['agentdashboard', ['work']]
    ]
      .map(
        ([f, k]) =>
          `<div class="between"><span class="mono xs">${f}</span><span class="row gap4">${allowChips(k)}</span></div>`
      )
      .join('')}
  </div>
  <div class="acard"><span class="strong sm">Warteschlange</span>${optRow('Bis zum Reset parken', 'geht beim Reset raus', true)}</div>`
)

const cssR7 = `
.fo7,.q7{border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.fo7{border:1px solid ${C.brand}59;background:${C.brand}12}
.q7{border:1px solid ${C.read}59;background:${C.read}12}
.qmini{display:flex;align-items:center;gap:8px}
.critc{color:${C.crit}}
.qprompt{display:flex;align-items:center;gap:8px;background:${C.card};border:1px solid ${C.line2};border-radius:9px;padding:6px 6px 6px 10px}
.qnum{width:18px;height:18px;border-radius:99px;background:${C.s3};color:${C.ink2};font-size:10px;display:flex;align-items:center;justify-content:center;flex:none}
.nudge7{display:flex;align-items:center;gap:10px;border:1px solid ${C.warn}55;background:${C.warn}12;border-radius:12px;padding:8px 10px 8px 12px}
.qpop{position:absolute;left:14px;bottom:122px;width:400px;background:${C.s2};border:1px solid ${C.line2};border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 12px 32px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.4);z-index:6}
.qgroup{display:flex;align-items:center;gap:8px;padding:4px 2px}
.qrow{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;background:${C.s3}}
.qbadge{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${C.read}}
.tr.r7{grid-template-columns:1.2fr 1.4fr 1.2fr 28px;align-items:center}
.ordl{display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid ${C.line2};border-radius:8px}
.flow7{display:flex;align-items:center;gap:8px}
.fbox{background:${C.s2};border:1px solid ${C.line2};border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;width:200px;flex:none}
.farrow{display:flex;align-items:center;flex:none}
.tr.c7{grid-template-columns:260px 1fr}
.mscreen .qarrow{display:none}
.mscreen .fo7 .row.wrap{row-gap:6px}
`

const r7Desktop = [failover, nudge, queuedChat, queueFrame, limitsSettings, limitsBoard]
const r7Mobile = [mFailover, mQueued, mLimits]
const r7Css = `${css}${css5}${cssBuilt}${cssR6}${cssR7}`
writeFileSync(
  new URL('bull-r7.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 7</title><style>${r7Css}</style></head><body>${r7Desktop.join('')}</body></html>`
)
writeFileSync(
  new URL('bull-r7-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 7 Mobile</title><style>${r7Css}</style></head><body>${r7Mobile.join('')}</body></html>`
)
console.log('round 7 missing icons:', [...missing].join(', ') || 'none')

// ---------- Round 8 (18.11.2026): what Claude Code shows in the terminal and Bull does not yet ----------
// User request: compare Bull with the terminal, find the gaps, and rework the design so the UI makes sense.
// Two boards (gaps, UX fixes) and the screens that close the gaps. Out: out/bull-r8*.html.

// The session bar carries the whole place (machine, folder, branch), so the panel no longer repeats it.
const sessionBar8 = (p = {}) =>
  `<div class="sbar">${ic('monitor', 13, C.ink3)}<span class="xs ink2">${p.machine || 'Dieser PC'}</span><span class="crumb">/</span>${ic('folder-open', 13, C.ink3)}<span class="mono xs">${p.folder || 'nexron-chat'}</span><span class="crumb">/</span>${ic('git-branch', 13, C.ink3)}<span class="mono xs">${p.branch || 'feat/bull-brand'}</span><span class="grow"></span>${iconBtn('history', false, 14)}${iconBtn('ellipsis', false, 14)}</div>`

// "Read 3 files, searched once": one quiet line instead of three cards, like the terminal's summary.
const toolGroup8 = (text, open = false) =>
  `<div class="tgroup8">${ic('list-tree', 14, C.ink3)}<span>${text}</span>${ic(open ? 'chevron-down' : 'chevron-right', 13, C.ink3)}</div>`

// Edit result as the terminal shows it: counts in the head, line numbers, context around the change.
const diffLine8 = ([n, sign, text]) =>
  `<div class="dl8${sign === '+' ? ' add' : sign === '-' ? ' del' : ''}"><span class="dn8">${n}</span><span class="ds8">${sign === ' ' ? '' : sign}</span><span class="dt8">${text}</span></div>`
const diffCard8 = (file, add, del, lines) => `<div class="tool">
  <div class="thead">${ic('file-pen', 15, C.change)}<span class="tname">Edit</span><span class="ttarget trunc">${file}</span><span class="grow"></span><span class="xs" style="color:${C.good}">+${add}</span><span class="xs" style="color:${C.crit}">−${del}</span>${ic('check', 14, C.good)}${ic('chevron-down', 14, C.ink3)}</div>
  <div class="diff8">${lines.map(diffLine8).join('')}</div>
</div>`
const DIFF_8 = [
  [41, ' ', '&lt;header class="flex items-center gap-3"&gt;'],
  [42, '-', '  &lt;span class="font-bold"&gt;Bull&lt;/span&gt;'],
  [42, '+', '  &lt;BrandBullLogo :size="24" class="text-brand" /&gt;'],
  [43, '+', '  &lt;span class="h-6 w-px bg-input" /&gt;'],
  [44, '+', '  &lt;BrandNexronLogo :height="24" /&gt;'],
  [45, ' ', '&lt;/header&gt;']
]

// Long output stays short: the last lines, the rest one click away.
const bashCard8 = (cmd, lines, more, state = 'ok') => `<div class="tool">
  <div class="thead">${ic('square-terminal', 15, C.change)}<span class="tname">Bash</span><span class="ttarget trunc">${cmd}</span><span class="grow"></span>${state === 'ok' ? ic('check', 14, C.good) : ic('loader-circle', 14, C.warn)}${ic('chevron-down', 14, C.ink3)}</div>
  <div class="out8">${more ? `<span class="more8">${ic('chevron-up', 12, C.ink3)}${more} Zeilen davor</span>` : ''}${lines.map((l) => `<div class="mono xs">${l}</div>`).join('')}</div>
</div>`

// End of a turn: what it took, no thumbs (Bull has nowhere to send them).
const turnFoot8 = (text) =>
  `<div class="feedback">${iconBtn('copy', false, 14)}<span class="muted sm">${text}</span></div>`

// The terminal's status line: verb, time, tokens so far, how to stop.
const statusLine8 = (verb = 'Führt Tests aus …', time = '0:42', tokens = '4,2k') =>
  `<div class="thinking">${ic('loader-circle', 14, C.warn)}<span class="shimmer">${verb}</span><span class="muted sm nowrap row gap4">${time} · ${ic('arrow-down', 11, C.ink3)}${tokens} Tokens</span><span class="grow"></span><span class="stop">${ic('square', 11, C.ink2)}Stopp ${kbd('Esc')}</span></div>`

// Typed while Claude works: waits above the input, editable, goes out after the turn.
const queued8 = (items) =>
  `<div class="queue8"><span class="xs muted row gap6">${ic('clock', 12, C.ink3)}Geht raus, sobald Claude fertig ist</span>${items.map((t, i) => `<div class="qprompt"><span class="qnum">${i + 1}</span><span class="sm grow trunc">${t}</span>${iconBtn('pencil', false, 13)}${iconBtn('x', false, 13)}</div>`).join('')}</div>`

// One chip per thing that can change in a running chat; each opens or cycles, none only decorates.
const MODES_8 = {
  default: ['hand', 'Nachfragen', C.ink3],
  acceptEdits: ['file-pen', 'Änderungen erlauben', C.change],
  plan: ['clipboard-list', 'Erst planen', C.read],
  auto: ['zap', 'Auto', C.warn]
}
const modeChip8 = (mode = 'auto', on = false) =>
  `<span class="chip plain${on ? ' chipon' : ''}">${ic(MODES_8[mode][0], 13, MODES_8[mode][2])}<span>${MODES_8[mode][1]}</span><span class="kbd" style="font-size:10px">⇧Tab</span></span>`
const ctxRing8 = (pct, on = false) => {
  const color = pct >= 85 ? C.warn : C.brand
  return `<span class="ctx${on ? ' ctxon' : ''}"><span class="ring" style="background:conic-gradient(${color} 0 ${pct}%, ${C.line2} ${pct}% 100%)"><span></span></span><span class="sm" style="color:${pct >= 85 ? C.warn : C.ink3}">${pct} %</span></span>`
}
const composer8 = (o = {}) => {
  const acc = ACC[o.acc || 'work']
  const ph =
    '<span>Nachricht an Claude …</span><span class="phk">/ Befehle · @ Dateien · ! Shell</span>'
  const text = o.shell
    ? `<div class="ptext row gap8"><span class="shellb">${ic('dollar-sign', 12, C.outside)}Shell</span><span class="mono" style="font-size:14px">${o.text}</span><span class="caret"></span></div>`
    : `<div class="ptext${o.text ? '' : ' ph ph8'}">${o.text || ph}</div>`
  const left = o.shell
    ? `<span class="xs muted" style="padding:0 6px">Läuft in <span class="mono">nexron-chat</span>, die Ausgabe geht an Claude · ${kbd('Esc')} zurück zum Chat</span>`
    : `${iconBtn('paperclip')}
    <span class="chip plain${o.modelOn ? ' chipon' : ''}">${clawd(10)}<span>Opus 5.5 · Hoch</span>${ic('chevron-down', 12, C.ink3)}</span>
    <span class="chip plain">${dot(acc.color, 7)}<span>${acc.name} · ${acc.plan}</span>${ic('chevron-down', 12, C.ink3)}</span>
    ${modeChip8(o.mode || 'auto', o.modeOn)}`
  return `<div class="pinput${o.focus ? ' focus' : ''}${o.shell ? ' shell8' : ''}">
  ${o.attach || ''}
  ${text}
  <div class="prow">
    ${left}
    <span class="grow"></span>
    ${o.shell ? '' : ctxRing8(o.ctx ?? 11, o.ctxOn)}
    <span class="send${o.text ? '' : ' off'}">${ic(o.shell ? 'corner-down-left' : 'arrow-up', 16, o.text ? '#fff' : C.ink3)}</span>
  </div>
</div>`
}
const pasteChip8 = `<div class="row gap8"><span class="att5"><span class="attimg">${ic('clipboard-paste', 15, C.ink2)}</span><span class="attname">Text · 42 Zeilen</span>${ic('x', 12, C.ink3)}</span></div>`

const chatColumn8 = (inner, input, above = '') =>
  `<div class="chat"><div class="stream end">${inner}</div><div class="inputwrap col gap8">${above}${input}</div></div>`

// Right panel without the place (it is in the session bar) and without the "now" card (the status
// line right next to it already says what runs).
const rightPanel8 = (p = {}) => `
<aside class="right r5"><span class="rscroll"></span>
  <div class="rsect"><div class="kv">${ic('user', 14, C.ink3)}<span>Konto</span><span class="grow"></span>${accChip(p.acc || 'work')}<span class="swap">${ic('arrow-left-right', 12, C.ink2)}Wechseln</span></div></div>
  <div class="rsect"><div class="between"><span class="rtitle">Aktivität</span><span class="xs muted row gap8">14 Tools<span class="livedot">${dot(C.warn, 6)}live</span></span></div>
    <div class="col gap2">
      ${recentTool('Bash', 'npm test', '0:42', 'run')}
      ${recentTool('Edit', 'src/views/ChatView.vue', '0:02')}
      ${recentTool('Read', 'SiteHeader.vue', '0:01')}
      ${recentTool('Grep', '"BrandBullLogo"', '0:01')}
    </div>
    <span class="link">Alle 14 im Chat zeigen ${ic('chevron-right', 12, C.ink3)}</span>
  </div>
  <div class="rsect"><div class="between"><span class="rtitle">Subagents</span><span class="xs muted"><span style="color:${C.warn}">1 läuft</span> · 1 fertig</span></div>
    ${subagentRow('run', 'Explore', 'Header-Muster suchen', '1:12', [
      ['ok', 'Glob', 'src/**/*Header*.vue', '0:01'],
      ['run', 'Grep', '"BrandNexronLogo"', '0:04']
    ])}
    ${subagentRow('ok', 'Explore', 'Tokens lesen', '0:38', '5 Aktionen · Read tokens.css, Grep --brand')}
  </div>
  <div class="rsect"><span class="rtitle">Im Hintergrund</span>
    <div class="kv">${ic('square-terminal', 14, C.ink3)}<span class="mono xs trunc grow ink2">npm run dev</span><span class="xs muted">läuft 12 min</span></div>
    <span class="xs muted row gap4">${kbd('Ctrl B')}schiebt eine laufende Shell hierher</span>
  </div>
  <div class="rsect"><div class="between"><span class="rtitle">Konnektoren</span><span class="xs muted">3 verbunden</span></div>
    <div class="row gap12 wrap sm">${['Figma', 'Obsidian', 'Google Kalender'].map((n) => `<span class="row gap4">${ic('plug', 13, C.ink3)}${n}</span>`).join('')}</div>
    <div class="kv">${ic('plug', 13, C.ink3)}<span class="sm">Notion</span><span class="grow"></span><span class="xs" style="color:${C.warn}">Anmeldung nötig</span><span class="link">Anmelden</span></div>
  </div>
</aside>`

const desktop8 = (name, main, opts = {}) =>
  frame(
    name,
    1440,
    900,
    `<div class="shell">${sidebar5(opts)}<div class="mainw">${topbar5(opts.tab ?? 0, 'chat')}<div class="body"><div class="col grow min">${sessionBar8(opts.bar)}${main}</div>${opts.right === false ? '' : rightPanel8(opts.panel)}</div></div></div>${opts.overlay || ''}`
  )

// Shared stream of the reworked chat, so every round-8 screen shows the same moment.
const STATUS_8 = statusLine8()
const stream8 = `
  ${userMessage('Mach den Header wie beim Homeserver und lass die Tests laufen.')}
  ${toolGroup8('3 Dateien gelesen, 1 Suche')}
  ${diffCard8('src/views/ChatView.vue', 3, 1, DIFF_8)}
  ${bashCard8('npm test', ['✓ src/utils/__tests__/toolInput.spec.ts (14)', '✓ src/stores/__tests__/chat.spec.ts (38)', 'Test Files  41 passed (41)', '     Tests  312 passed (312)'], 118)}
  <div class="md"><p>Der Header zeigt jetzt Bulle, Trennstrich und NEXRON-Logo. Alle 312 Tests laufen.</p></div>
  ${turnFoot8('Gearbeitet 4:12 min · 18,2k Tokens · Opus 5.5')}
  ${userMessage('Jetzt noch der Fokusring in Markenfarbe.')}
  ${toolCard('change', 'Edit', 'src/styles/tokens.css', 'ok')}
  ${STATUS_8}`
const stream8Idle = stream8.replace(STATUS_8, '')

// 30 The reworked chat: every gap that lives in the stream, at once
const chat8 = desktop8(
  '30 Chat · überarbeitet',
  chatColumn8(
    stream8,
    composer8({ text: 'Danach den Branch pushen', focus: true, attach: pasteChip8 }),
    queued8(['Und im Light-Mode prüfen.'])
  )
)

// 31 Slash commands: what agentd already reads from Claude Code (commands and skills), as a menu
const POP_LEFT = 'left:360px'
const slashItem = (cmd, text, on = false, badge = '') =>
  `<div class="mi8${on ? ' on' : ''}"><span class="mono sm strong nowrap" style="min-width:118px">${cmd}</span><span class="sm ink2 trunc grow">${text}</span>${badge}</div>`
const menuGroup = (title) => `<div class="mg8">${title}</div>`
const slashMenu = `<div class="pop8" style="bottom:118px;${POP_LEFT};width:520px">
  ${menuGroup('In Bull')}
  ${slashItem('/compact', 'Verlauf zusammenfassen, optional mit Schwerpunkt', true, kbd('Enter'))}
  ${slashItem('/context', 'Zeigen, was den Kontext belegt')}
  ${slashItem('/model', 'Modell und Denktiefe für diesen Chat')}
  ${slashItem('/rewind', 'Gespräch oder Code zurückspulen')}
  ${slashItem('/clear', 'Neu anfangen, Tab bleibt offen')}
  ${slashItem('/export', 'Gespräch als Markdown speichern')}
  ${menuGroup('Claude Code')}
  ${slashItem('/review', 'Änderungen prüfen lassen')}
  ${slashItem('/init', 'CLAUDE.md für dieses Projekt anlegen')}
  ${slashItem('/memory', 'CLAUDE.md und Regeln bearbeiten')}
  ${menuGroup('Eigene und Skills')}
  ${slashItem('/commit', '.claude/commands/commit.md', false, `<span class="tag8">Befehl</span>`)}
  ${slashItem('/code-review', 'Diff prüfen, Funde nach Schwere', false, `<span class="tag8">Skill</span>`)}
  <div class="mf8">${kbd('↑')}${kbd('↓')} wählen · ${kbd('Tab')} ergänzen · ${kbd('Enter')} ausführen · ${kbd('Esc')} schließen</div>
</div>`
const slash8 = desktop8(
  '31 Eingabe · Slash-Befehle',
  chatColumn8(stream8Idle, composer8({ text: '/', focus: true })),
  { overlay: slashMenu }
)

// 31b Searching the menu (user request): what follows the slash filters by name and description alike
const hl = (text) => `<span class="hl8">${text}</span>`
const slashSearchMenu = `<div class="pop8" style="bottom:118px;${POP_LEFT};width:520px">
  ${menuGroup('3 Treffer für „prüf“')}
  ${slashItem('/review', `Änderungen ${hl('prüf')}en lassen`, true, kbd('Enter'))}
  ${slashItem('/code-review', `Diff ${hl('prüf')}en, Funde nach Schwere`, false, `<span class="tag8">Skill</span>`)}
  ${slashItem('/better-interface', `Screen ${hl('prüf')}en, ein Bericht nach Rang`, false, `<span class="tag8">Skill</span>`)}
  <div class="mf8">Sucht in Namen und Beschreibungen · ${kbd('Tab')} ergänzt · ${kbd('Enter')} führt aus</div>
</div>`
const slashSearch8 = desktop8(
  '31b Eingabe · Slash-Befehle suchen',
  chatColumn8(stream8Idle, composer8({ text: '/prüf', focus: true })),
  { overlay: slashSearchMenu }
)

// 32 @ mentions: files of the chat's folder, fuzzy, the pick becomes a chip in the text
const atItem = (icon, path, hint = '', on = false) =>
  `<div class="mi8${on ? ' on' : ''}">${ic(icon, 14, on ? C.ink : C.ink3)}<span class="mono sm trunc grow">${path}</span><span class="xs muted">${hint}</span></div>`
const atMenu = `<div class="pop8" style="bottom:118px;${POP_LEFT};width:520px">
  ${menuGroup('Dateien in nexron-chat · „chat“')}
  ${atItem('file-code', 'src/components/chat/<b>Chat</b>Composer.vue', 'geändert', true)}
  ${atItem('file-code', 'src/components/chat/<b>Chat</b>Pane.vue')}
  ${atItem('file-code', 'src/stores/<b>chat</b>.ts')}
  ${atItem('folder', 'src/components/<b>chat</b>/', '52 Dateien')}
  ${menuGroup('Konnektoren')}
  ${atItem('plug', 'obsidian:Projects/NEXRON <b>Chat</b>.md')}
  <div class="mf8">${kbd('Tab')} übernehmen · Claude liest die Datei mit der Nachricht</div>
</div>`
const atText =
  'Bau die Befehle in <span class="ment8">@ChatComposer.vue</span> ein, Muster wie in @chat'
const at8 = desktop8(
  '32 Eingabe · @ Dateien',
  chatColumn8(stream8Idle, composer8({ text: atText, focus: true })),
  { overlay: atMenu }
)

// 32b ! Shell: one command in the chat's folder, its output lands in the chat and in Claude's context
const shellBlock8 = `<div class="sh8">
  <div class="row gap8">${ic('dollar-sign', 13, C.outside)}<span class="mono sm strong">git status --short</span><span class="grow"></span><span class="xs muted">0,3 s · an Claude</span></div>
  <div class="mono xs ink2"> M src/views/ChatView.vue<br> M src/styles/tokens.css<br>?? public/favicon_new.svg</div>
</div>`
const shellStream8 = `
  ${toolGroup8('3 Dateien gelesen, 1 Suche')}
  ${diffCard8('src/views/ChatView.vue', 3, 1, DIFF_8)}
  <div class="md"><p>Der Header zeigt jetzt Bulle, Trennstrich und NEXRON-Logo.</p></div>
  ${turnFoot8('Gearbeitet 4:12 min · 18,2k Tokens · Opus 5.5')}
  ${shellBlock8}`
const shell8 = desktop8(
  '32b Eingabe · ! Shell',
  chatColumn8(shellStream8, composer8({ shell: true, text: 'npm run lint', focus: true }))
)

// 33 Model and effort in a running chat; the mode chip cycles with Shift+Tab like the terminal
// User request: the effort levels get icons that show the step, the models Claude's mark.
const EFFORT_8 = [
  ['Niedrig', 'signal-low'],
  ['Mittel', 'signal-medium'],
  ['Hoch', 'signal-high'],
  ['Max', 'signal']
]
const effortSeg8 = (cls) =>
  `<div class="${cls}">${EFFORT_8.map(([e, icon]) => `<span class="row gap4${e === 'Hoch' ? ' on' : ''}" style="justify-content:center">${ic(icon, 13, e === 'Hoch' ? C.ink : C.ink3)}${e}</span>`).join('')}</div>`
const modelPop = `<div class="pop8" style="bottom:118px;left:380px;width:340px">
  ${menuGroup('Modell')}
  ${[
    ['Opus 5.5', 'am gründlichsten', true],
    ['Sonnet 5.5', 'schnell, für das meiste'],
    ['Haiku 5.5', 'am schnellsten']
  ]
    .map(
      ([m, h, on]) =>
        `<div class="mi8${on ? ' on' : ''}">${ic(on ? 'circle-dot' : 'circle', 14, on ? C.brand : C.ink3)}${clawd(10)}<span class="sm strong" style="width:84px">${m}</span><span class="xs muted grow">${h}</span></div>`
    )
    .join('')}
  ${menuGroup('Denktiefe')}
  ${effortSeg8('seg full eff8')}
  <div class="mf8">Gilt ab der nächsten Nachricht. Verlauf und Konto bleiben.</div>
</div>`
const modeTip = `<div class="tip8" style="bottom:118px;left:740px"><span class="sm strong">Änderungen erlauben</span><span class="xs muted">Claude ändert Dateien ohne zu fragen, Befehle brauchen weiter deine Freigabe.</span><div class="row gap6 xs muted nowrap">${kbd('⇧Tab')}weiter zu <span class="ink2">Erst planen</span> → Auto → Nachfragen</div></div>`
const model8 = desktop8(
  '33 Eingabe · Modell, Denktiefe, Modus',
  chatColumn8(stream8, composer8({ modelOn: true, mode: 'acceptEdits' })),
  { overlay: modelPop + modeTip }
)

// 34 Rewind: Esc Esc or the clock in the session bar; pick a prompt, choose what goes back
const rwRow = (time, text, changes, on = false) =>
  `<div class="rw8${on ? ' on' : ''}">${ic(on ? 'circle-dot' : 'circle', 14, on ? C.brand : C.ink3)}<div class="col min grow gap2"><span class="sm trunc">${text}</span><span class="xs muted">${time} · ${changes}</span></div></div>`
const rewindDlg = `<div class="scrim8"></div><div class="dlg8" style="width:560px;left:calc(50% - 280px + 120px);top:120px">
  <div class="between"><span class="row gap8">${ic('history', 16, C.ink2)}<span class="strong">Zurückspulen</span></span>${iconBtn('x', false, 14)}</div>
  <span class="sm muted">Bis vor welche Nachricht? Alles danach verschwindet aus diesem Chat.</span>
  <div class="col gap4">
    ${rwRow('vor 2 min', 'Jetzt noch der Fokusring in Markenfarbe.', '1 Datei geändert', true)}
    ${rwRow('vor 6 min', 'Mach den Header wie beim Homeserver und lass die Tests laufen.', '2 Dateien geändert')}
    ${rwRow('vor 24 min', 'Lies die Projekt-Notiz und fass die Marke zusammen.', 'keine Änderungen')}
  </div>
  <span class="strong sm">Was soll zurück?</span>
  <div class="col gap6">
    <div class="rwopt on">${ic('circle-dot', 14, C.brand)}<span class="sm strong">Gespräch und Code</span><span class="xs muted grow">tokens.css wie vor der Nachricht</span></div>
    <div class="rwopt">${ic('circle', 14, C.ink3)}<span class="sm strong">Nur Gespräch</span><span class="xs muted grow">Dateien bleiben, wie sie sind</span></div>
    <div class="rwopt">${ic('circle', 14, C.ink3)}<span class="sm strong">Nur Code</span><span class="xs muted grow">Chat bleibt, Dateien zurück</span></div>
  </div>
  <div class="warn8">${ic('triangle-alert', 13, C.warn)}<span class="xs">Was Befehle getan haben (git push, npm install), holt Zurückspulen nicht zurück.</span></div>
  <div class="row gap6" style="justify-content:flex-end">${sbtn('Abbrechen', '', 'ghost', 'Esc')}${sbtn('Zurückspulen', 'history', 'primary', 'Enter')}</div>
</div>`
const rewind8 = desktop8(
  '34 Zurückspulen · Gespräch und Code',
  chatColumn8(stream8Idle, composer8({})),
  {
    overlay: rewindDlg
  }
)

// 35 Context: the ring opens what fills it (like /context), and compacting is one button away
const CTX_WINDOW_K = 200
const CTX_FREE_K = 24
const CTX_8 = [
  ['System-Prompt', 3.1, C.ink3],
  ['Tools', 14.8, C.read],
  ['MCP-Tools', 9.2, C.outside],
  ['CLAUDE.md und Regeln', 4.6, C.change],
  ['Skills', 1.9, C.claude],
  ['Nachrichten', 142.4, C.brand]
]
const ctxBar = `<div class="cbar8">${CTX_8.map(([, v, c]) => `<span style="width:${(v / CTX_WINDOW_K) * 100}%;background:${c}"></span>`).join('')}<span class="cbuf8" style="width:${(CTX_FREE_K / CTX_WINDOW_K) * 100}%"></span></div>`
const loadedRow = (icon, color, name, size) =>
  `<div class="row gap6">${ic(icon, 12, color)}<span class="mono trunc grow">${name}</span><span class="muted">${size}</span></div>`
const ctxPop = `<div class="pop8" style="bottom:118px;right:340px;width:400px">
  <div class="between" style="padding:4px 8px"><span class="strong">Kontext</span><span class="sm" style="color:${C.warn}">176k von 200k · 88 %</span></div>
  <div style="padding:0 8px">${ctxBar}</div>
  <div class="col gap4" style="padding:4px 8px">${CTX_8.map(([n, v, c]) => `<div class="row gap8 sm">${dot(c, 8)}<span class="grow ink2">${n}</span><span class="mono xs">${v.toLocaleString('de')}k</span></div>`).join('')}
  <div class="row gap8 sm">${dot(C.line2, 8)}<span class="grow muted">frei</span><span class="mono xs">${CTX_FREE_K}k</span></div></div>
  ${menuGroup('Geladen')}
  <div class="col gap2 xs ink2" style="padding:0 8px">
    ${loadedRow('file-text', C.change, '~/.claude/CLAUDE.md', '1,8k')}
    ${loadedRow('file-text', C.change, 'nexron-chat/CLAUDE.md', '1,2k')}
    ${loadedRow('file-text', C.change, 'rules/vault/frontend · 19 Dateien', '1,6k')}
    ${loadedRow('wand-sparkles', C.claude, 'Skills · 42 Beschreibungen', '1,9k')}
  </div>
  <div class="cmp8"><span class="sm strong">Jetzt zusammenfassen</span><div class="ptext ph" style="font-size:13px;padding:6px 8px;border:1px solid ${C.line2};border-radius:8px">Worauf achten? z. B. „Entscheidungen zum Header behalten“</div><div class="row gap6" style="justify-content:flex-end">${sbtn('Zusammenfassen', 'archive', 'primary')}</div></div>
</div>`
const ctxWarn = `<div class="warn8">${ic('triangle-alert', 13, C.warn)}<span class="xs grow">Noch 9 % bis Claude den Verlauf von selbst zusammenfasst.</span><span class="link">Jetzt zusammenfassen</span></div>`
const context8 = desktop8(
  '35 Kontext · was ihn füllt, zusammenfassen',
  chatColumn8(stream8Idle, composer8({ ctx: 88, ctxOn: true }), ctxWarn),
  { overlay: ctxPop }
)

// 36 What goes wrong: retry countdown, a hook that blocked, and the approval in reading order
const retry8 = `<div class="retry8">${ic('refresh-cw', 14, C.warn)}<div class="col min grow"><span class="sm strong">Anthropic ist gerade überlastet</span><span class="xs muted">Neuer Versuch in 8 s · Versuch 2 von 10 · Fehler 529</span></div>${sbtn('Jetzt versuchen', 'refresh-cw')}</div>`
const hook8 = `<div class="hook8"><div class="row gap8">${ic('webhook', 14, C.crit)}<span class="sm"><span class="strong">PreToolUse-Hook</span> hat Bash blockiert</span><span class="grow"></span>${ic('chevron-down', 13, C.ink3)}</div><div class="mono xs ink2">git push --force ist in diesem Repo gesperrt (.claude/hooks/no-force.ps1)</div></div>`
const approval8 = `
<div class="appr c">
  <div class="row gap8">${ic('shield-alert', 15, C.crit)}<span class="strong sm">Freigabe nötig</span><span class="muted xs">Bash</span></div>
  <div class="mono xs codeinline">git push -u origin feat/bull-brand</div>
  <span class="muted xs">Pusht den Feature-Branch nach GitHub.</span>
  <div class="row gap6">${sbtn('Erlauben', 'check', 'primary', '1')}${sbtn('Immer für git push', 'check-check', 'ghost', '2')}${sbtn('Ablehnen', 'x', 'ghost', '3')}</div>
  <div class="deny8"><span class="sm grow">Nein, erst nach dem Review pushen.</span><span class="xs muted row gap4">${kbd('Enter')} ablehnen und Claude das sagen</span></div>
</div>`
const errors8 = desktop8(
  '36 Fehler, Hooks, Freigabe',
  chatColumn8(
    `
  ${userMessage('Push den Branch, aber nicht force.')}
  ${retry8}
  ${toolCard('change', 'Bash', 'npm run build', 'ok')}
  ${hook8}
  <div class="md"><p>Force-Push ist gesperrt, ich pushe normal.</p></div>
  ${approval8}`,
    composer8({})
  )
)

// 29 Board: the gaps
const GAP_STATE = {
  ok: ['da', C.good],
  part: ['teilweise', C.warn],
  no: ['fehlt', C.crit]
}
const gapPill = (s) =>
  `<span class="pill" style="color:${GAP_STATE[s][1]};background:${GAP_STATE[s][1]}1f;justify-self:start">${GAP_STATE[s][0]}</span>`
const gapRow = ([area, what, state, where]) =>
  `<div class="tr g8"><span class="muted">${area}</span><span>${what}</span>${gapPill(state)}<span class="ink2">${where}</span></div>`
const GAPS = [
  ['Eingabe', 'Slash-Befehle mit Vorschlägen, eigene Befehle, Skills', 'no', '31, M28'],
  ['Eingabe', '@ Dateien erwähnen', 'no', '32'],
  ['Eingabe', '! Befehl direkt ausführen, Ausgabe an Claude', 'no', '32b'],
  ['Eingabe', 'Modus wechseln (⇧Tab)', 'no', '33, M29'],
  ['Eingabe', 'Modell und Denktiefe wechseln (/model, /effort)', 'no', '33, M29'],
  ['Eingabe', 'Nachrichten tippen, während Claude arbeitet', 'part', '30: sichtbar und änderbar'],
  ['Eingabe', 'Großer eingefügter Text als „Pasted text · 42 Zeilen“', 'no', '30'],
  ['Eingabe', 'Frühere Prompts mit ↑ holen', 'no', 'nur Taste, keine eigene Fläche'],
  ['Läuft', 'Statuszeile mit Zeit und Tokens', 'part', '30: Tokens dazu'],
  ['Läuft', 'API-Fehler mit Countdown bis zum neuen Versuch', 'no', '36'],
  ['Läuft', 'Hooks: Ausgabe und „blockiert“', 'no', '36'],
  ['Läuft', 'Shell mit Ctrl B in den Hintergrund schieben', 'no', '30, Panel'],
  ['Ergebnis', 'Diff mit Zeilennummern, Kontext, +/− im Kopf', 'part', '30'],
  ['Ergebnis', 'Lange Ausgabe gekürzt („118 Zeilen davor“)', 'part', '30'],
  ['Ergebnis', 'Zusammenfassung „3 Dateien gelesen“', 'part', '30'],
  ['Steuern', 'Zurückspulen: Gespräch und/oder Code (Esc Esc)', 'no', '34, M30'],
  ['Steuern', 'Ablehnen und Claude sagen, was stattdessen', 'no', '36'],
  ['Überblick', 'Kontext aufgeschlüsselt (/context), selbst zusammenfassen', 'part', '35'],
  ['Überblick', 'Geladene CLAUDE.md, Regeln, Skills', 'no', '35'],
  ['Überblick', 'MCP: Anmeldung nötig, neu anmelden', 'part', '30, Panel'],
  ['Überblick', 'Gespräch exportieren (/export)', 'no', '31'],
  [
    'Schon da',
    'Freigabe, Frage, Plan, Todos, Denken, Subagents, Bilder, Konto, Limits, Terminal',
    'ok',
    'Fassung 2 bis 7'
  ]
]
const gapsBoard = frame(
  '29 Claude Code im Terminal · was Bull fehlt',
  1440,
  1100,
  `<div class="page pad">
  <div class="col gap4"><h1>Was das Terminal zeigt und Bull noch nicht</h1><span class="muted">Verglichen mit Claude Code im Terminal und dem Stand von <span class="mono">main</span> am 18.11.2026. Rechts steht, welcher Screen die Lücke schließt.</span></div>
  <div class="panel"><div class="tbl"><div class="tr g8 th"><span>Bereich</span><span>Im Terminal</span><span>Bull heute</span><span>Fassung 8</span></div>${GAPS.map(gapRow).join('')}</div></div>
  <span class="xs muted">Bewusst weggelassen: Vim-Modus, IDE-Anbindung, eigene Statuszeile per Skript, Output-Styles. In einem Fenster mit Panel braucht es das nicht, oder es steht dort schon.</span>
</div>`
)

// 29b Board: what in the current design does not make sense, and the fix
const uxRow = ([what, why, fix]) =>
  `<div class="tr u8"><span class="strong">${what}</span><span class="ink2">${why}</span><span>${fix}</span></div>`
const UX = [
  [
    'Chips für Modell und Modus',
    'Sie sehen klickbar aus, ändern aber nichts. Der Tooltip sagt nur „geht nicht“.',
    'Jeder Chip tut etwas: Modell und Denktiefe öffnen ein Menü, der Modus schaltet mit Klick oder ⇧Tab weiter.'
  ],
  [
    'Ordner dreimal',
    'Pfadleiste, Panel „Umgebung“ und Session-Zeile zeigen ihn alle.',
    'Die Leiste über dem Chat zeigt Rechner / Ordner / Branch. „Umgebung“ fällt weg, im Panel bleibt das Konto.'
  ],
  [
    '„Bash npm test“ zweimal',
    'Thinking-Bar und die Karte „Jetzt“ im Panel stehen nebeneinander und sagen dasselbe.',
    'Die Karte „Jetzt“ fällt weg. Das laufende Tool steht oben in der Panel-Liste, die Statuszeile zeigt Zeit und Tokens.'
  ],
  [
    'Daumen hoch, Daumen runter',
    'Bull kann das Feedback nirgends hinschicken. Im Code gibt es die Knöpfe auch nicht.',
    'Raus. Unter der Antwort stehen nur Kopieren und Dauer, Tokens, Modell.'
  ],
  [
    'Freigabe von rechts nach links',
    'Die Knöpfe zeigen 3 · 2 · 1. Gelesen wird von links, und Windows setzt die Hauptaktion nach links.',
    '1 · 2 · 3 von links: Erlauben, Immer, Ablehnen. Darunter ein Feld, um beim Ablehnen zu sagen, was stattdessen.'
  ],
  [
    'Hinweiszeile unter dem Eingabefeld',
    'Sie steht immer da und erklärt Enter, das jeder kennt.',
    'Fällt weg. Der Platzhalter nennt, was man nicht errät: / Befehle · @ Dateien · ! Shell.'
  ],
  [
    'Kontext-Ring nur mit Tooltip',
    '11 % sagt nicht, was den Platz füllt und was man tun kann.',
    'Klick öffnet die Aufteilung und „Jetzt zusammenfassen“. Ab 85 % wird der Ring gelb und über dem Eingabefeld steht ein Hinweis.'
  ],
  [
    'Getippte Nachricht während eines Turns',
    'Sie verschwindet in einer unsichtbaren Warteschlange.',
    'Sie steht nummeriert über dem Eingabefeld, mit Bearbeiten und Entfernen.'
  ],
  [
    'Drei Tool-Karten für drei Read',
    'Sie schieben die Antwort aus dem Bild.',
    'Lesen und Suchen werden zu einer Zeile „3 Dateien gelesen, 1 Suche“. Was etwas ändert, bleibt eine eigene Karte.'
  ]
]
const uxBoard = frame(
  '29b UX · was am Design keinen Sinn ergab',
  1440,
  900,
  `<div class="page pad">
  <div class="col gap4"><h1>Was am Design keinen Sinn ergab</h1><span class="muted">Durchgesehen auf 10, 11, 21 und 03 Mobile. Jede Korrektur steckt in den Screens 30 bis 36.</span></div>
  <div class="panel"><div class="tbl"><div class="tr u8 th"><span>Was</span><span>Warum es stört</span><span>Fassung 8</span></div>${UX.map(uxRow).join('')}</div></div>
</div>`
)

// Phone
const mSlash = mScreen(
  'M28 Slash-Befehle',
  chatTop('working', 'Bull-Brand: Header'),
  `${userMessage('Mach den Header wie beim Homeserver.')}${toolGroup8('3 Dateien gelesen, 1 Suche')}`,
  '',
  sheet(
    '/ Befehle',
    `<div class="col gap2">${[
      ['/compact', 'Verlauf zusammenfassen'],
      ['/context', 'Was den Kontext belegt'],
      ['/model', 'Modell und Denktiefe'],
      ['/rewind', 'Zurückspulen'],
      ['/clear', 'Neu anfangen'],
      ['/commit', 'Eigener Befehl'],
      ['/code-review', 'Skill']
    ]
      .map(
        ([c, t], i) =>
          `<div class="mi8${i === 0 ? ' on' : ''}"><span class="mono sm strong" style="width:110px">${c}</span><span class="sm ink2 trunc grow">${t}</span></div>`
      )
      .join('')}</div>`
  )
)
const mModel = mScreen(
  'M29 Modell, Denktiefe, Modus',
  chatTop('working', 'Bull-Brand: Header'),
  `${userMessage('Mach den Header wie beim Homeserver.')}`,
  '',
  sheet(
    'Dieser Chat',
    `<div class="col gap8">
    <span class="xs muted">Modell</span>
    <div class="seg full">${['Opus', 'Sonnet', 'Haiku'].map((m) => `<span class="row gap4${m === 'Opus' ? ' on' : ''}" style="justify-content:center">${clawd(9)}${m}</span>`).join('')}</div>
    <span class="xs muted">Denktiefe</span>
    ${effortSeg8('seg full')}
    <span class="xs muted">Modus</span>
    <div class="col gap2">${Object.entries(MODES_8)
      .map(
        ([k, [i, t, c]]) =>
          `<div class="mi8${k === 'acceptEdits' ? ' on' : ''}">${ic(i, 14, c)}<span class="sm grow">${t}</span>${k === 'acceptEdits' ? ic('check', 14, C.brand) : ''}</div>`
      )
      .join('')}</div>
    <span class="xs muted">Gilt ab der nächsten Nachricht.</span></div>`
  )
)
const mRewind = mScreen(
  'M30 Zurückspulen',
  chatTop('done', 'Bull-Brand: Header'),
  `${userMessage('Jetzt noch der Fokusring in Markenfarbe.')}`,
  '',
  sheet(
    'Zurückspulen',
    `<div class="col gap8">
    <div class="col gap4">
      ${rwRow('vor 2 min', 'Jetzt noch der Fokusring …', '1 Datei', true)}
      ${rwRow('vor 6 min', 'Mach den Header wie beim …', '2 Dateien')}
    </div>
    <div class="seg full">${['Beides', 'Gespräch', 'Code'].map((m) => `<span${m === 'Beides' ? ' class="on"' : ''}>${m}</span>`).join('')}</div>
    <div class="warn8">${ic('triangle-alert', 13, C.warn)}<span class="xs">Befehle wie git push holt das nicht zurück.</span></div>
    <span class="btn btn-primary" style="justify-content:center">${ic('history', 15, '#fff')}Zurückspulen</span></div>`
  )
)

const cssR8 = `
.tgroup8{display:flex;align-items:center;gap:8px;font-size:13px;color:${C.ink3};padding:2px 2px}
.out8{border-top:1px solid ${C.line};padding:8px 12px;display:flex;flex-direction:column;gap:2px;color:${C.ink2}}
.more8{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${C.ink3};margin-bottom:4px}
.queue8{display:flex;flex-direction:column;gap:6px}
.ctxon{outline:1px solid ${C.brand};border-radius:99px;padding:3px 7px}
.pinput.shell8{border-color:${C.outside}}
.shellb{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${C.outside};background:${C.outside}1f;border-radius:6px;padding:2px 6px}
.caret{width:2px;height:16px;background:${C.ink};display:inline-block}
.sh8{border:1px solid ${C.outside}55;border-radius:10px;padding:8px 12px;display:flex;flex-direction:column;gap:6px;background:${C.card}}
.ment8{background:${C.brand}26;color:${C.brandL};border-radius:5px;padding:0 4px;font-family:'Geist Mono',monospace;font-size:13px}
.pop8{position:absolute;background:${C.s2};border:1px solid ${C.line2};border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:4px;box-shadow:0 12px 32px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.4);z-index:6}
.mg8{font-size:11px;color:${C.ink3};padding:8px 8px 2px;text-transform:uppercase;letter-spacing:.4px}
.mi8{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px}
.mi8.on{background:${C.s3}}
.hl8{color:${C.brandL};background:${C.brand}26;border-radius:3px;padding:0 1px}
.mf8{font-size:11px;color:${C.ink3};padding:8px 8px 2px;border-top:1px solid ${C.line};margin-top:4px;display:flex;align-items:center;gap:4px}
.tag8{font-size:10px;color:${C.ink3};border:1px solid ${C.line2};border-radius:5px;padding:0 5px}
.eff8{margin:2px 8px 4px}
.tip8{position:absolute;width:300px;background:${C.s2};border:1px solid ${C.line2};border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;box-shadow:0 12px 32px rgba(0,0,0,.5);z-index:6}
.scrim8{position:absolute;inset:0;background:rgba(0,0,0,.55);z-index:5}
.dlg8{position:absolute;background:${C.s2};border:1px solid ${C.line2};border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 24px 48px rgba(0,0,0,.55);z-index:6}
.rw8,.rwopt{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;border:1px solid ${C.line2}}
.rw8.on,.rwopt.on{border-color:${C.brand};background:${C.brand}12}
.warn8{display:flex;align-items:center;gap:8px;border:1px solid ${C.warn}55;background:${C.warn}12;border-radius:9px;padding:6px 10px}
.cbar8{display:flex;height:10px;border-radius:99px;overflow:hidden;background:${C.s3};gap:1px}
.cbuf8{background:repeating-linear-gradient(45deg,${C.line2} 0 3px,transparent 3px 6px)}
.cmp8{display:flex;flex-direction:column;gap:6px;border-top:1px solid ${C.line};padding:8px 8px 0;margin-top:4px}
.retry8{display:flex;align-items:center;gap:10px;border:1px solid ${C.warn}55;background:${C.warn}12;border-radius:12px;padding:8px 10px 8px 12px}
.hook8{display:flex;flex-direction:column;gap:6px;border-left:2px solid ${C.crit};padding:4px 0 4px 12px}
.deny8{display:flex;align-items:center;gap:10px;border:1px solid ${C.brand};border-radius:8px;padding:6px 10px;background:${C.card}}
.tr.g8{grid-template-columns:110px 1fr 100px 220px;align-items:center;padding:7px 0}
.tr.u8{grid-template-columns:230px 1fr 1.2fr;align-items:start}
`

const r8Desktop = [
  gapsBoard,
  uxBoard,
  chat8,
  slash8,
  slashSearch8,
  at8,
  shell8,
  model8,
  rewind8,
  context8,
  errors8
]
const r8Mobile = [mSlash, mModel, mRewind]
const r8Css = `${css}${css5}${cssBuilt}${cssR6}${cssR7}${cssR8}`
writeFileSync(
  new URL('bull-r8.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 8</title><style>${r8Css}</style></head><body>${r8Desktop.join('')}</body></html>`
)
writeFileSync(
  new URL('bull-r8-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 8 Mobile</title><style>${r8Css}</style></head><body>${r8Mobile.join('')}</body></html>`
)
console.log('round 8 missing icons:', [...missing].join(', ') || 'none')

// ---------- Built state after round 8 (18.11.2026) ----------
// Every frame whose markup the built code changed, to replace in Figma at its place (requested:
// "alles nachziehen"). html_to_figma takes at most 20 frames per call, hence two desktop files.
const frameName = (html) => {
  const match = /data-name="([^"]+)"/.exec(html)
  if (!match) throw new Error(`frame without data-name: ${html.slice(0, 80)}`)
  return match[1]
}
const frameId = (html) => frameName(html).split(' ')[0]
const latestById = (lists) => new Map(lists.flat().map((html) => [frameId(html), html]))
const SYNC_DESKTOP_IDS = [
  '10',
  '11',
  '14',
  '17',
  '19',
  '19c',
  '20',
  '20b',
  '21',
  '23b',
  '24',
  '24b',
  '25',
  '26',
  '27',
  '30',
  '31',
  '31b',
  '32',
  '33',
  '34',
  '35',
  '36'
]
const SYNC_MOBILE_IDS = [
  'M04',
  'M05',
  'M06',
  'M07',
  'M08',
  'M09',
  'M11',
  'M12',
  'M21',
  'M25',
  'M26'
]
const desktopById = latestById([builtDesktop, r6Desktop, r7Desktop, r8Desktop])
const mobileById = latestById([builtMobile, r6Mobile, r7Mobile, r8Mobile])
const frameOf = (byId, id) => {
  const html = byId.get(id)
  if (!html) throw new Error(`no frame ${id} to sync`)
  return html
}
const syncDesktop = SYNC_DESKTOP_IDS.map((id) => frameOf(desktopById, id))
const syncMobile = [...SYNC_MOBILE_IDS.map((id) => frameOf(mobileById, id)), skeletonFrame]
const syncPage = (title, frames) =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title><style>${r8Css}</style></head><body>${frames.join('')}</body></html>`
writeFileSync(
  new URL('bull-built-r8-a.html', OUT),
  syncPage('Bull gebaut a', syncDesktop.slice(0, 12))
)
writeFileSync(
  new URL('bull-built-r8-b.html', OUT),
  syncPage('Bull gebaut b', syncDesktop.slice(12))
)
writeFileSync(new URL('bull-built-r8-mobile.html', OUT), syncPage('Bull gebaut Mobile', syncMobile))

// ================= Round 9: callouts in Claude's answers =================
// Claude writes Obsidian callouts (`> [!question] …`); Bull lays each part on a light tint of its
// colour, so it is clear which text belongs to it (19.11.2026). No coloured bar on the left.
// The question has the strongest tint. Links carry the brand colour with a hover state.
const LIGHT_9 = {
  bg: '#f7f6f3',
  line2: '#cfcec7',
  ink: '#1b1b1a',
  ink2: '#43423c',
  ink3: '#66655d',
  warn: '#8d5c00',
  crit: '#c53030',
  brandText: '#3a64e0',
  outside: '#0b7585',
  // Brand text on light uses brand-strong, as "Neue Session" does.
  link: C.brandS,
  hover: C.brandD
}
const DARK_9 = {
  bg: C.app,
  line2: C.line2,
  ink: C.ink,
  ink2: C.ink2,
  ink3: C.ink3,
  warn: C.warn,
  crit: C.crit,
  brandText: C.brandL,
  outside: C.outside,
  // #4d7cff on the dark app is 4.9:1.
  link: C.brand,
  hover: '#8fb0ff'
}

// Order = order at the end of an answer; the question comes last, right above the input.
const CALLOUT_9 = {
  warning: { label: 'Achtung', icon: 'triangle-alert', color: (P) => P.crit },
  preview: { label: 'So siehst du es', icon: 'eye', color: (P) => P.outside },
  todo: { label: 'Offen', icon: 'circle-dashed', color: (P) => P.ink2 },
  tip: { label: 'Vorschlag', icon: 'lightbulb', color: (P) => P.brandText },
  question: { label: 'Braucht dich', icon: 'message-circle-question', color: (P) => P.warn }
}
STATUS.question = { icon: 'message-circle-question', color: C.warn, label: 'Frage' }

// Text links are plain underlined spans: html_to_figma overlaps inline chips with padding or a
// background with the following text when the line wraps, so there are no code chips either.
const link9 = (P, text, hover = false) =>
  hover
    ? `<span class="lnk9" style="color:${P.hover};text-decoration-color:${P.hover};background:${P.link}1f">${text}</span>`
    : `<span class="lnk9" style="color:${P.link};text-decoration-color:${P.link}66">${text}</span>`
// Outlined, not filled: a filled primary button would outshine the question.
const btn9 = (P, label, icon) =>
  `<span class="cobtn9" style="border:1px solid ${P.line2};color:${P.ink2}">${ic(icon, 13, P.ink2)}${label}</span>`

// One example answer, so board, chat and phone tell the same story.
const TEXT_9 = {
  warning: () => 'build.mjs hatte einen Konflikt. Ich habe die Fassung aus main behalten.',
  preview: (P) =>
    `${link9(P, 'localhost:1460/overview')} · Die zwei Design-Sessions sind aus „Fertig heute“ verschwunden.`,
  todo: (P) =>
    `<ul style="padding-left:18px;display:flex;flex-direction:column;gap:2px"><li>${link9(P, 'Figma')} zeigt noch Fassung 7.</li><li>agentd auf nexron-server nicht neu verteilt.</li></ul>`,
  tip: () => 'Soll ich preview jetzt neu bauen? Dauert etwa eine Minute.',
  question: () =>
    'Woran erkennst du, dass ein Worktree noch gebraucht wird? Dann räume ich nächstes Mal ohne Nachfrage auf.'
}
const ACTIONS_9 = {
  tip: (P) => `${btn9(P, 'Ja, mach das', 'check')}${btn9(P, 'Nein', 'x')}`,
  question: (P) => btn9(P, 'Antworten', 'reply')
}
const callout9 = (P, type) => {
  const t = CALLOUT_9[type]
  const color = t.color(P)
  const actions = ACTIONS_9[type]?.(P) ?? ''
  return `<div class="tint9" style="background:${color}${type === 'question' ? '24' : '12'}">
  <div class="coh9" style="color:${color}">${ic(t.icon, 14, color)}<span>${t.label}</span></div>
  <div class="cob9" style="color:${P.ink}">${TEXT_9[type](P)}</div>
  ${actions ? `<div class="coa9">${actions}</div>` : ''}
</div>`
}
// The end of one turn: first sentence, folded details, then the callouts.
const answer9 = (
  P
) => `<div class="col" style="gap:12px;font-size:15px;line-height:1.6;color:${P.ink};max-width:680px">
  <p><b>Du wolltest die alten Design-Branches aufräumen.</b> Zwei sind gemergt (${link9(P, 'PR #41')}, ${link9(P, 'PR #42')}), ihre Worktrees sind weg.</p>
  <div class="row gap8 sm" style="border-radius:10px;background:${P.ink3}14;color:${P.ink2};padding:8px 12px">${ic('chevron-right', 14, P.ink3)}<span style="font-weight:600">Einzelheiten</span><span class="xs" style="color:${P.ink3}">3 Punkte</span></div>
  ${Object.keys(CALLOUT_9)
    .map((type) => callout9(P, type))
    .join('')}
</div>`

// 37d Board: the answer in both themes, plus the two link states
const linkStates9 = (P) => `<div class="col gap8">
  <span class="xs" style="color:${P.ink3}">Links</span>
  <div class="row" style="gap:28px;font-size:15px">
    <span class="col gap4"><span class="xs" style="color:${P.ink3}">Normal</span>${link9(P, 'localhost:1460')}</span>
    <span class="col gap4"><span class="xs" style="color:${P.ink3}">Hover</span>${link9(P, 'localhost:1460', true)}</span>
  </div>
</div>`
const themeColumn9 = (P, title) => `<div class="col themecol9" style="background:${P.bg}">
  <span class="strong" style="color:${P.ink};font-size:16px">${title}</span>
  ${answer9(P)}
  ${linkStates9(P)}
</div>`
const board9 = frame(
  '37d Hinweis-Kästen · leicht getönt, Links in Markenfarbe',
  1440,
  940,
  `<div class="page pad">
  <div class="col gap4"><h1>Leicht getönt, Links in Markenfarbe</h1><span class="muted">Jeder Teil liegt auf einem Hauch seiner Farbe, so sieht man, welcher Text dazugehört. Die Frage ist am stärksten getönt. Links sind blau und unterstrichen, beim Hover heller mit Fläche.</span></div>
  <div class="row" style="gap:32px;align-items:flex-start">${themeColumn9(DARK_9, 'Dunkel')}${themeColumn9(LIGHT_9, 'Hell')}</div>
</div>`
)

// Sidebar: the session with an open question waits under "Braucht dich", like an approval.
const APPROVAL_ROW_9 = agentRow5(
  'approval',
  'Bull-Brand: Figma-Design',
  'nexron-chat',
  'work',
  '24 min',
  'Bash · git push -u origin',
  { on: true, agents: 1 }
)
const QUESTION_ROW_9 = agentRow5(
  'question',
  'Design-Branches aufräumen',
  'nexron-chat',
  'work',
  'gerade',
  'Frage: Woran erkennst du …',
  { on: true }
)

// Panel: every "Offen" item of this chat in one list, ticked off by hand.
const openItem9 = (text, from, done = false) =>
  `<div class="row gap8 openi9${done ? ' done' : ''}">${ic(done ? 'circle-check' : 'circle-dashed', 14, done ? C.good : C.ink3)}<span class="sm grow">${text}</span><span class="xs muted nowrap">${from}</span></div>`
const OPEN_PANEL_9 = `<div class="rsect"><div class="between"><span class="rtitle">Offen</span><span class="xs muted">2 von 3</span></div>
  <div class="col gap4">
    ${openItem9('Figma zeigt noch Fassung 7', '14:32')}
    ${openItem9('agentd auf nexron-server verteilen', '14:32')}
    ${openItem9('Light Mode prüfen', '13:05', true)}
  </div>
  <span class="link">Zur Antwort springen ${ic('chevron-right', 12, C.ink3)}</span>
</div>`
const ACTIVITY_SECTION_9 = '<div class="rsect"><div class="between"><span class="rtitle">Aktivität'

const desktop9 = (name, main, opts = {}) =>
  desktop8(name, main, opts)
    .replace(APPROVAL_ROW_9, QUESTION_ROW_9)
    .replace(ACTIVITY_SECTION_9, `${OPEN_PANEL_9}${ACTIVITY_SECTION_9}`)

// 38b The answer in the chat, session under "Braucht dich", open items in the panel
const chat9 = desktop9(
  '38b Chat · leicht getönt',
  chatColumn8(
    `${userMessage('Räum die alten Design-Worktrees auf und merge, was fertig ist.')}${toolGroup8('4 Branches geprüft, 2 Worktrees entfernt')}${answer9(DARK_9)}${turnFoot8('Gearbeitet 3:08 min · 21,4k Tokens · Opus 5.5')}`,
    composer8({})
  )
)

// M31 Phone: the question sits right above the input
const mChat9 = mScreen(
  'M31 Antwort, leicht getönt',
  chatTop('question', 'Design-Branches aufräumen'),
  `${userMessage('Räum die alten Design-Worktrees auf.')}${answer9(DARK_9)}`,
  mComposer()
)

const cssR9 = `
.chat,.stream,.mstream{min-height:0}.stream>*,.mstream>*{flex:none}.mstream{justify-content:flex-end}
.themecol9{flex:1;min-width:0;gap:20px;border-radius:16px;padding:28px}
.tint9{display:flex;flex-direction:column;gap:6px;border-radius:10px;padding:10px 12px}
.coh9{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:.2px}
.cob9{font-size:14px;line-height:1.55}
.coa9{display:flex;gap:8px;padding-top:2px}
.cobtn9{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;border-radius:7px;padding:4px 10px}
.lnk9{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;border-radius:3px}
.openi9{padding:4px 2px}
.openi9.done span.sm{text-decoration:line-through;color:${C.ink3}}
`

const r9Css = `${r8Css}${cssR9}`
writeFileSync(
  new URL('bull-r9.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 9</title><style>${r9Css}</style></head><body>${board9}${chat9}</body></html>`
)
writeFileSync(
  new URL('bull-r9-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Fassung 9 Mobile</title><style>${r9Css}</style></head><body>${mChat9}</body></html>`
)
console.log('round 9 missing icons:', [...missing].join(', ') || 'none')

// ================= Info panel: empty states (20.11.2026) =================
// User request: an idle chat's panel "looks sad and empty" (three grey lines, then a void). Every section
// keeps its place and gets a small empty state (tile, title, one line on what happens next); the
// height that is left goes to one calm hint at the bottom that names what can still appear.
// Out: out/bull-panel-empty.html and bull-panel-empty-mobile.html. No Clawd here: he belongs to the chat.

// Dark hex → light token, for the light copies (same names as `:root` in tokens.css).
const LIGHT_HEX_10 = {
  [C.app]: '#f7f6f3',
  [C.card]: '#ffffff',
  [C.s2]: '#edece8',
  [C.s3]: '#e4e3de',
  [C.line]: '#e3e2dd',
  [C.line2]: '#cfcec7',
  [C.ink]: '#1b1b1a',
  [C.ink2]: '#43423c',
  [C.ink3]: '#66655d',
  [C.crit]: '#c53030',
  [C.warn]: '#8d5c00',
  [C.good]: '#157a15',
  [C.read]: '#4f6b93',
  [C.change]: '#6352c8',
  [C.outside]: '#0b7585',
  '#141415': '#f1f0ec'
}
const DARK_HEX_10 = Object.keys(LIGHT_HEX_10)
const toLight10 = (text) =>
  text.replace(new RegExp(DARK_HEX_10.join('|'), 'gi'), (hex) => LIGHT_HEX_10[hex.toLowerCase()])
const hasDarkHex10 = (text) => DARK_HEX_10.some((hex) => text.toLowerCase().includes(hex))
// Every rule that carries a dark colour, repeated under `.lt` in light colours.
const lightCss10 = (sheet) =>
  sheet
    .split('}')
    .filter(hasDarkHex10)
    .map((rule) => {
      const [selector, body] = rule.split('{')
      if (!body || selector.includes('@')) return ''
      const scoped = selector
        .split(',')
        .map((part) => `.lt ${part.trim()}`)
        .join(',')
      return `${scoped}{${toLight10(body)}}`
    })
    .join('')

// One empty section: small tile, short title, one line on what happens next, maybe an action.
const panelEmpty10 = (icon, title, hint, action = '') =>
  `<div class="pe10"><span class="tile pt10" style="width:32px;height:32px;background:${C.s2}">${ic(icon, 15, C.ink3)}</span><div class="col gap2 min grow"><span class="pe10t">${title}</span><span class="pe10h">${hint}</span>${action}</div></div>`
const panelLink10 = (label) =>
  `<span class="link pl10">${label}${ic('chevron-right', 12, C.ink3)}</span>`
const panelButton10 = (label, icon) => `<span class="pb10">${ic(icon, 13, C.ink2)}${label}</span>`

// Ghost rows: what the list will look like, before the first tool ran.
const ghostRows10 = (shimmer = false) =>
  `<div class="ghost10">${[
    ['Read', 70, 0.7],
    ['Edit', 52, 0.45],
    ['Bash', 62, 0.25]
  ]
    .map(
      ([tool, w, o], i) =>
        `<div class="gr10" style="opacity:${o}">${toolIcon(tool, 13)}<span class="gb10${shimmer && i === 0 ? ' shim10' : ''}" style="width:${w}%"></span><span class="gb10" style="width:22px;margin-left:auto"></span></div>`
    )
    .join('')}</div>`

const sectionHead10 = (title, aside = '') =>
  `<div class="between"><span class="rtitle">${title}</span>${aside}</div>`
const RESTING_10 = `<span class="xs muted row gap4">${ic('moon', 12, C.ink3)}ruht</span>`
const LIVE_10 = `<span class="livedot">${dot(C.warn, 6)}live</span>`

const ACTIVITY_10 = {
  fresh: () => `<div class="rsect">${sectionHead10('Aktivität')}
    ${ghostRows10()}
    ${panelEmpty10('list-tree', 'Noch nichts gelaufen', 'Liest, sucht oder ändert Claude etwas, steht jeder Schritt hier.')}
  </div>`,
  thinking: () => `<div class="rsect">${sectionHead10('Aktivität', LIVE_10)}
    ${ghostRows10(true)}
    ${panelEmpty10('sparkles', 'Claude überlegt noch', 'Der erste Schritt erscheint hier, sobald Claude ein Tool aufruft.')}
  </div>`,
  // The user's case: the last turn was only an answer. Says so in words instead of "0 Tools".
  answered: () => `<div class="rsect">${sectionHead10('Aktivität', RESTING_10)}
    <div class="sum10"><span class="tile pt10" style="width:32px;height:32px;background:${C.good}1f">${ic('message-square-text', 15, C.good)}</span><div class="col gap2 min grow"><span class="pe10t">Nur geantwortet, ohne Tools</span><span class="pe10h">Letzter Turn um 14:32, 0:03 min</span></div></div>
    <span class="pe10h">Arbeitet Claude wieder, steht hier jeder Schritt.</span>
  </div>`,
  running:
    () => `<div class="rsect">${sectionHead10('Aktivität', `<span class="xs muted row gap8">3 Tools${LIVE_10}</span>`)}
    <div class="col gap2">
      ${recentTool('Edit', 'src/views/ChatView.vue', '0:04', 'run')}
      ${recentTool('Read', 'SiteHeader.vue', '0:01')}
      ${recentTool('Grep', '"BrandBullLogo"', '0:01')}
    </div>
    <span class="link">Alle 3 im Chat zeigen ${ic('chevron-right', 12, C.ink3)}</span>
  </div>`
}
const SUBAGENTS_10 = `<div class="rsect">${sectionHead10('Subagents')}
  ${panelEmpty10('bot', 'Noch keine Subagents', 'Gibt Claude Teilaufgaben ab, siehst du die Helfer hier live.')}
</div>`
const CONNECTORS_10 = {
  resting: () => `<div class="rsect">${sectionHead10('Konnektoren')}
    ${panelEmpty10('plug', 'Kommen mit dem Start', 'Claude meldet seine Konnektoren, sobald die Session wieder läuft.', panelButton10('Jetzt starten', 'play'))}
  </div>`,
  none: () => `<div class="rsect">${sectionHead10('Konnektoren')}
    ${panelEmpty10('unplug', 'Keine Konnektoren', 'Dieses Konto hat keine MCP-Server.', panelLink10('Im Terminal einrichten'))}
  </div>`,
  connected:
    () => `<div class="rsect">${sectionHead10('Konnektoren', '<span class="xs muted">3 verbunden</span>')}
    <div class="row gap12 wrap sm">${['Figma', 'Obsidian', 'Google Kalender'].map((n) => `<span class="row gap4">${ic('plug', 13, C.ink3)}${n}</span>`).join('')}</div>
  </div>`,
  starting: () => `<div class="rsect">${sectionHead10('Konnektoren')}
    <div class="col gap8">${sk('100%', 14)}${sk('82%', 14)}${sk('64%', 14)}</div>
  </div>`
}

// The calm bottom: what can still turn up in this panel. An item leaves once its section is there;
// the whole hint leaves once the sections need the height.
const GUIDE_ITEMS_10 = {
  open: ['list-checks', 'Offen', 'Punkte aus Claudes Antworten zum Abhaken'],
  shells: [
    'square-terminal',
    'Im Hintergrund',
    'Laufende Shells wie <span class="mono">npm run dev</span>'
  ],
  approval: ['shield-alert', 'Freigaben', 'Wartet Claude auf dich, steht es oben in Aktivität']
}
const guide10 = (keys = ['open', 'shells', 'approval']) => `<div class="guide10">
  <div class="dots10"></div><div class="fade10"></div>
  <div class="col gap12" style="position:relative">
    <span class="xs muted">Erscheint hier, wenn es so weit ist</span>
    ${keys
      .map((k) => {
        const [icon, title, hint] = GUIDE_ITEMS_10[k]
        return `<div class="gi10"><span class="tile pt10" style="width:26px;height:26px;background:${C.s2}">${ic(icon, 13, C.ink3)}</span><div class="col min"><span class="gi10t">${title}</span><span class="gi10h">${hint}</span></div></div>`
      })
      .join('')}
    <span class="gfoot10">${kbd('Ctrl .')}blendet das Panel aus</span>
  </div>
</div>`

const accountRow10 = (acc = 'work') =>
  `<div class="rsect"><div class="kv">${ic('user', 14, C.ink3)}<span>Konto</span><span class="grow"></span>${accChip(acc)}<span class="swap">${ic('arrow-left-right', 12, C.ink2)}Wechseln</span></div></div>`
const panel10 = (activity, connectors, guideKeys, acc) => `
<aside class="right r5 p10">
  ${accountRow10(acc)}
  ${ACTIVITY_10[activity]()}
  ${SUBAGENTS_10}
  ${CONNECTORS_10[connectors]()}
  ${guideKeys ? guide10(guideKeys) : ''}
</aside>`

// A light frame: colours swapped in the markup, the shared rules repeated under `.lt`.
const asLight10 = (html) =>
  toLight10(html)
    .replace(/(<section class="frame"[^>]*style=")/, '$1background:#f7f6f3;')
    .replace(/(<section class="frame"[^>]*>)/, '$1<div class="lt" style="height:100%">')
    .replace(/<\/section>$/, '</div></section>')

const FRESH_TAB_10 = `<span class="tab on">${ic('circle', 14, C.ink3)}<span>Neuer Chat</span>${ic('x', 13, C.ink3)}<span class="tabbar"></span></span><span class="tabadd">`
const desktop10 = (name, main, panel, opts = {}) => {
  const top = opts.freshTab
    ? topbar5(-1, 'chat').replace('<span class="tabadd">', FRESH_TAB_10)
    : topbar5(opts.tab ?? 0, 'chat')
  const html = frame(
    name,
    1440,
    900,
    `<div class="shell">${sidebar5({ sel: opts.sel || 'none' })}<div class="mainw">${top}<div class="body"><div class="col grow min">${sessionBar8(opts.bar)}${main}</div>${panel}</div></div></div>`
  )
  return opts.light ? asLight10(html) : html
}

// The user's case: a resting chat whose last turn was a quick answer.
const restingChat10 = chatColumn8(
  `${userMessage('Welche Blender-Version brauchen die Shot-Skripte?')}<div class="md"><p>Blender 4.2 oder neuer. Die Skripte nutzen die Compositor-Knoten, die es erst ab 4.2 gibt.</p></div>${turnFoot8('Gearbeitet 0:03 min · 1,2k Tokens · Opus 5.5')}${systemMessage('moon', 'Session beendet. Deine nächste Nachricht setzt sie fort.')}`,
  composer8({})
)
const RESTING_BAR_10 = { folder: 'reels', branch: 'main' }
const RESTING_PANEL_10 = panel10('answered', 'resting', ['open', 'shells', 'approval'], 'own')
const resting10 = desktop10('42 Info-Panel · Session ruht', restingChat10, RESTING_PANEL_10, {
  tab: 3,
  bar: RESTING_BAR_10
})
const restingLight10 = desktop10(
  '42b Info-Panel · Session ruht · hell',
  restingChat10,
  RESTING_PANEL_10,
  { tab: 3, bar: RESTING_BAR_10, light: true }
)
const freshChat10 = `<div class="chat"><div class="stream emptyc">
  ${clawdEmpty('Clawd wartet auf die erste Anfrage', 'Neue Session auf Dieser PC in nexron-chat. Tippen, Enter, fertig.', '', '', 340)}
  ${suggestions()}
</div><div class="inputwrap col gap8">${composer8({})}</div></div>`
const fresh10 = desktop10(
  '42c Info-Panel · neuer Chat',
  freshChat10,
  panel10('fresh', 'connected', ['open', 'shells', 'approval']),
  { freshTab: true, bar: { branch: 'main' } }
)
const runningChat10 = chatColumn8(
  `${userMessage('Mach den Header wie beim Homeserver.')}${toolGroup8('1 Datei gelesen, 1 Suche')}`,
  composer8({}),
  statusLine8('Ändert ChatView.vue …', '0:18', '1,4k')
)
const running10 = desktop10(
  '42d Info-Panel · läuft, ohne Subagents und Konnektoren',
  runningChat10,
  panel10('running', 'none', ['open', 'shells']),
  { tab: 1, bar: { folder: 'nexron-chat', branch: 'feat/pwa' } }
)

// 42e Board: every empty state of the panel, dark and light.
const stateCard10 = (when, inner) =>
  `<div class="col gap8"><span class="xs muted">${when}</span><div class="pp10">${inner}</div></div>`
const themeBlock10 = (label) => `<div class="tb10">
  <span class="strong">${label}</span>
  <div class="row" style="gap:24px;align-items:flex-start">
    <div class="col w10" style="gap:20px">
      ${stateCard10('Neuer Chat, noch kein Tool', ACTIVITY_10.fresh())}
      ${stateCard10('Turn läuft, erstes Tool kommt gleich', ACTIVITY_10.thinking())}
      ${stateCard10('Turn vorbei, nur geantwortet', ACTIVITY_10.answered())}
    </div>
    <div class="col w10" style="gap:20px">
      ${stateCard10('Keine Subagents', SUBAGENTS_10)}
      ${stateCard10('Session ruht (wiederhergestellt oder beendet)', CONNECTORS_10.resting())}
      ${stateCard10('Claude läuft, Konto ohne MCP-Server', CONNECTORS_10.none())}
      ${stateCard10('Claude startet (wie gebaut)', CONNECTORS_10.starting())}
    </div>
    <div class="col w10" style="gap:20px">
      ${stateCard10('Unten im Panel, im Rest der Höhe', guide10())}
    </div>
  </div>
</div>`
const RULES_10 = [
  ['layout-list', 'Abschnitte bleiben stehen, auch leer. So springt nichts, wenn Claude loslegt.'],
  [
    'square-dashed',
    'Leer heißt: Kachel, kurzer Titel, eine Zeile, was als Nächstes passiert. Klein und links bündig, nicht mittig wie eine Seite.'
  ],
  [
    'list-tree',
    'Aktivität zeigt vor dem ersten Tool Geisterzeilen, damit klar ist, was hier entsteht. Läuft der Turn, schimmert die erste.'
  ],
  [
    'message-square-text',
    '„Letzter Turn: 0 Tools“ wird zu „Nur geantwortet, ohne Tools“ mit Uhrzeit und Dauer.'
  ],
  [
    'play',
    '„Jetzt starten“ weckt Claude ohne Nachricht, danach melden sich die Konnektoren. Weiterschreiben startet ihn genauso.'
  ],
  [
    'panel-bottom',
    'Der Rest der Höhe gehört dem Hinweis unten. Er nennt nur, was noch fehlt, und geht, sobald die Abschnitte den Platz brauchen.'
  ],
  ['bot-off', 'Kein Clawd im Panel: Er gehört dem Chat, sonst stünden zwei nebeneinander.']
]
const boardMain10 = `<div class="board10">
  <div class="col gap4"><h1>Info-Panel · leere Zustände</h1><span class="muted" style="max-width:900px">Bisher: drei graue Zeilen, darunter nichts. Jetzt sagt jeder Abschnitt, was hier entsteht und was als Nächstes passiert, und der Rest der Höhe zeigt ruhig, was noch auftauchen kann.</span></div>
  <div class="row" style="gap:32px;align-items:flex-start">
    <div class="col gap12 rules10">${RULES_10.map(([icon, text]) => `<div class="row" style="gap:10px;align-items:flex-start">${tile(icon, C.ink2, 30, C.s2)}<span class="sm ink2">${text}</span></div>`).join('')}</div>
    <div class="col grow" style="gap:24px">
      ${themeBlock10('Dunkel')}
      <div class="lt tbl10">${toLight10(themeBlock10('Hell'))}</div>
    </div>
  </div>
</div>`
const board10 = frame('42e Info-Panel · leere Zustände im Überblick', 1440, 1850, boardMain10)

// M37 Phone: the activity sheet in the first seconds of a turn. It hugs its content, so no void.
const sheet10 = `<div class="mdim"></div><div class="msheet sheet10"><span class="grabber"></span>
  <div class="col gap2" style="padding:0 2px"><span class="strong">Aktivität</span><span class="xs muted">Was Claude in diesem Chat gerade tut.</span></div>
  <div class="col">${ACTIVITY_10.thinking().replace('<span class="rtitle">Aktivität</span>', '<span class="rtitle">Schritte</span>')}${SUBAGENTS_10}</div>
</div>`
const mActivity10 = (name, light = false) => {
  const html = mScreen(
    name,
    chatTop('working', 'Header wie Homeserver'),
    `${userMessage('Mach den Header wie beim Homeserver.')}`,
    `<div class="mthink">${statusLine8('Überlegt …', '0:04', '0,3k')}</div>${mComposer({ text: '' })}`,
    sheet10
  )
  return light ? asLight10(html) : html
}
const mActivityDark10 = mActivity10('M37 Aktivität · Claude überlegt noch')
const mActivityLight10 = mActivity10('M37b Aktivität · Claude überlegt noch · hell', true)

const cssP10 = `
.lt{color:#1b1b1a}.lt .pp10 .rsect{border:none}
.p10{gap:16px}.p10 .rsect{gap:12px}
.pt10{border-radius:9px}
.pe10{display:flex;gap:10px;align-items:flex-start}
.pe10t{font-size:13px;font-weight:600;color:${C.ink};line-height:18px}
.pe10h{font-size:12px;color:${C.ink3};line-height:17px}
.pl10{margin-top:4px}
.pb10{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin-top:6px;font-size:12px;font-weight:500;color:${C.ink};border:1px solid ${C.line2};background:${C.card};border-radius:8px;padding:4px 10px}
.ghost10{border:1px dashed ${C.line2};border-radius:10px;padding:4px 10px;display:flex;flex-direction:column}
.gr10{display:flex;align-items:center;gap:8px;padding:5px 0}
.gb10{display:block;height:6px;border-radius:99px;background:${C.s3}}
.shim10{background:linear-gradient(90deg,${C.s3} 0%,${C.line2} 50%,${C.s3} 100%)}
.sum10{display:flex;gap:10px;align-items:center;background:${C.card};border:1px solid ${C.line};border-radius:10px;padding:10px}
.guide10{margin-top:auto;position:relative;overflow:hidden;border:1px dashed ${C.line2};border-radius:12px;padding:14px}
.dots10{position:absolute;inset:0;opacity:.5;background-image:radial-gradient(${C.line2} 1px, transparent 1px);background-size:14px 14px}
.fade10{position:absolute;inset:0;background:linear-gradient(180deg,${C.app} 15%,${C.app}00 100%)}
.gi10{display:flex;gap:10px;align-items:flex-start}
.gi10t{font-size:12px;font-weight:600;color:${C.ink2};line-height:17px}
.gi10h{font-size:12px;color:${C.ink3};line-height:17px}
.gfoot10{display:flex;align-items:center;gap:6px;font-size:12px;color:${C.ink3};padding-top:2px}
.board10{display:flex;flex-direction:column;gap:28px;padding:48px 56px;height:100%}
.rules10{width:300px;flex:none;padding-top:34px}
.tb10{display:flex;flex-direction:column;gap:16px;border-radius:16px;padding:24px;border:1px solid ${C.line}}
.lt.tbl10{border-radius:16px}
.lt .tb10{background:#f7f6f3;color:#1b1b1a}
.w10{width:300px;flex:none}
.pp10{background:${C.app};border:1px solid ${C.line};border-radius:12px;padding:16px;display:flex;flex-direction:column}
.pp10 .rsect{border:none;padding-bottom:0;gap:12px;display:flex;flex-direction:column}
.pp10 .guide10{margin-top:0}
.sheet10{gap:14px}.sheet10 .rsect{padding:12px 2px;border-bottom:1px solid ${C.line2}}.sheet10 .rsect:last-child{border:none;padding-bottom:0}
.sheet10 .pt10{background:${C.s3}!important}
.lt .sheet10 .rsect:last-child{border:none}
.lt .msheet{box-shadow:0 -12px 32px rgba(0,0,0,.12)}
.lt .mdim{background:rgba(27,27,26,.35)}
`
const cssBase10 = `${r9Css}${cssP10}`
const r10Css = `${cssBase10}${lightCss10(cssBase10)}`
writeFileSync(
  new URL('bull-panel-empty.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Info-Panel leer</title><style>${r10Css}</style></head><body>${[resting10, restingLight10, fresh10, running10, board10].join('')}</body></html>`
)
writeFileSync(
  new URL('bull-panel-empty-mobile.html', OUT),
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Bull Info-Panel leer Mobile</title><style>${r10Css}</style></head><body>${mActivityDark10}${mActivityLight10}</body></html>`
)
console.log('panel empty states missing icons:', [...missing].join(', ') || 'none')
