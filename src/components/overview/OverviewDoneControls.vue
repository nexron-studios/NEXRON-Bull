<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpDown, Filter, Monitor, Search, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  ALL_FILTER,
  LOCAL_MACHINE_FILTER,
  finishedSortList,
  type FinishedSort
} from '@/utils/finishedList'

// The toolbar of the "done" list: search, account and machine, order. A filter with a single
// choice says nothing, so it hides until the list holds a second account or machine.
const { accounts, machines } = defineProps<{ accounts: string[]; machines: string[] }>()

const search = defineModel<string>('search', { required: true })
const account = defineModel<string>('account', { required: true })
const machine = defineModel<string>('machine', { required: true })
const sort = defineModel<FinishedSort>('sort', { required: true })

const MIN_FILTER_CHOICES = 2

const { t } = useI18n()

const hasAccountFilter = computed(
  () => accounts.length >= MIN_FILTER_CHOICES || account.value !== ALL_FILTER
)
const hasMachineFilter = computed(
  () => machines.length >= MIN_FILTER_CHOICES || machine.value !== ALL_FILTER
)
const machineLabelOf = (value: string) =>
  value === LOCAL_MACHINE_FILTER ? t('chat.this_machine') : value
</script>

<template>
  <!-- The search keeps a readable width; on a wide page the filters move to the far end instead
       of the field stretching over the whole list (layout.md, move 4). -->
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative max-w-md min-w-48 flex-1">
      <Search
        class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        v-model="search"
        type="search"
        name="done-search"
        autocomplete="off"
        class="pr-9 pl-8 pointer-coarse:h-10 [&::-webkit-search-cancel-button]:hidden"
        :aria-label="t('overview.done_controls.search_label')"
        :placeholder="t('overview.done_controls.search_placeholder')"
        @keydown.esc="search = ''"
      />
      <NchIconButton
        v-if="search"
        :label="t('overview.done_controls.clear_search')"
        class="absolute top-1/2 right-0.5 size-7 -translate-y-1/2"
        @click="search = ''"
      >
        <X aria-hidden="true" />
      </NchIconButton>
    </div>
    <div class="flex flex-wrap items-center gap-2 @2xl:ml-auto">
      <Select v-if="hasAccountFilter" v-model="account">
        <SelectTrigger
          class="touch-manipulation pointer-coarse:h-10"
          :aria-label="t('overview.done_controls.account_label')"
        >
          <Filter class="text-muted-foreground" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_FILTER">{{ t('overview.done_controls.any_account') }}</SelectItem>
          <SelectItem v-for="name in accounts" :key="name" :value="name">{{ name }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-if="hasMachineFilter" v-model="machine">
        <SelectTrigger
          class="touch-manipulation pointer-coarse:h-10"
          :aria-label="t('overview.done_controls.machine_label')"
        >
          <Monitor class="text-muted-foreground" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_FILTER">{{ t('overview.done_controls.any_machine') }}</SelectItem>
          <SelectItem v-for="value in machines" :key="value" :value>
            {{ machineLabelOf(value) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="sort">
        <SelectTrigger
          class="touch-manipulation pointer-coarse:h-10"
          :aria-label="t('overview.done_controls.sort_label')"
        >
          <ArrowUpDown class="text-muted-foreground" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="value in finishedSortList" :key="value" :value>
            {{ t(`overview.done_controls.sorts.${value}`) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
