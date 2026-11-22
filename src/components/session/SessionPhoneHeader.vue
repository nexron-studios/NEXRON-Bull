<script setup lang="ts">
import { ChevronLeft, Plus, Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import SessionSearchField from '@/components/session/SessionSearchField.vue'

// Top bar of the phone home screen (Figma "M01"/"M02"): bull and wordmark, search, new session.
// Searching swaps the whole bar for the field, with a way back.
const emit = defineEmits<{ new: []; closeSearch: [] }>()

const isSearchOpen = defineModel<boolean>('searchOpen', { required: true })
const query = defineModel<string>('query', { required: true })

const { t } = useI18n()
</script>

<template>
  <div class="flex h-14 shrink-0 items-center gap-2 border-b border-border pr-3 pl-4">
    <template v-if="isSearchOpen">
      <NchIconButton
        :label="t('sidebar.close_search')"
        class="-ml-2 size-11 shrink-0"
        @click="emit('closeSearch')"
      >
        <ChevronLeft class="size-5" aria-hidden="true" />
      </NchIconButton>
      <SessionSearchField v-model="query" has-icon @close="emit('closeSearch')" />
    </template>
    <template v-else>
      <span
        class="flex min-w-0 flex-1 items-center gap-2 font-wordmark text-title leading-none whitespace-nowrap uppercase select-none"
      >
        <BrandBullLogo :size="26" />
        {{ t('global.app_name') }}
      </span>
      <NchIconButton :label="t('sidebar.search')" class="size-11" @click="isSearchOpen = true">
        <Search class="size-5" aria-hidden="true" />
      </NchIconButton>
      <NchIconButton
        :label="t('sidebar.new_session')"
        class="size-10 bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover hover:text-brand-foreground"
        @click="emit('new')"
      >
        <Plus class="size-5" aria-hidden="true" />
      </NchIconButton>
    </template>
  </div>
</template>
