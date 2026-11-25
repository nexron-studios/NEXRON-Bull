/** The name of another machine in Bull's list; `null` is this computer. */
export type Machine = string | null

/** No answer in time; the machine may be offline or run an agentd without this op. */
export class AgentdTimeoutError extends Error {
  readonly machine: Machine

  constructor(machine: Machine) {
    super(`agentd on ${machine ?? 'this computer'} did not answer in time`)
    this.name = 'AgentdTimeoutError'
    this.machine = machine
  }
}

/** The connection to the machine ended before it answered, e.g. ssh could not reach the host. */
export class AgentdDisconnectedError extends Error {
  readonly machine: Machine

  constructor(machine: Machine) {
    super(`connection to ${machine ?? 'this computer'} ended before agentd answered`)
    this.name = 'AgentdDisconnectedError'
    this.machine = machine
  }
}
