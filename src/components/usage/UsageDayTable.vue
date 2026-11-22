<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUsageFormat } from '@/composables/useUsageFormat'
import type { ModelFamily } from '@/types/agentd.type'
import type { DayTokens } from '@/utils/usage'

// Every value of the chart as a table for screen readers, so none is reachable only by
// hovering a bar.
defineProps<{ days: DayTokens[]; families: ModelFamily[]; caption: string }>()

const { t } = useI18n()
const format = useUsageFormat()
</script>

<template>
  <!-- The wrapper hides it: a table ignores the 1 px box of sr-only and widened the page. -->
  <div class="sr-only">
    <table>
      <caption>
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ t('usage.day') }}</th>
          <th v-for="family in families" :key="family" scope="col">
            {{ t(`usage.models.${family}`) }}
          </th>
          <th scope="col">{{ t('usage.total') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="day in days" :key="day.day">
          <th scope="row">{{ format.dayLong(day.day) }}</th>
          <td v-for="family in families" :key="family">
            {{ format.compact(day.byFamily[family]) }}
          </td>
          <td>{{ format.compact(day.total) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
