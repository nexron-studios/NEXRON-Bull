import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { reactive, readonly, type Ref } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  terminalService,
  type TerminalEvent,
  type TerminalSpawnPayload
} from '@/api/services/terminal.service'
import i18n from '@/i18n'
import { copyText, writeClipboard } from '@/lib/clipboard'
import { handleError } from '@/lib/error'
import { createReadyGate } from '@/lib/terminalReady'
import { answerDeviceAttributes, hasScreenText } from '@/lib/terminalScreen'
import {
  createTerminalStatus,
  REVEAL_AFTER_MS,
  REVEAL_AFTER_REMOTE_MS,
  type TerminalStatus
} from '@/lib/terminalStatus'
import { useCopyHintStore } from '@/stores/copyHint'
import type { TerminalRequest } from '@/stores/terminalRequests'
import { copyableTextOf, isMainMouseRelease } from '@/utils/copySelection'
import { isNewTerminalShortcut, isTerminalDrawerShortcut } from '@/utils/shortcuts'
import { COLOR_SCHEME_ATTRIBUTE } from '@/lib/colorSchemeDom'
import {
  controlCharOf,
  resolveShell,
  startupInputOf,
  TERMINAL_LINE_HEIGHT,
  terminalThemeOf
} from '@/utils/terminal'
import type { TerminalShell, TerminalShellChoice } from '@/utils/terminalPreferences'

/** Same stack as the `--font-mono` token; xterm draws on a canvas and needs the names itself. */
const TERMINAL_FONT = "'Geist Mono Variable', 'Cascadia Code', Consolas, monospace"
/** The face xterm measures its cells with; it must be loaded before the terminal opens. */
const MEASURED_FONT = '"Geist Mono Variable"'
const SCROLLBACK_LINES = 5000
/** Dim grey (SGR 90) for Bull's own lines in the terminal, then back to normal */
const DIM = '\x1b[90m'
const RESET = '\x1b[0m'

export interface TerminalSessionOptions extends TerminalRequest {
  /** The shell picked for this terminal; `null` takes the one from the settings */
  shell: TerminalShell | null
  /** The settings' pick, read when the shell starts */
  shellChoice: () => TerminalShellChoice
  fontSize: number
  /** Told which shell actually started, for the bar */
  onShell: (shell: TerminalShell) => void
}

export interface TerminalSession {
  /** Skeleton, shell or start error: what the screen shows right now */
  status: Readonly<Ref<TerminalStatus>>
  /** Lines beyond the screen: scrollback above it, newer output below it while scrolled up */
  scrollEdges: Readonly<{ hasMoreAbove: boolean; hasMoreBelow: boolean }>
  /** Shows the terminal in `container`; starts the shell the first time. */
  attach: (container: HTMLElement) => void
  /** Takes it off screen; the shell runs on. */
  detach: () => void
  /** Fits the terminal to its container again, after the container changed size. */
  fit: () => void
  focus: () => void
  clear: () => void
  /** Ends the shell and starts a fresh one, optionally another shell. */
  restart: (shell?: TerminalShell) => void
  /** Types as if from the keyboard; the phone's key row */
  type: (data: string) => void
  /** The next typed character becomes its Ctrl variant; `onUsed` once it did. */
  armCtrl: (onUsed: () => void) => void
  setFontSize: (size: number) => void
  dispose: () => void
}

interface Running {
  retheme: () => void
}

const running = new Set<Running>()
/** Output for each shell by its id */
const routes = new Map<number, (event: TerminalEvent) => void>()
/**
 * Output that comes before `terminal_spawn` returned its id. Only kept while a spawn is under way;
 * anything else is from a shell nobody listens to any more.
 */
const early = new Map<number, TerminalEvent[]>()
let spawning = 0
let installed: Promise<TerminalShell[]> | null = null

const route = (event: TerminalEvent) => {
  const handle = routes.get(event.id)
  if (handle) return handle(event)
  if (spawning) early.set(event.id, [...(early.get(event.id) ?? []), event])
}

const listen = (ptyId: number, handle: (event: TerminalEvent) => void) => {
  routes.set(ptyId, handle)
  const waiting = early.get(ptyId) ?? []
  early.delete(ptyId)
  waiting.forEach(handle)
}

/** A shell that is being replaced or closed: its last output and its exit are dropped. */
const forget = (ptyId: number) => {
  routes.set(ptyId, (event) => {
    if (event.type === 'exit') routes.delete(ptyId)
  })
  void terminalService.kill(ptyId).catch(handleError)
}

