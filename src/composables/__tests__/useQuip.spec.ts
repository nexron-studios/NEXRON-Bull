import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useQuip } from '../useQuip'
import { QUIP_INTERVAL_MS, quipPoolOf, type QuipMood } from '@/utils/quips'

const mountQuip = (mood: Ref<QuipMood | null>, now: Ref<Date>) => {
  const result: { quip: Readonly<Ref<string | null>> | null } = { quip: null }
  mount(
    defineComponent({
      setup: () => {
        result.quip = useQuip(mood, false, now).quip
        return () => null
      }
    })
  )
  if (!result.quip) throw new Error('useQuip did not run')
  return result.quip
}

describe('useQuip', () => {
  it('should show a quip from the mood right away', () => {
    const quip = mountQuip(ref<QuipMood | null>('writing'), ref(new Date(0)))
    expect(quipPoolOf('writing', false)).toContain(quip.value)
  })

  it('should drop the quip at once when the mood goes away', async () => {
    const mood = ref<QuipMood | null>('working')
    const quip = mountQuip(mood, ref(new Date(0)))

    mood.value = null
    await nextTick()
    expect(quip.value).toBe(null)
  })

  it('should show a new quip once the clock passed the interval', async () => {
    const now = ref(new Date(0))
    const quip = mountQuip(ref<QuipMood | null>('writing'), now)
    const first = quip.value

    now.value = new Date(QUIP_INTERVAL_MS)
    await nextTick()
    expect(quip.value).not.toBe(first)
  })
})
