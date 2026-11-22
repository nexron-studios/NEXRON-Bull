import type { ChatMessage } from '@/types/agentd.type'

/**
 * What the user typed in this chat, oldest first, for ↑ in the composer like the terminal's
 * history. A prompt sent twice in a row counts once; slash commands count with their arguments.
 */
export const promptTextsOf = (messages: readonly ChatMessage[]): string[] =>
  messages
    .filter((message) => message.role === 'user')
    .flatMap((message) => {
      const texts = message.blocks.flatMap((block) => {
        if (block.type === 'text') return [block.text]
        if (block.type === 'command') return [`${block.name} ${block.args}`.trim()]
        return []
      })
      const text = texts.join('\n\n').trim()
      return text ? [text] : []
    })
    .filter((text, index, all) => text !== all[index - 1])
