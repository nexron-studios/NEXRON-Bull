import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import SessionChatName from '../SessionChatName.vue'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'

const { writeText, toastSuccess } = vi.hoisted(() => ({
  writeText: vi.fn(() => Promise.resolve()),
  toastSuccess: vi.fn()
}))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText }))
vi.mock('vue-sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))
// Copies the way the app window does; the browser's fallback is `navigator.clipboard`.
vi.mock('@/lib/platform', () => ({ isDesktopApp: () => true }))

const SESSION_ID = '1a87c3f0-5b2e-4d19-9c6a-0e7f3b2d4a11'

// Inside a row button like the sidebar's: a click on the name must not open the chat.
const mountInRow = () => {
  const onOpen = vi.fn()
  const Row = defineComponent({
    setup: () => () =>
      h(TooltipProvider, () =>
        h('button', { type: 'button', onClick: onOpen }, [
          h(SessionChatName, { cwd: 'C:\\work\\nexron-chat', sessionId: SESSION_ID })
        ])
      )
  })
  return { wrapper: mount(Row, { global: { plugins: [i18n] } }), onOpen }
}

describe('SessionChatName', () => {
  it('should show the folder with the first four characters of the ID', () => {
    const { wrapper } = mountInRow()

    expect(wrapper.text()).toBe('nexron-chat-1a87')
  })

  it('should copy the full session ID on a click without opening the row', async () => {
    i18n.global.locale.value = 'de'
    const { wrapper, onOpen } = mountInRow()

    await wrapper.find('button > span').trigger('click')

    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Kopiert'))
    expect(writeText).toHaveBeenCalledWith(SESSION_ID)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
