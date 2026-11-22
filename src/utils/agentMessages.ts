import type { Block, ChatMessage } from '@/types/agentd.type'
import { AGENT_ID_PATTERN, AGENT_TOOL_NAMES } from '@/utils/tabInsights'
import { resultTextOf } from '@/utils/toolPairs'

/** A subagent's report or another agent's message: Claude Code sent it, nobody typed it. */
export const isAgentMessage = (message: ChatMessage | undefined): boolean =>
  !!message &&
  message.role === 'system' &&
  message.blocks.some((block) => block.type === 'agent_message')

/**
 * The description each subagent was started with, by the agent id its launch answer names
 * ("agentId: a4440…"). A hand-back carries only that id.
 */
export const agentTitlesOf = (messages: ChatMessage[]): Map<string, string> => {
  const descriptions = new Map<string, string>()
  const titles = new Map<string, string>()
  for (const message of messages)
    for (const block of message.blocks) {
      if (block.type === 'tool_use' && AGENT_TOOL_NAMES.includes(block.name)) {
        const { description } = block.input
        if (typeof description === 'string' && description) descriptions.set(block.id, description)
        continue
      }
      if (block.type !== 'tool_result') continue
      const description = descriptions.get(block.tool_use_id)
      const agentId = resultTextOf(block).match(AGENT_ID_PATTERN)?.[1]
      if (description && agentId) titles.set(agentId, description)
    }
  return titles
}

const titledBlock = (block: Block, titles: Map<string, string>): Block => {
  if (block.type !== 'agent_message') return block
  const title = titles.get(block.from)
  return title && title !== block.name ? { ...block, name: title } : block
}

/**
 * Names each agent message after the description its subagent was started with, where the chat
 * holds that call; otherwise it keeps the type the transcript wrote down, if any. Messages that
 * keep their name stay the same objects.
 */
export const withAgentTitles = (messages: ChatMessage[]): ChatMessage[] => {
  if (!messages.some(isAgentMessage)) return messages
  const titles = agentTitlesOf(messages)
  return messages.map((message) => {
    if (!isAgentMessage(message)) return message
    const blocks = message.blocks.map((block) => titledBlock(block, titles))
    return blocks.every((block, index) => block === message.blocks[index])
      ? message
      : { ...message, blocks }
  })
}