const spawnShell = async (request: TerminalSpawnPayload): Promise<number> => {
  spawning += 1
  try {
    return await terminalService.spawn(request)
  } finally {
    spawning -= 1
    // Unclaimed output from the spawns that just ended belongs to no terminal.
    if (!spawning) queueMicrotask(() => early.clear())
  }
}

/**
 * Once per page: ends the shells a previous load of the page left running, then asks which shells
 * are installed. A failure is not cached, so the next start asks again.
 */
export const prepareTerminals = (): Promise<TerminalShell[]> =>
  (installed ??= terminalService
    .killAll()
    .then(terminalService.shells)
    .catch((error: unknown) => {
      installed = null
      throw error
    }))

let isWatching = false
// One listener for all terminals: theme and colour scheme change on <html>, whoever changes them.
const watchTheme = () => {
  if (isWatching) return
  isWatching = true
  terminalService.onEvent(route)
  new MutationObserver(() => running.forEach((session) => session.retheme())).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ['class', COLOR_SCHEME_ATTRIBUTE] }
  )
}

const currentTheme = () => {
  const style = getComputedStyle(document.documentElement)
  return terminalThemeOf(
    (token) => style.getPropertyValue(token).trim(),
    document.documentElement.classList.contains('dark')
  )
}

/** Ctrl+` and Ctrl+Shift+` belong to Bull (drawer, new terminal), not to the shell. */
const isAppShortcut = (event: KeyboardEvent): boolean =>
  isTerminalDrawerShortcut(event) || isNewTerminalShortcut(event)

const isCopy = (event: KeyboardEvent): boolean =>
  event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c'

const isPaste = (event: KeyboardEvent): boolean =>
  event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'v'

/**
 * A shell in an xterm.js terminal. The terminal lives outside any component, so its output is
 * kept while it is off screen (another tab, a closed drawer) and moving it from the drawer to a tab
 * keeps the shell.
 */
