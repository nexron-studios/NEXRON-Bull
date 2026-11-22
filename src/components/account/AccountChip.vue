<script setup lang="ts">
import AccountDot from '@/components/account/AccountDot.vue'
import AccountPlan from '@/components/account/AccountPlan.vue'

// An account named in a list of accounts (limit order, folder rules): its colour dot, label and plan.
defineProps<{ accountKey: string; label: string; plan?: string | null }>()
</script>

<template>
  <span
    class="inline-flex h-6 max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 text-meta text-muted-foreground"
  >
    <AccountDot :account-key="accountKey" />
    <span class="truncate">{{ label }}</span>
    <AccountPlan v-if="plan" :plan class="last:-mr-1" />
    <slot />
  </span>
</template>
