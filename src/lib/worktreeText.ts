import i18n from '@/i18n'
import type { AgentdEvent } from '@/types/agentd.type'
import { refusalPhraseOf, type Phrase } from '@/utils/worktree'

type Refusal = Pick<Extract<AgentdEvent, { type: 'worktree_refused' }>, 'kind' | 'message'>

export const say = ({ key, params, count }: Phrase): string =>
  count === undefined ? i18n.global.t(key, params) : i18n.global.t(key, params, count)

/** A chat whose worktree was refused at its start: why, and where its next message goes. */
export const startRefusalNoticeOf = (refusal: Refusal): string =>
  `${say(refusalPhraseOf(refusal))} ${i18n.global.t('worktree.starts_in_folder')}`