export const createTerminalSession = (options: TerminalSessionOptions): TerminalSession => {
  watchTheme()
  const host = document.createElement('div')
  host.className = 'h-full w-full'
  const term = new Terminal({
    fontFamily: TERMINAL_FONT,
    fontSize: options.fontSize,
    lineHeight: TERMINAL_LINE_HEIGHT,
    scrollback: SCROLLBACK_LINES,
    cursorBlink: true,
    allowProposedApi: false,
    theme: currentTheme()
  })
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon((_event, uri) => void openUrl(uri).catch(handleError)))

  let shell = options.shell
  let ptyId: number | null = null
  /** Counts the starts: an older one still under way gives up and ends what it spawned. */
  let generation = 0
  let gate: ReturnType<typeof createReadyGate> | null = null
  let isOpened = false
  let isExited = false
  /** Set while the key row's Ctrl waits for the next character */
  let onCtrlUsed: (() => void) | null = null
  let isDisposed = false
  // Asked for before the terminal opened (the font still loading): focused once it is.
  let wantsFocus = false
  const startStatus = createTerminalStatus(
    options.machine ? REVEAL_AFTER_REMOTE_MS : REVEAL_AFTER_MS
  )
  const self: Running = { retheme: () => (term.options.theme = currentTheme()) }
  running.add(self)

  const send = (data: string) => {
    if (ptyId === null) return
    void terminalService.write(ptyId, data).catch(handleError)
  }

  // Only output of the current start may end its skeleton: chunks the old shell left in the write
  // queue are drawn after a restart, too.
  const show = (data: string) => {
    const mine = generation
    term.write(data, () => {
      if (mine !== generation || startStatus.status.value.kind !== 'starting') return
      if (hasScreenText(term.buffer.active)) startStatus.reveal()
    })
  }

  const handleEvent = (event: TerminalEvent) => {
    if (event.type === 'output') return show(event.data)
    routes.delete(event.id)
    ptyId = null
    isExited = true
    show(`\r\n${DIM}${i18n.global.t('terminal.exited', { code: event.code })}${RESET}\r\n`)
  }

  /** Ends the running shell, if any, without a word in the terminal. */
  const stop = () => {
    generation += 1
    gate?.cancel()
    gate = null
    if (ptyId === null) return
    forget(ptyId)
    ptyId = null
  }

  const start = async () => {
    stop()
    startStatus.start()
    const mine = generation
    isExited = false
    try {
      // A shell picked earlier that is gone now falls back like a missing pick in the settings.
      const resolved = resolveShell(shell ?? options.shellChoice(), await prepareTerminals())
      if (mine !== generation || isDisposed) return
      shell = resolved
      options.onShell(resolved)
      const id = await spawnShell({
        machine: options.machine,
        cwd: options.cwd,
        shell: resolved,
        env: options.env ?? {},
        cols: term.cols,
        rows: term.rows
      })
      if (mine !== generation || isDisposed) return forget(id)
      ptyId = id
      startStatus.spawned()
      const typed = startupInputOf(options, resolved)
      const ready = createReadyGate(() => typed && send(typed))
      gate = ready
      listen(id, (event) => {
        if (event.type === 'output') ready.output()
        else ready.cancel()
        handleEvent(event)
      })
      // The terminal may have changed size while the shell was starting.
      void terminalService.resize(id, term.cols, term.rows).catch(handleError)
    } catch (error: unknown) {
      // The screen shows the message with a retry. A start a newer one replaced reports nothing.
      if (mine !== generation) return
      isExited = true
      startStatus.fail(String(error))
    }
  }

  const restart = (next?: TerminalShell) => {
    if (next) shell = next
    term.reset()
    void start()
  }

  // Typed or from the key row: after an exit Enter starts a new shell, an armed Ctrl applies once.
  const input = (data: string) => {
    if (isExited) return data === '\r' && restart()
    if (!onCtrlUsed) return send(data)
    onCtrlUsed()
    onCtrlUsed = null
    send(controlCharOf(data.charAt(0)) + data.slice(1))
  }

  // xterm scrolls an element of its own, not a native scroll area, so `useScroll` cannot see it;
  // the buffer says where the screen is. Every scroll and every new line renders.
  const scrollEdges = reactive({ hasMoreAbove: false, hasMoreBelow: false })
  term.onRender(() => {
    const { viewportY, baseY } = term.buffer.active
    scrollEdges.hasMoreAbove = viewportY > 0
    scrollEdges.hasMoreBelow = viewportY < baseY
  })

  term.onData(input)
  answerDeviceAttributes(term, send)
  term.onResize(({ cols, rows }) => {
    if (ptyId !== null) void terminalService.resize(ptyId, cols, rows).catch(handleError)
  })
  // A mouse selection is copied on release, like everywhere else in the app (useCopyOnSelect).
  // Only a press that began here: a drag from the chat ending over the terminal keeps its own.
  let isPressedHere = false
  host.addEventListener('pointerdown', () => {
    isPressedHere = true
  })
  host.addEventListener('pointerup', (event) => {
    const wasPressedHere = isPressedHere
    isPressedHere = false
    if (!wasPressedHere || !isMainMouseRelease(event) || !term.hasSelection()) return
    const text = copyableTextOf(term.getSelection())
    if (!text) return
    void writeClipboard(text).then(
      (isCopied) => isCopied && useCopyHintStore().show(event.clientX, event.clientY)
    )
  })
  // Ctrl+C copies a selection (and only then interrupts), Ctrl+V pastes through the browser.
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true
    if (isAppShortcut(event)) return false
    if (isCopy(event) && term.hasSelection()) {
      void copyText(term.getSelection())
      term.clearSelection()
      return false
    }
    return !isPaste(event)
  })

  const fit = () => {
    // Before `open` there is nothing to measure; off screen the size would be zero.
    if (!term.element || !host.isConnected) return
    fitAddon.fit()
  }

  // xterm measures one cell when it opens; with a fallback font every later line is misaligned.
  const open = async () => {
    // Without the font the terminal still works in the fallback face; only the look suffers.
    await document.fonts.load(`${options.fontSize}px ${MEASURED_FONT}`).catch((error: unknown) => {
      console.warn('terminal.font_failed', { message: String(error) })
    })
    if (isDisposed) return
    term.open(host)
    fit()
    if (wantsFocus) term.focus()
    void start()
  }

  const attach = (container: HTMLElement) => {
    container.appendChild(host)
    if (isOpened) return fit()
    isOpened = true
    void open().catch(handleError)
  }

  return {
    status: startStatus.status,
    scrollEdges: readonly(scrollEdges),
    attach,
    detach: () => host.remove(),
    fit,
    focus: () => {
      wantsFocus = !term.element
      term.focus()
    },
    clear: () => term.clear(),
    restart,
    type: input,
    armCtrl: (onUsed) => {
      onCtrlUsed = onUsed
      term.focus()
    },
    setFontSize: (size) => {
      term.options.fontSize = size
      fit()
    },
    dispose: () => {
      isDisposed = true
      running.delete(self)
      stop()
      startStatus.dispose()
      term.dispose()
      host.remove()
    }
  }
}
