import { shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useMutationObserver } from '@vueuse/core'
import { stuckIndexOf } from '@/utils/stickyHeading'

/**
 * The section of a scroll area whose sticky heading is stuck to the top: the `data-section` value
 * of one of its direct children, or null while the area rests at its start. Found again on scroll
 * and whenever the content changes, because a row moving between sections shifts them without a
 * scroll. The sections' offset parent must be the scrolling element (positioned), so their offsets
 * are measured from its top; the area may be that element or an unpositioned wrapper inside it.
 */
export const useStuckSection = (
  scroller: MaybeRefOrGetter<HTMLElement | null | undefined>,
  scrollTop: MaybeRefOrGetter<number>
) => {
  const stuckSection = shallowRef<string | null>(null)

  const findStuckSection = () => {
    const sections = [
      ...(toValue(scroller)?.querySelectorAll<HTMLElement>(':scope > [data-section]') ?? [])
    ]
    const index = stuckIndexOf(
      sections.map((section) => section.offsetTop),
      toValue(scrollTop)
    )
    stuckSection.value = index < 0 ? null : (sections[index].dataset.section ?? null)
  }

  watch(() => toValue(scrollTop), findStuckSection)
  useMutationObserver(scroller, findStuckSection, { childList: true, subtree: true })

  return stuckSection
}
