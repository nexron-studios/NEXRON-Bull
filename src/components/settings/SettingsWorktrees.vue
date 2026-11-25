<script setup lang="ts">
import { computed, ref } from 'vue'
import { FolderOpen, GitBranch, GitMerge, Monitor } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import SettingsSectionHeader from '@/components/settings/SettingsSectionHeader.vue'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useMachines } from '@/composables/useAgentdCatalog'
import { useMachineNames } from '@/composables/useMachineNames'
import { useWorktreeSettingsStore } from '@/stores/worktreeSettings'
import { isFullPath } from '@/utils/worktree'

// Where each machine puts the worktrees of new chats, and how they are named. A path is per
// machine: one on this PC means nothing on a server. Empty leaves it to agentd's default.
const { isPhone = false } = defineProps<{ isPhone?: boolean }>()

/** This PC and usually one other machine while the list loads. */
const MACHINE_SKELETON_ROWS = 2

const { t } = useI18n()
const { nameOf } = useMachineNames()
const machines = useMachines()
const settings = useWorktreeSettingsStore()

/** Machines whose typed folder was refused: agentd would look a relative one up from its own. */
const refusedRoots = ref(new Set<string>())

const rows = computed(() => [null, ...(machines.data.value ?? [])])
// The example follows this PC's own folder once one is set.
const exampleFolder = computed(() => {
  const slug = t('settings.worktrees.example_slug')
  const root = settings.rootOf(null)
  return root
    ? t('settings.worktrees.example_folder_in', { root, slug })
    : t('settings.worktrees.example_folder_default', { slug })
})

const save = (machine: string | null, event: Event) => {
  if (!(event.target instanceof HTMLInputElement)) return
  const root = event.target.value.trim()
  const refused = new Set(refusedRoots.value)
  if (root && !isFullPath(root)) {
    refusedRoots.value = refused.add(machine ?? '')
    return
  }
  refused.delete(machine ?? '')
  refusedRoots.value = refused
  settings.setRoot(machine, root)
}
</script>

<template>
  <SettingsSectionHeader
    :title="t('settings.sections.worktrees')"
    :description="t('settings.worktrees.description')"
    :is-phone
  />
  <section
    class="grid grid-cols-1 gap-5 rounded-xl border border-border bg-card p-4 @4xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] @4xl:gap-6"
    :aria-label="t('settings.sections.worktrees')"
  >
    <div class="flex max-w-xl min-w-0 flex-col gap-4 @4xl:max-w-none">
      <div class="flex flex-col gap-1">
        <h2 class="text-small font-semibold">{{ t('settings.worktrees.root') }}</h2>
        <p class="text-meta text-muted-foreground">{{ t('settings.worktrees.root_hint') }}</p>
      </div>
      <template v-if="machines.isPending.value">
        <Skeleton v-for="row in MACHINE_SKELETON_ROWS" :key="row" class="h-14 w-full" />
      </template>
      <div v-for="machine in rows" v-else :key="machine ?? ''" class="flex flex-col gap-1.5">
        <label
          :for="`worktree-root-${machine ?? ''}`"
          class="flex items-center gap-2 text-small font-medium"
        >
          <Monitor class="size-4 text-muted-foreground" aria-hidden="true" />
          {{ nameOf(machine) }}
        </label>
        <Input
          :id="`worktree-root-${machine ?? ''}`"
          :default-value="settings.rootOf(machine)"
          :placeholder="t('settings.worktrees.root_placeholder')"
          name="worktree-root"
          autocomplete="off"
          spellcheck="false"
          class="font-mono"
          :aria-invalid="refusedRoots.has(machine ?? '')"
          :aria-describedby="`worktree-root-error-${machine ?? ''}`"
          @change="save(machine, $event)"
        />
        <p
          v-if="refusedRoots.has(machine ?? '')"
          :id="`worktree-root-error-${machine ?? ''}`"
          class="text-meta text-destructive"
          role="alert"
        >
          {{ t('settings.worktrees.root_not_full') }}
        </p>
      </div>
    </div>
    <!-- What a new chat makes, as an example: the scheme reads faster than its description. -->
    <div class="flex min-w-0 flex-col gap-3 rounded-lg bg-muted/60 p-4">
      <h2 class="text-small font-semibold">{{ t('settings.worktrees.example_title') }}</h2>
      <p class="text-meta text-muted-foreground">{{ t('settings.worktrees.example_prompt') }}</p>
      <dl class="flex flex-col gap-2 text-small">
        <div class="flex items-start gap-2">
          <FolderOpen class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dt class="sr-only">{{ t('settings.worktrees.example_folder') }}</dt>
          <dd class="min-w-0 font-mono break-all">{{ exampleFolder }}</dd>
        </div>
        <div class="flex items-start gap-2">
          <GitBranch class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dt class="sr-only">{{ t('settings.worktrees.example_branch') }}</dt>
          <dd class="min-w-0 font-mono break-all">
            {{
              t('settings.worktrees.example_branch_value', {
                slug: t('settings.worktrees.example_slug')
              })
            }}
          </dd>
        </div>
        <div class="flex items-start gap-2">
          <GitMerge class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dt class="sr-only">{{ t('settings.worktrees.example_preview') }}</dt>
          <dd class="min-w-0">{{ t('settings.worktrees.example_merge') }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>
