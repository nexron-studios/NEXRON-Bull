<script setup lang="ts">
import { CircleAlert, UserRound } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import { Button } from '@/components/ui/button'
import UsageQuotaCard from '@/components/usage/UsageQuotaCard.vue'
import UsageSkeleton from '@/components/usage/UsageSkeleton.vue'
import type { MachineQuota } from '@/utils/quota'

// The quota cards as items of the page's card grid; loading, error and empty take one card's place.
defineProps<{ accounts: MachineQuota[]; isPending: boolean; isError: boolean; now: number }>()
const emit = defineEmits<{ retry: [] }>()

/** Most setups have two accounts; the skeleton shows as many cards. */
const SKELETON_CARDS = 2

const { t } = useI18n()
</script>

<template>
  <template v-if="isPending">
    <UsageSkeleton v-for="card in SKELETON_CARDS" :key="card" kind="quota" />
  </template>
  <div v-else-if="isError" class="motion-shake flex rounded-xl border bg-card">
    <NchEmpty
      size="sm"
      :icon="CircleAlert"
      :title="t('usage.quota_error_title')"
      :hint="t('usage.error_hint')"
    >
      <Button class="motion-press" variant="outline" size="sm" @click="emit('retry')">{{
        t('usage.retry')
      }}</Button>
    </NchEmpty>
  </div>
  <div v-else-if="!accounts.length" class="flex rounded-xl border bg-card">
    <NchEmpty
      size="sm"
      :icon="UserRound"
      :title="t('usage.quota_empty_title')"
      :hint="t('usage.quota_empty_hint')"
    />
  </div>
  <template v-else>
    <UsageQuotaCard
      v-for="(account, index) in accounts"
      :key="`${account.machine ?? ''}:${account.profile}`"
      class="motion-stagger"
      :style="{ '--stagger-index': index }"
      :quota="account"
      :now
    />
  </template>
</template>
