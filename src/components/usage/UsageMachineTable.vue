<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMachineNames } from '@/composables/useMachineNames'
import UsageSeriesKey from '@/components/usage/UsageSeriesKey.vue'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { modelFamilyList } from '@/types/agentd.type'
import type { MachineTokens } from '@/utils/usage'

const { machines } = defineProps<{ machines: MachineTokens[] }>()

const { t } = useI18n()
const { nameOf } = useMachineNames()
const format = useUsageFormat()

// The `other` column only when some machine used a model outside the three families.
const families = computed(() =>
  modelFamilyList.filter((family) => family !== 'other' || machines.some((m) => m.byFamily.other))
)
</script>

<template>
  <section class="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 sm:p-5">
    <h2 class="text-body font-semibold">{{ t('usage.by_machine') }}</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-small tabular-nums">
        <thead>
          <tr class="border-b text-left text-meta text-muted-foreground">
            <th scope="col" class="py-2 pr-3 font-normal">{{ t('usage.machine') }}</th>
            <th v-for="family in families" :key="family" scope="col" class="py-2 pr-3 font-normal">
              <span class="flex items-center gap-1.5">
                <UsageSeriesKey :family />{{ t(`usage.models.${family}`) }}
              </span>
            </th>
            <th scope="col" class="py-2 text-right font-normal">{{ t('usage.total') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in machines" :key="row.machine ?? ''" class="border-b last:border-b-0">
            <th scope="row" class="max-w-40 truncate py-2.5 pr-3 text-left font-normal">
              {{ nameOf(row.machine) }}
            </th>
            <td v-for="family in families" :key="family" class="py-2.5 pr-3">
              {{ format.compact(row.byFamily[family]) }}
            </td>
            <td class="py-2.5 text-right font-medium">{{ format.compact(row.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
