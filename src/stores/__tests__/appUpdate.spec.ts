import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppUpdateStore } from '../appUpdate'

const { find, download, installAndRestart } = vi.hoisted(() => ({
  find: vi.fn(),
  download: vi.fn(),
  installAndRestart: vi.fn()
}))

vi.mock('@/api/services/appUpdate.service', () => ({
  appUpdateService: { find, download, installAndRestart }
}))

const release = {
  version: '0.7.28',
  currentVersion: '0.7.27',
  body: '- Diktieren im Eingabefeld',
  close: vi.fn()
}
const info = { version: '0.7.28', currentVersion: '0.7.27', notes: ['Diktieren im Eingabefeld'] }

describe('useAppUpdateStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    find.mockResolvedValue(release)
    download.mockImplementation(async (_update, onProgress) => {
      onProgress({ downloaded: 50, total: 100 })
    })
  })

  it('should download a found update and open the dialog when updates are automatic', async () => {
    const store = useAppUpdateStore()

    await store.check({ isManual: false })

    expect(store.phase).toEqual({ kind: 'ready', info })
    expect(store.isDialogOpen).toBe(true)
  })

  it('should only announce a found update in the background when updates are by hand', async () => {
    const store = useAppUpdateStore()
    store.isAutomatic = false

    await store.check({ isManual: false })

    expect(store.phase).toEqual({ kind: 'available', info })
    expect(store.isDialogOpen).toBe(false)
    expect(download).not.toHaveBeenCalled()
  })

  it('should call Bull current when GitHub has nothing newer', async () => {
    find.mockResolvedValue(null)
    const store = useAppUpdateStore()

    await store.check({ isManual: true })

    expect(store.phase).toEqual({ kind: 'current' })
  })

  it('should keep the update and the reason when the download fails', async () => {
    download.mockRejectedValue(new Error('error sending request'))
    const store = useAppUpdateStore()

    await store.check({ isManual: false })

    expect(store.phase).toEqual({
      kind: 'failed',
      step: 'download',
      info,
      reason: 'error sending request'
    })
  })

  it('should install the downloaded update on restart', async () => {
    const store = useAppUpdateStore()
    await store.check({ isManual: false })

    await store.restart()

    expect(installAndRestart).toHaveBeenCalledWith(release)
    expect(store.phase).toEqual({ kind: 'installing', info })
  })
})
