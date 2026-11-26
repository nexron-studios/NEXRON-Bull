import { markRaw } from 'vue'
import { toast as sonnerToast } from 'vue-sonner'
import BrandToastIcon from '@/components/brand/BrandToastIcon.vue'

const BULL_ICON = markRaw(BrandToastIcon)

// Sonner draws an icon only for typed toasts (success, error …), which the Toaster's slots give
// the bull. A plain toast has none unless it brings one, so this wrapper brings the bull.
const plainToast = (...[message, data]: Parameters<typeof sonnerToast>) =>
  sonnerToast(message, { icon: BULL_ICON, ...data })

/** Sonner's `toast`, with the bull on plain toasts too. Import this, never `vue-sonner`. */
export const toast = Object.assign(plainToast, sonnerToast)
