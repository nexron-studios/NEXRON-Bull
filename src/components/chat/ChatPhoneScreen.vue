<script setup lang="ts">
import { ref } from 'vue'
import ChatPane from '@/components/chat/ChatPane.vue'
import ChatPhoneHeader from '@/components/chat/ChatPhoneHeader.vue'
import ChatPhoneMenu from '@/components/chat/ChatPhoneMenu.vue'
import { usePreviewStore } from '@/stores/preview'
import type { ChatTabState } from '@/utils/chatTab'

// A chat pushed over the session list on a phone (Figma "M04" to "M09"). The list replaces the
// tab bar, so this screen shows exactly one chat.
const { tab } = defineProps<{ tab: ChatTabState }>()
const emit = defineEmits<{ back: []; close: [] }>()

const isMenuOpen = ref(false)

const preview = usePreviewStore()

// A phone has no room for a column: the preview is always the sheet.
const showPreview = (url: string) => preview.show(tab, url, false)
const closeTab = () => {
  isMenuOpen.value = false
  emit('close')
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-safe">
    <ChatPhoneHeader :tab @back="emit('back')" @menu="isMenuOpen = true" />
    <ChatPane :key="tab.id" :tab is-compact @preview="showPreview" />
    <ChatPhoneMenu :key="tab.id" v-model:open="isMenuOpen" :tab @close="closeTab" />
  </div>
</template>
