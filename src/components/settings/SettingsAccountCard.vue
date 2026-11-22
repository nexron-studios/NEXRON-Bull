<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheck, CircleHelp, LogIn, Star, TriangleAlert } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AccountDot from '@/components/account/AccountDot.vue'
import AccountPlan from '@/components/account/AccountPlan.vue'
import SettingsAccountMenu from '@/components/settings/SettingsAccountMenu.vue'
import SettingsQuotaPair from '@/components/settings/SettingsQuotaPair.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  accountLabelOf,
  accountNameOf,
  folderNameOf,
  type AccountCardProps
} from '@/utils/accountCards'
import type { LoginState } from '@/utils/accountSettings'

// One account Bull offers (Figma "22", "M23"): its login, whether it is logged in, and its
// 5-hour and week quota. Default, colour and removal sit in its menu.
const { card } = defineProps<{ card: AccountCardProps }>()
const emit = defineEmits<{ login: [] }>()

const { t } = useI18n()

const LOGIN_STATE_LOOK: Record<LoginState, { icon: typeof CircleCheck; class: string }> = {
  logged_in: { icon: CircleCheck, class: 'text-good' },
  logged_out: { icon: TriangleAlert, class: 'text-warning' },
  expired: { icon: TriangleAlert, class: 'text-warning' },
  // `checking` shows a skeleton instead.
  checking: { icon: CircleHelp, class: 'text-muted-foreground' },
  unknown: { icon: CircleHelp, class: 'text-muted-foreground' }
}

const look = computed(() => LOGIN_STATE_LOOK[card.loginState])
const needsLogin = computed(() => card.loginState === 'logged_out' || card.loginState === 'expired')
const windows = computed(() => [card.fiveHour, card.week].flatMap((window) => window ?? []))
const name = computed(() => accountNameOf(card.profile))
</script>

<template>
  <!-- Narrow (phone): who on top with the menu beside it, login and switch below. Wide enough,
       everything in one row as in Figma "22". -->
  <article
    class="@container flex flex-col gap-2.5 rounded-xl border border-border bg-card px-4 py-3"
    :aria-label="accountLabelOf(card.profile)"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <AccountDot :account-key="card.accountKey" />
        <div class="flex min-w-0 flex-col gap-0.5">
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span class="truncate font-semibold">{{ name }}</span>
            <AccountPlan v-if="card.plan" :plan="card.plan" />
            <span
              v-if="card.isDefault"
              class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 text-meta leading-5 text-warning"
            >
              <Star class="size-3" aria-hidden="true" />{{ t('settings.accounts.default_badge') }}
            </span>
          </div>
          <span class="truncate font-mono text-meta text-muted-foreground">{{
            folderNameOf(card.profile.dir)
          }}</span>
        </div>
      </div>
      <div
        class="order-3 flex w-full flex-wrap items-center gap-x-3 gap-y-2 @2xl:order-2 @2xl:w-auto @2xl:justify-end"
      >
        <template v-if="card.loginState === 'checking'">
          <Skeleton class="h-4 w-20" />
          <span class="sr-only">{{ t('settings.accounts.login_state.checking') }}</span>
        </template>
        <span
          v-else
          class="inline-flex items-center gap-1.5 text-meta whitespace-nowrap"
          :class="look.class"
        >
          <component :is="look.icon" class="size-3.5" aria-hidden="true" />
          {{ t(`settings.accounts.login_state.${card.loginState}`) }}
        </span>
        <Button v-if="needsLogin" variant="outline" size="sm" @click="emit('login')">
          <LogIn class="size-3.5" aria-hidden="true" />
          {{ t('settings.accounts.relogin') }}
        </Button>
      </div>
      <SettingsAccountMenu :card trigger-class="order-2 @2xl:order-3" @login="emit('login')" />
    </div>
    <div
      v-if="card.loginState === 'logged_in' && windows.length"
      class="flex flex-wrap gap-x-6 gap-y-2"
    >
      <SettingsQuotaPair v-for="window in windows" :key="window.key" :window class="basis-48" />
    </div>
  </article>
</template>
