<script setup lang="ts">
import { Ellipsis, Pencil, Trash2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

// The "…" of a folder rule: change it or remove it.
defineProps<{ folder: string }>()
const emit = defineEmits<{ edit: []; remove: [] }>()

const { t } = useI18n()
</script>

<template>
  <DropdownMenu :modal="false">
    <DropdownMenuTrigger as-child>
      <NchIconButton
        :label="t('settings.limits.rule_menu', { folder })"
        size="icon-sm"
        class="pointer-coarse:size-11"
      >
        <Ellipsis class="size-4" aria-hidden="true" />
      </NchIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-auto min-w-40">
      <DropdownMenuItem @select="emit('edit')">
        <Pencil aria-hidden="true" />
        {{ t('settings.limits.rule_edit') }}
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" @select="emit('remove')">
        <Trash2 aria-hidden="true" />
        {{ t('settings.limits.rule_remove') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
