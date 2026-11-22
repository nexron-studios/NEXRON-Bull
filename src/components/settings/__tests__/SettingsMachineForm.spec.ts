import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SettingsMachineForm from '../SettingsMachineForm.vue'
import i18n from '@/i18n'
import type { MachineEntry } from '@/types/machine.type'

vi.mock('@/api/services/machine.service', () => ({
  machineService: { suggestions: vi.fn(async () => []) }
}))

const SERVER: MachineEntry = { name: 'nexron-server', host: 'nexron-server' }

const mountForm = async (props: {
  initial: MachineEntry | null
  takenNames: string[]
  keptName?: string | null
}) => {
  const wrapper = mount(SettingsMachineForm, {
    props,
    global: { plugins: [i18n, [VueQueryPlugin, { queryClient: new QueryClient() }]] }
  })
  await flushPromises()
  return wrapper
}

describe('SettingsMachineForm', () => {
  it('should keep the own name of a listed machine when its address changes', async () => {
    const wrapper = await mountForm({ initial: SERVER, takenNames: [], keptName: SERVER.name })
    await wrapper.find('#machine-host').setValue('10.0.0.5')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('check')).toEqual([[{ name: 'nexron-server', host: '10.0.0.5' }]])
  })

  it('should not stop a listed machine on a name it does not ask for', async () => {
    const wrapper = await mountForm({
      initial: SERVER,
      takenNames: ['box'],
      keptName: SERVER.name
    })
    await wrapper.find('#machine-host').setValue('box')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('check')).toEqual([[{ name: 'nexron-server', host: 'box' }]])
  })

  it('should refuse a new machine named like another one', async () => {
    const wrapper = await mountForm({ initial: null, takenNames: ['Workstation'] })
    await wrapper.find('#machine-host').setValue('10.0.0.5')
    await wrapper.find('#machine-name').setValue('workstation')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('check')).toBeUndefined()
  })
})
