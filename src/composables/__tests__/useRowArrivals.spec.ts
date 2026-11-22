import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useRowArrivals } from '../useRowArrivals'

describe('useRowArrivals', () => {
  it('should stagger only rows added after the mount, counting from the first of them', () => {
    const keys = ref(['read', 'edit'])
    const { staggerIndexOf } = useRowArrivals(keys)

    keys.value = [...keys.value, 'bash', 'grep']

    expect(['read', 'edit', 'bash', 'grep'].map(staggerIndexOf)).toEqual([null, null, 0, 1])
  })

  it('should stagger every row of a list that enters as a whole', () => {
    const { staggerIndexOf } = useRowArrivals(['read', 'edit'], true)

    expect(['read', 'edit'].map(staggerIndexOf)).toEqual([0, 1])
  })

  it('should treat a row that left and came back as an arrival', async () => {
    const keys = ref(['tests'])
    const { staggerIndexOf } = useRowArrivals(keys)

    keys.value = []
    await nextTick()
    keys.value = ['tests']

    expect(staggerIndexOf('tests')).toBe(0)
  })

  it('should count rows revealed after settling from zero', () => {
    const keys = ref<string[]>(['a', 'b'])
    const { staggerIndexOf, settle } = useRowArrivals(keys, true)

    settle()
    keys.value = ['a', 'b', 'c', 'd']

    expect(['a', 'b', 'c', 'd'].map(staggerIndexOf)).toEqual([null, null, 0, 1])
  })
})
