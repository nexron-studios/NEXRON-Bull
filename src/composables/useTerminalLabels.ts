import { useI18n } from 'vue-i18n'
import type { TerminalEntry } from '@/utils/terminalEntry'
import { folderNameOf } from '@/utils/sessionList'

/** How a terminal names itself in the tab bar, the drawer and its own bar. */
export const useTerminalLabels = () => {
  const { t } = useI18n()

  /** The request's title, else the folder, else the machine whose home it opened in. */
  const titleOf = (entry: TerminalEntry): string =>
    entry.title ||
    folderNameOf(entry.cwd) ||
    (entry.machine ? t('terminal.home_on', { machine: entry.machine }) : t('terminal.home'))

  const shellLabelOf = (entry: TerminalEntry): string => {
    if (entry.machine) return t('terminal.ssh', { machine: entry.machine })
    return entry.shell ? t(`settings.terminal.shells.${entry.shell}`) : t('terminal.starting')
  }

  /** "PowerShell 1", "PowerShell 2": how the drawer tells its terminals apart. */
  const drawerLabelOf = (entry: TerminalEntry, index: number): string => {
    if (entry.title) return entry.title
    const shell = entry.machine
      ? entry.machine
      : entry.shell
        ? t(`terminal.shells_short.${entry.shell}`)
        : t('terminal.title')
    return t('terminal.drawer_tab', { shell, number: index + 1 })
  }

  /** Where the shell runs, for the bar: the folder, or the home folder by name. */
  const pathOf = (entry: TerminalEntry): string => entry.cwd || t('terminal.home')

  return { titleOf, shellLabelOf, drawerLabelOf, pathOf }
}
