import { describe, expect, it, vi } from 'vitest'
import BrandToastIcon from '@/components/brand/BrandToastIcon.vue'
import { toast } from '../toast'

const { sonnerToast } = vi.hoisted(() => ({
  sonnerToast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() })
}))
vi.mock('vue-sonner', () => ({ toast: sonnerToast }))

describe('toast', () => {
  it('should give a plain toast the bull icon', () => {
    toast('Exportiert', { description: 'Nichts zu exportieren' })

    expect(sonnerToast).toHaveBeenCalledWith('Exportiert', {
      icon: BrandToastIcon,
      description: 'Nichts zu exportieren'
    })
  })

  it('should keep an icon the caller brings', () => {
    const own = { name: 'OwnIcon' }

    toast('Hallo', { icon: own })

    expect(sonnerToast).toHaveBeenCalledWith('Hallo', { icon: own })
  })

  it('should pass typed toasts through unchanged, since the Toaster draws their icon', () => {
    toast.error('Fehlgeschlagen', { description: 'Netz weg' })

    expect(sonnerToast.error).toHaveBeenCalledWith('Fehlgeschlagen', { description: 'Netz weg' })
  })
})

describe('toast.message', () => {
  it('should give the bull to a message toast, which Sonner draws untyped too', () => {
    toast.message('Exportiert')

    expect(sonnerToast.message).toHaveBeenCalledWith('Exportiert', { icon: BrandToastIcon })
  })

  it('should fall back to the bull when the caller passes no icon after all', () => {
    toast.message('Hallo', { icon: undefined })

    expect(sonnerToast.message).toHaveBeenCalledWith('Hallo', { icon: BrandToastIcon })
  })
})
