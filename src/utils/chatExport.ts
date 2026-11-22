import type { Block, ChatMessage } from '@/types/agentd.type'

/** The words the export puts around the conversation, in the user's language. */
export interface ExportLabels {
  user: string
  claude: string
  image: string
}

const FENCE = '```'

const blockMarkdown = (block: Block, labels: ExportLabels): string | null => {
  switch (block.type) {
    case 'text':
      return block.text
    case 'image':
      return `_${labels.image}_`
    case 'tool_use':
      return `\`${block.name}\``
    case 'command':
      return `\`${`${block.name} ${block.args}`.trim()}\``
    case 'command_output':
      return `${FENCE}\n${block.text}\n${FENCE}`
    case 'shell':
      return `${FENCE}sh\n$ ${block.command}\n${FENCE}`
    case 'shell_output':
      return `${FENCE}\n${[block.stdout, block.stderr].filter(Boolean).join('\n')}\n${FENCE}`
    case 'agent_message':
      return block.text
    case 'tool_result':
    case 'thinking':
    case 'compacted':
    case 'interrupted':
    case 'account_moved':
    case 'hook':
      return null
    default: {
      const unhandled: never = block
      throw new Error(`Unhandled block: ${JSON.stringify(unhandled)}`)
    }
  }
}

/**
 * The conversation as Markdown, like Claude Code's `/export`: who spoke, what they said, tool
 * calls by name. Tool output and reasoning stay out; they are the transcript's, not the talk's.
 */
export const chatMarkdownOf = (messages: readonly ChatMessage[], labels: ExportLabels): string =>
  messages
    .flatMap((message) => {
      if (message.role === 'system') return []
      const body = message.blocks
        .flatMap((block) => blockMarkdown(block, labels) ?? [])
        .join('\n\n')
        .trim()
      if (!body) return []
      return [`## ${message.role === 'user' ? labels.user : labels.claude}\n\n${body}`]
    })
    .join('\n\n')
