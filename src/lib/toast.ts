import { markRaw } from 'vue'
import { toast as sonnerToast } from 'vue-sonner'
import BrandToastIcon from '@/components/brand/BrandToastIcon.vue'

const BULL_ICON = markRaw(BrandToastIcon)

type ToastCall = typeof sonnerToast.message

// Sonner draws an icon only for typed toasts (success, error …), which the Toaster's slots give
// the bull. A plain toast has none unless it brings one, so this wrapper brings the bull.
const withBull =
  (show: ToastCall): ToastCall =>
  (message, data) =>
    show(message, { ...data, icon: data?.icon ?? BULL_ICON })

/** Sonner's `toast`, with the bull on plain toasts too. Import this, never `vue-sonner`. */
export const toast = Object.assign(withBull(sonnerToast), sonnerToast, {
  message: withBull(sonnerToast.message)
})
