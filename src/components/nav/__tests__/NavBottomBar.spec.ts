import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import NavBottomBar from '../NavBottomBar.vue'
import i18n from '@/i18n'

const Empty = defineComponent({ render: () => null })

const mountAt = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: Empty },
      { path: '/overview', name: 'overview', component: Empty },
      { path: '/usage', name: 'usage', component: Empty },
      { path: '/settings', name: 'settings', component: Empty },
      { path: '/elsewhere', name: 'elsewhere', component: Empty }
    ]
  })
  await router.push(path)
  return mount(NavBottomBar, { global: { plugins: [i18n, router] } })
}

describe('NavBottomBar', () => {
  it('should slide the marker under the current page', async () => {
    const marker = (await mountAt('/usage')).find('[data-testid="nav-marker"]')
    expect(marker.attributes('style')).toContain('transform: translateX(200%)')
    expect(marker.attributes('style')).toContain('width: 25%')
  })

  it('should put the marker under settings on a settings screen', async () => {
    const marker = (await mountAt('/settings')).find('[data-testid="nav-marker"]')
    expect(marker.attributes('style')).toContain('transform: translateX(300%)')
  })

  it('should fade the marker out on a page without a tab', async () => {
    const marker = (await mountAt('/elsewhere')).find('[data-testid="nav-marker"]')
    expect(marker.classes()).toContain('opacity-0')
  })
})
