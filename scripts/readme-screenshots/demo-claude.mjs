// Stand-in for `claude -p --input-format stream-json` in the README screenshots. agentd starts it
// through demo-claude.cmd (AGENTD_CLAUDE). It answers like Claude Code on stdout, with a script
// picked by the prompt: "push" asks to run a command and waits for the approval, "certificate"
// and "release notes" keep working without end, anything else gets a short reply.

import readline from 'node:readline'
import { randomUUID } from 'node:crypto'

const VERSION_LINE = '2.1.330 (Claude Code)'
const STEP_MS = 400

if (process.argv.includes('--version')) {
  console.log(VERSION_LINE)
  process.exit(0)
}

const argAfter = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
const sessionId = argAfter('--resume') ?? argAfter('--session-id') ?? randomUUID()
const model = argAfter('--model') ?? 'claude-opus-4-5-20251101'
const permissionMode = argAfter('--permission-mode') ?? 'default'

const say = (event) => process.stdout.write(`${JSON.stringify(event)}\n`)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const waiting = new Map()

const usage = () => ({
  input_tokens: 12,
  cache_creation_input_tokens: 2400,
  cache_read_input_tokens: 48200,
  output_tokens: 320
})

const assistant = (content) =>
  say({
    type: 'assistant',
    message: {
      id: `msg_${randomUUID()}`,
      type: 'message',
      role: 'assistant',
      model,
      content,
      usage: usage()
    },
    parent_tool_use_id: null,
    session_id: sessionId,
    uuid: randomUUID()
  })

const toolResult = (toolUseId, text) =>
  say({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text }]
    },
    parent_tool_use_id: null,
    session_id: sessionId,
    uuid: randomUUID()
  })

const finish = (text) =>
  say({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 8400,
    num_turns: 3,
    result: text,
    session_id: sessionId,
    usage: usage()
  })

/** Asks for the tool call like Claude Code and resolves with the app's decision. */
const askToUse = (toolName, input, toolUseId, suggestions) => {
  const requestId = randomUUID()
  say({
    type: 'control_request',
    request_id: requestId,
    request: {
      subtype: 'can_use_tool',
      tool_name: toolName,
      input,
      tool_use_id: toolUseId,
      permission_suggestions: suggestions
    }
  })
  return new Promise((resolve) => waiting.set(requestId, resolve))
}

const thinkThenSay = async (thinking, text) => {
  assistant([{ type: 'thinking', thinking, signature: 'demo' }])
  await wait(STEP_MS)
  assistant([{ type: 'text', text }])
  await wait(STEP_MS)
}

const runApproval = async () => {
  await thinkThenSay(
    'The unit tests pass. The checkout flow also has end-to-end tests; run them before pushing.',
    'Running the checkout end-to-end tests before I push.'
  )
  const toolUseId = `toolu_${randomUUID().replace(/-/g, '')}`
  const input = {
    command: 'npx playwright test e2e/checkout.spec.ts',
    description: 'Run the checkout end-to-end tests'
  }
  assistant([{ type: 'tool_use', id: toolUseId, name: 'Bash', input }])
  const suggestions = [
    {
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'npx playwright test:*' }],
      behavior: 'allow',
      destination: 'localSettings'
    }
  ]
  const decision = await askToUse('Bash', input, toolUseId, suggestions)
  if (decision?.behavior !== 'allow') {
    toolResult(toolUseId, 'The user denied this tool call.')
    return finish('Stopped before the end-to-end tests.')
  }
  toolResult(toolUseId, '  12 passed (18.4s)')
  assistant([{ type: 'text', text: 'All 12 checkout tests pass. Pushed `fix/cart-rounding`.' }])
  finish('All 12 checkout tests pass.')
}

/** A turn that never ends, like a long command: the tab stays busy. */
const keepWorking = async (thinking, text, input) => {
  await thinkThenSay(thinking, text)
  assistant([
    { type: 'tool_use', id: `toolu_${randomUUID().replace(/-/g, '')}`, name: 'Bash', input }
  ])
}

const reply = async (text) => {
  if (/push/i.test(text)) return runApproval()
  if (/certificate/i.test(text))
    return keepWorking(
      'Check which certificate nginx serves on staging and when it expires, then renew it.',
      'Checking the certificate staging serves right now.',
      {
        command: 'certbot renew --cert-name staging.acme.test',
        description: 'Renew the staging certificate'
      }
    )
  if (/release notes/i.test(text))
    return keepWorking(
      'List what was merged since 2.3, then group it into features and fixes.',
      'Collecting everything merged since 2.3.',
      { command: 'git log v2.3..HEAD --merges --oneline', description: 'List merges since 2.3' }
    )
  await thinkThenSay(
    'A short answer is enough here.',
    'On it. That is a small change; I will keep it in one commit.'
  )
  finish('Done.')
}

const controlResponse = (message) => {
  const subtype = message.request?.subtype
  const response =
    subtype === 'initialize'
      ? {
          commands: [
            { name: 'compact', description: 'Free up context', argumentHint: '<instructions>' }
          ]
        }
      : subtype === 'get_context_usage'
        ? { totalTokens: 50612 }
        : message.request
  say({
    type: 'control_response',
    response: { subtype: 'success', request_id: message.request_id, response }
  })
}

const userText = (message) =>
  (Array.isArray(message.message?.content) ? message.message.content : [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

const lines = readline.createInterface({ input: process.stdin })
lines.on('line', (line) => {
  const message = JSON.parse(line)
  switch (message.type) {
    case 'control_request':
      return controlResponse(message)
    case 'control_response': {
      const resolve = waiting.get(message.response?.request_id)
      waiting.delete(message.response?.request_id)
      return resolve?.(message.response?.response)
    }
    case 'user': {
      say({
        type: 'system',
        subtype: 'init',
        session_id: sessionId,
        model,
        permissionMode,
        cwd: process.cwd(),
        tools: []
      })
      // --replay-user-messages: Claude echoes each prompt it takes.
      say({ ...message, session_id: sessionId, uuid: randomUUID(), parent_tool_use_id: null })
      return void reply(userText(message))
    }
  }
})
lines.on('close', () => process.exit(0))
