import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UsageDayChart from '../UsageDayChart.vue'
import i18n from '@/i18n'
import type { DayTokens } from '@/utils/usage'

const day = (key: string, opus: number, sonnet: number): DayTokens => ({
  day: key,
  byFamily: { opus, sonnet, haiku: 0, other: 0 },
  total: opus + sonnet
})

const withSonnet = [day('2026-11-15', 100, 20), day('2026-11-16', 80, 0)]
const withoutSonnet = [day('2026-11-15', 100, 0), day('2026-11-16', 80, 0)]

const mountChart = (days: DayTokens[]) =>
  mount(UsageDayChart, {
    props: { days },
    global: { plugins: [i18n], stubs: { UsageDayPlot: true } }
  })

const pressedOf = (wrapper: ReturnType<typeof mountChart>) =>
  wrapper.find('[aria-pressed="true"]').text()

describe('UsageDayChart', () => {
  it('should hand the chart back to all models for good when the chosen one drops out', async () => {
    i18n.global.locale.value = 'de'
    const wrapper = mountChart(withSonnet)
    const sonnet = wrapper.findAll('[aria-pressed]').filter((button) => button.text() === 'Sonnet')
    await sonnet[0].trigger('click')

    await wrapper.setProps({ days: withoutSonnet })
    await wrapper.setProps({ days: withSonnet })

    expect(pressedOf(wrapper)).toBe('Alle')
  })
})
