import type { OfferedMode, PermissionMode } from '@/utils/chatTab'
import type { Effort, ModelAlias } from '@/utils/sessionSettings'

/**
 * What a new chat starts with unless picked otherwise in the dialog (20.11.2026): Opus on
 * high, in Auto. The alias, not a version, so a newer Opus takes over without a change here.
 */
export const NEW_CHAT_DEFAULTS = {
  model: 'opus',
  effort: 'high',
  permissionMode: 'auto'
} as const satisfies { model: ModelAlias; effort: Effort; permissionMode: OfferedMode }

export interface NewChatSettings {
  model: string | null
  effort: Effort | null
  permissionMode: PermissionMode | null
}

/**
 * The settings a chat starts with for the dialog's choices; `null` leaves it to the account. The
 * effort belongs to the default model only, another model keeps its own default.
 */
export const newChatSettingsOf = (
  model: string | null,
  permissionMode: PermissionMode | null
): NewChatSettings => ({
  model,
  effort: model === NEW_CHAT_DEFAULTS.model ? NEW_CHAT_DEFAULTS.effort : null,
  permissionMode
})
