import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import SettingsMachineKeyHelp from '../SettingsMachineKeyHelp.vue'
import i18n from '@/i18n'
import type { MachineEntry } from '@/types/machine.type'

const KEY = 'ssh-ed25519 AAAAC3Nza alex@pc'
const listed = vi.hoisted(() => ({ entries: [] as MachineEntry[] }))

vi.mock('@/api/services/machine.service', () => ({
  machineService: {
    publicKey: vi.fn(async () => KEY),
    list: vi.fn(async () => listed.entries)
  }
}))

const mountHelp = async (entry: MachineEntry, entries: MachineEntry[]) => {
  listed.entries = entries
  const wrapper = mount(SettingsMachineKeyHelp, {
    props: { entry },
    global: {
      plugins: [i18n, createPinia(), [VueQueryPlugin, { queryClient: new QueryClient() }]],
      // The copy button's tooltip needs the app's provider; it is not what these tests look at.
      stubs: { NchIconButton: true }
    }
  })
  await flushPromises()
  return wrapper
}

describe('SettingsMachineKeyHelp', () => {
  it('should offer the Windows line for a machine whose system is not known', async () => {
    const box: MachineEntry = { name: 'box', host: 'box' }
    const wrapper = await mountHelp(box, [box])
    expect(wrapper.find('code').text()).toContain('powershell -NoProfile -Command')
  })

  it('should offer the Mac and Linux line for a machine checked as a Mac before', async () => {
    const mac: MachineEntry = { name: 'mac', host: 'mac.local', os: 'macos' }
    const wrapper = await mountHelp({ name: 'mac', host: 'mac.local' }, [mac])
    expect(wrapper.find('code').text()).toBe(
      `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${KEY}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
    )
  })
})
