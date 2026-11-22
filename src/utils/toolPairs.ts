import type { Block, ChatMessage } from '@/types/agentd.type'

export type ToolUseBlock = Extract<Block, { type: 'tool_use' }>
export type ToolResultBlock = Extract<Block, { type: 'tool_result' }>

/** The text a tool returned, its parts on separate lines; images are left out. */
export const resultTextOf = (result: ToolResultBlock): string =>
  result.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n')

/** Every tool result, by the id of the call it answers. */
export const resultsByToolId = (messages: ChatMessage[]): Map<string, ToolResultBlock> =>
  new Map(
    messages
      .flatMap((message) => message.blocks)
      .filter((block): block is ToolResultBlock => block.type === 'tool_result')
      .map((block) => [block.tool_use_id, block])
  )

const toolCallIds = (messages: ChatMessage[]): Set<string> =>
  new Set(
    messages
      .flatMap((message) => message.blocks)
      .flatMap((block) => (block.type === 'tool_use' ? [block.id] : []))
  )

/** Messages without results whose call is shown: those results appear inside the call's card. */
export const visibleMessages = (messages: ChatMessage[]): ChatMessage[] => {
  const calls = toolCallIds(messages)
  return messages.filter(
    (message) =>
      !message.blocks.every((block) => block.type === 'tool_result' && calls.has(block.tool_use_id))
  )
}
