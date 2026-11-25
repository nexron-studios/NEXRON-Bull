import { agentdSpawner, configOf, tokenFileOf } from './config.ts'
import { createBridge } from './relay.ts'
import { createToken, isKnownToken, loadTokenHashes } from './tokens.ts'

/** Caddy sits in front; the bridge itself is never reachable from outside this machine. */
const HOST = '127.0.0.1'
const DEFAULT_DEVICE = 'phone'

const commandList = ['serve', 'token'] as const
type Command = (typeof commandList)[number]

const commandOf = (value: string | undefined): Command => {
  const command = commandList.find((known) => known === (value ?? 'serve'))
  if (!command) throw new Error(`unknown command "${value}"; use ${commandList.join(' or ')}`)
  return command
}

const printToken = async (device: string) => {
  const file = tokenFileOf(process.env)
  const token = await createToken(file, device)
  console.log(`Token for ${device} (shown once, enter it in Bull on that device):\n\n${token}\n`)
  console.log(`Its hash is in ${file}; delete that line to lock the device out again.`)
}

const serve = async () => {
  const config = configOf(process.env)
  // Fails here, not at the first phone, when no token was made yet or the file is broken.
  await loadTokenHashes(config.tokenFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    throw new Error(`no device token yet (${config.tokenFile}): run "npm run token -- <device>"`)
  })
  const server = createBridge({
    origins: config.origins,
    // Read again for every device, so a removed line locks it out without a restart.
    isAuthorized: async (token) => isKnownToken(await loadTokenHashes(config.tokenFile), token),
    machines: config.machines,
    spawnAgentd: agentdSpawner(config.agentd, config.machines)
  })
  server.listen(config.port, HOST, () =>
    console.log(
      `bull-bridge on ws://${HOST}:${config.port}/ws for ${[...config.origins].join(', ')}`
    )
  )
}

const [commandArg, deviceArg] = process.argv.slice(2)
const command = commandOf(commandArg)
switch (command) {
  case 'serve':
    await serve()
    break
  case 'token':
    await printToken(deviceArg ?? DEFAULT_DEVICE)
    break
  default: {
    const unhandled: never = command
    throw new Error(`Unhandled command: ${unhandled}`)
  }
}
