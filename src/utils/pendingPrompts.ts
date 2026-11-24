import type { Block, ChatMessage, PromptBlock } from '@/types/agentd.type'
import type { PendingImage } from '@/utils/content'
import { remapImageRefs, type ImageRefFormat } from '@/utils/imageRefs'
import { shellBlockOf } from '@/utils/shellBlocks'

const PENDING_PREFIX = 'pending:'

/** What the user typed and attached for one prompt, to put back if it never reaches Claude. */
export interface SentDraft {
  text: string
  images: PendingImage[]
}

// A `!` command that goes with the prompt shows as the shell block agentd makes of its echo.
const blockOf = (block: PromptBlock): Block =>
  block.type === 'text'
    ? (shellBlockOf(block.text) ?? { type: 'text', text: block.text })
    : { type: 'image', media_type: block.source.media_type, data: block.source.data }

/**
 * A sent prompt as the chat shows it until Claude echoes it back, in the shape agentd gives the
 * echo. `isMidTurn`: Claude already replied in the running turn, so the prompt joins that turn.
 */
export const pendingMessageOf = (
  content: PromptBlock[],
  id: string,
  now: number,
  isMidTurn: boolean
): ChatMessage => ({
  uuid: `${PENDING_PREFIX}${id}`,
  role: 'user',
  at: new Date(now).toISOString(),
  blocks: content.map(blockOf),
  ...(isMidTurn ? { is_mid_turn: true } : {})
})

/** Something the user sent; tool results, the interrupt note and command output are user lines too. */
export const isPromptEcho = (message: ChatMessage): boolean =>
  message.role === 'user' &&
  message.blocks.some(
    (block) => block.type === 'text' || block.type === 'image' || block.type === 'command'
  )

// Claude Code trims and joins what it echoes, and turns a typed slash command into a command block.
const textsOf = (message: ChatMessage): string[] =>
  message.blocks
    .flatMap((block) => {
      if (block.type === 'text') return [block.text.trim()]
      if (block.type === 'command') return [`${block.name} ${block.args}`.trim()]
      return []
    })
    .filter(Boolean)

const imageCountOf = (message: ChatMessage): number =>
  message.blocks.filter((block) => block.type === 'image').length

const isSameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((text, index) => text === b[index])

/**
 * Where the prompts `echo` stands for start and end in `pending`. Claude takes every prompt
 * queued at that moment into one message, so the echo may cover several in a row.
 */
const echoedRange = (pending: ChatMessage[], echo: ChatMessage): [number, number] | null => {
  const texts = textsOf(echo)
  const images = imageCountOf(echo)
  for (let start = 0; start < pending.length; start++) {
    const run: ChatMessage[] = []
    for (const prompt of pending.slice(start)) {
      run.push(prompt)
      const runTexts = run.flatMap(textsOf)
      if (runTexts.length > texts.length) break
      const runImages = run.reduce((sum, item) => sum + imageCountOf(item), 0)
      if (isSameList(runTexts, texts) && runImages === images) return [start, start + run.length]
    }
  }
  return null
}

/**
 * The prompts still waiting for their echo once `echo` arrived. An echo replaces the prompts it
 * stands for; Claude takes prompts in the order they came, so older ones still waiting were
 * already taken in a message that did not match and are dropped too. A user line that matches
 * nothing changes nothing.
 */
export const withoutEchoed = (pending: ChatMessage[], echo: ChatMessage): ChatMessage[] => {
  if (!pending.length || !isPromptEcho(echo)) return pending
  const range = echoedRange(pending, echo)
  return range ? pending.slice(range[1]) : pending
}

/**
 * The draft with prompts that never reached Claude put back in front, oldest first. Their image
 * references are numbered anew, since all their images now share one message.
 */
export const draftWithUnsent = (
  draft: SentDraft,
  unsent: SentDraft[],
  format: ImageRefFormat
): SentDraft => {
  const parts = [...unsent, draft]
  const images = parts.flatMap((part) => part.images)
  return {
    text: parts
      .map((part) => remapImageRefs(part.text, part.images, images, format))
      .filter(Boolean)
      .join('\n\n'),
    images
  }
}
