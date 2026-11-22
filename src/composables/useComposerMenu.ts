import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMentionMenu } from '@/composables/useMentionMenu'
import { useSlashMenu } from '@/composables/useSlashMenu'
import type { MenuRowProps, MenuSectionProps } from '@/types/composerMenu.type'
import type { ChatTabState } from '@/utils/chatTab'
import { replaceTrigger, triggerAt, type Replaced } from '@/utils/composerTrigger'
import type { CommandRow, MentionRow } from '@/utils/composerMenu'
import { mentionTextOf } from '@/utils/fileMentions'
import { isUnknownOpError } from '@/utils/sessionActions'
import { folderNameOf } from '@/utils/sessionList'

/** Origins with a word of their own; a plugin shows under its own name. */
const SOURCE_KEYS: Record<string, string> = {
  user: 'user',
  project: 'project',
  'claude.ai sync': 'claude_ai_sync',
  'dynamic workflow': 'dynamic_workflow'
}

interface ComposerMenuOptions {
  tab: MaybeRefOrGetter<ChatTabState>
  draft: Ref<string>
  caret: Ref<number>
  /** Off in shell mode */
  isEnabled: Ref<boolean>
  /** Enter on a command: the prompt to submit, e.g. `/compact` */
  onRun: (text: string) => void
  /** Tab on a command, any pick of a file: the new text and caret */
  onInsert: (replaced: Replaced) => void
}

/**
 * The menu above the composer: `/` at the start lists commands, `@` lists the chat's files.
 * Arrows choose, Tab completes, Enter runs a command or takes a file, Esc closes until the
 * trigger is typed again.
 */
export const useComposerMenu = ({
  tab,
  draft,
  caret,
  isEnabled,
  onRun,
  onInsert
}: ComposerMenuOptions) => {
  const { t } = useI18n()

  const dismissedAt = ref<number | null>(null)
  const activeIndex = ref(0)
  // Files picked from the menu; they stay highlighted while the draft lasts.
  const picked = ref(new Set<string>())

  const typed = computed(() => (isEnabled.value ? triggerAt(draft.value, caret.value) : null))
  const trigger = computed(() =>
    typed.value && typed.value.start !== dismissedAt.value ? typed.value : null
  )
  const slashQuery = computed(() => (trigger.value?.kind === 'slash' ? trigger.value.query : ''))
  const mentionQuery = computed(() =>
    trigger.value?.kind === 'mention' ? trigger.value.query : ''
  )
  const isMentionOpen = computed(() => trigger.value?.kind === 'mention')

  const slash = useSlashMenu(() => toValue(tab).id, slashQuery)
  const mention = useMentionMenu(() => toValue(tab), mentionQuery, isMentionOpen)

  const sourceLabel = (source: string | null) => {
    if (!source) return null
    const key = SOURCE_KEYS[source]
    return key ? t(`prompt_input.sources.${key}`) : source
  }
  const commandRowOf = ({ key, command, name, description }: CommandRow): MenuRowProps => ({
    key,
    label: [{ text: '/', isHit: false }, ...name],
    hint: command.argumentHint,
    detail: description,
    tag: sourceLabel(command.source),
    icon: 'command'
  })
  const mentionRowOf = ({ key, entry, path }: MentionRow): MenuRowProps => ({
    key,
    label: path,
    hint: '',
    detail: entry.isFolder
      ? [{ text: t('prompt_input.folder_files', { n: entry.fileCount }), isHit: false }]
      : [],
    tag: null,
    icon: entry.isFolder ? 'folder' : 'file'
  })

  const sections = computed<MenuSectionProps[]>(() => {
    if (!trigger.value) return []
    if (trigger.value.kind === 'slash')
      return slash.sections.value.map((section) => ({
        title: t(`prompt_input.groups.${section.group}`),
        rows: section.rows.map(commandRowOf)
      }))
    const rows = mention.rows.value.map(mentionRowOf)
    if (!rows.length) return []
    const folder = folderNameOf(toValue(tab).cwd)
    const query = trigger.value.query
    const title = query
      ? t('prompt_input.files_title_query', { folder, query })
      : t('prompt_input.files_title', { folder })
    return [{ title, rows }]
  })
  const rows = computed(() => sections.value.flatMap((section) => section.rows))
  const activeRow = computed(() => rows.value[activeIndex.value] ?? null)
  const isOpen = computed(() => !!trigger.value)
  /** What the menu says instead of rows: still loading, nothing found, and why. */
  const notice = computed(() => {
    const current = trigger.value
    if (!current || rows.value.length) return null
    if (current.kind === 'slash')
      return slash.isWaiting.value
        ? t('prompt_input.commands_waiting')
        : t('prompt_input.no_commands', { query: current.query })
    if (mention.isPending.value) return t('prompt_input.files_loading')
    if (isUnknownOpError(mention.error.value, 'list_files'))
      return t('prompt_input.agentd_outdated', {
        machine: toValue(tab).machine ?? t('chat.this_machine')
      })
    if (mention.isError.value) return t('prompt_input.files_failed')
    return t('prompt_input.no_files', { query: current.query })
  })
  const known = computed(() => new Set([...picked.value, ...mention.known.value]))

  const move = (step: 1 | -1) => {
    const count = rows.value.length
    if (count) activeIndex.value = (activeIndex.value + step + count) % count
  }

  const pick = (key: string, mode: 'complete' | 'run') => {
    const current = trigger.value
    if (!current) return
    if (current.kind === 'mention') {
      picked.value = new Set(picked.value).add(key)
      return onInsert(replaceTrigger(draft.value, current, mentionTextOf(key)))
    }
    if (mode === 'complete') return onInsert(replaceTrigger(draft.value, current, `${key} `))
    onRun(`${key}${draft.value.slice(current.end)}`.trim())
  }

  const dismiss = () => {
    dismissedAt.value = trigger.value?.start ?? null
  }

  /** Whether the menu took the key. */
  const handleKey = (event: KeyboardEvent): boolean => {
    if (!isOpen.value) return false
    const row = activeRow.value
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Escape') {
      dismiss()
    } else if (event.key === 'Tab' && !event.shiftKey && row) {
      pick(row.key, 'complete')
    } else if (event.key === 'Enter' && !event.shiftKey && row) {
      pick(row.key, 'run')
    } else {
      return false
    }
    event.preventDefault()
    return true
  }

  watch(typed, (next) => {
    if (!next) dismissedAt.value = null
  })
  watch(
    () => `${trigger.value?.kind}:${trigger.value?.query}`,
    () => (activeIndex.value = 0)
  )
  // A sent or cleared draft starts the highlight over.
  watch(draft, (text) => {
    if (!text) picked.value = new Set()
  })

  return {
    trigger,
    isOpen,
    sections,
    activeRow,
    notice,
    known,
    isTruncated: mention.isTruncated,
    handleKey,
    pick,
    dismiss
  }
}
