<script setup lang="ts">
import { computed, ref } from 'vue'
import { Info, Plus } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { toast } from '@/lib/toast'
import AccountChip from '@/components/account/AccountChip.vue'
import SettingsLimitRuleDialog from '@/components/settings/SettingsLimitRuleDialog.vue'
import SettingsLimitRuleMenu from '@/components/settings/SettingsLimitRuleMenu.vue'
import { Button } from '@/components/ui/button'
import { fetchRecent, recentKey } from '@/composables/useAgentdCatalog'
import { usePerMachineQueries } from '@/composables/usePerMachineQueries'
import { useLimitPolicyStore } from '@/stores/limitPolicy'
import type { FolderRuleProps } from '@/types/agentd.type'
import {
  accountKeyOfLabel,
  folderSuggestionsOf,
  ruleFallbackOf,
  type LimitAccount
} from '@/utils/limitPolicy'

// Which accounts the chats of a folder may move between (Figma "27", "M27"). Folders without a
// rule may use every account; the last row says so and cannot be changed.
const { accounts, isPhone = false } = defineProps<{
  accounts: LimitAccount[]
  isPhone?: boolean
}>()

const isDialogOpen = ref(false)
const editingRule = ref<FolderRuleProps | null>(null)

const { t } = useI18n()
const store = useLimitPolicyStore()
const { policy } = storeToRefs(store)

const RECENT_STALE_TIME_MS = 60 * 1000
// The sidebar reads the same cache; a folder opened a minute ago is offered all the same.
const recent = usePerMachineQueries((machine) => ({
  queryKey: recentKey(machine),
  queryFn: () => fetchRecent(machine),
  staleTime: RECENT_STALE_TIME_MS,
  refetchInterval: () => false
}))

const suggestions = computed(() =>
  folderSuggestionsOf(
    recent.answers.value.flatMap(({ data }) => data.map((session) => session.cwd)),
    policy.value.rules
  )
)
const rows = computed(() =>
  policy.value.rules.map((rule) => ({
    rule,
    chips: rule.accounts.map((label) => ({
      label,
      accountKey: accountKeyOfLabel(accounts, label)
    })),
    fallback: ruleFallbackOf(rule.accounts.length, policy.value.mode)
  }))
)
const otherFallback = computed(() => ruleFallbackOf(accounts.length, policy.value.mode))

const openDialog = (rule: FolderRuleProps | null) => {
  editingRule.value = rule
  isDialogOpen.value = true
}

// Undo instead of a confirmation: a rule is quick to remove and quick to bring back.
const remove = (rule: FolderRuleProps) => {
  store.removeRule(rule.folder)
  toast(t('settings.limits.rule_removed', { folder: rule.folder }), {
    action: { label: t('global.undo'), onClick: () => store.saveRule(rule, null) }
  })
}
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    aria-labelledby="limit-rules"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="limit-rules" class="text-small font-semibold">
        {{ t('settings.limits.rules_title') }}
      </h2>
      <Button variant="outline" size="sm" aria-haspopup="dialog" @click="openDialog(null)">
        <Plus class="size-4" aria-hidden="true" />
        {{ t('settings.limits.rule_add') }}
      </Button>
    </div>

    <ul v-if="isPhone" class="flex flex-col">
      <li
        v-for="row in rows"
        :key="row.rule.folder"
        class="flex min-h-11 items-center gap-2 border-b border-border py-1"
      >
        <span class="min-w-0 flex-1 truncate font-mono text-meta">{{ row.rule.folder }}</span>
        <span class="flex min-w-0 flex-wrap justify-end gap-1">
          <AccountChip v-for="chip in row.chips" :key="chip.label" v-bind="chip" />
        </span>
        <SettingsLimitRuleMenu
          :folder="row.rule.folder"
          @edit="openDialog(row.rule)"
          @remove="remove(row.rule)"
        />
      </li>
      <li class="flex min-h-11 items-center gap-2 py-1 text-meta text-muted-foreground">
        <span class="min-w-0 flex-1">{{ t('settings.limits.other_folders') }}</span>
        <span>{{ t('settings.limits.any_account') }}</span>
      </li>
    </ul>

    <table v-else class="w-full table-fixed text-small">
      <thead>
        <tr class="border-b border-border text-left text-meta text-muted-foreground">
          <th scope="col" class="w-[30%] py-2 pr-3 font-normal">
            {{ t('settings.limits.column_folder') }}
          </th>
          <th scope="col" class="w-[38%] py-2 pr-3 font-normal">
            {{ t('settings.limits.column_accounts') }}
          </th>
          <th scope="col" class="py-2 pr-3 font-normal">
            {{ t('settings.limits.column_fallback') }}
          </th>
          <th scope="col" class="w-10 py-2">
            <span class="sr-only">{{ t('settings.limits.column_actions') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.rule.folder" class="border-b border-border">
          <td class="truncate py-2.5 pr-3 font-mono">{{ row.rule.folder }}</td>
          <td class="py-2.5 pr-3">
            <span class="flex flex-wrap gap-1.5">
              <AccountChip v-for="chip in row.chips" :key="chip.label" v-bind="chip" />
            </span>
          </td>
          <td class="py-2.5 pr-3">{{ t(`settings.limits.fallbacks.${row.fallback}`) }}</td>
          <td class="py-1.5 text-right">
            <SettingsLimitRuleMenu
              :folder="row.rule.folder"
              @edit="openDialog(row.rule)"
              @remove="remove(row.rule)"
            />
          </td>
        </tr>
        <tr class="border-b border-border">
          <td class="py-2.5 pr-3 text-muted-foreground">
            {{ t('settings.limits.other_folders') }}
          </td>
          <td class="py-2.5 pr-3">{{ t('settings.limits.any_account_ordered') }}</td>
          <td class="py-2.5 pr-3">{{ t(`settings.limits.fallbacks.${otherFallback}`) }}</td>
          <td />
        </tr>
      </tbody>
    </table>

    <p class="flex items-start gap-2 text-meta text-muted-foreground">
      <Info class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {{ t('settings.limits.rules_hint') }}
    </p>

    <SettingsLimitRuleDialog
      v-model:open="isDialogOpen"
      :rule="editingRule"
      :rules="policy.rules"
      :accounts
      :suggestions
      @save="store.saveRule"
    />
  </section>
</template>
