<script setup lang="ts">
import { ref } from 'vue'
import ChatPane from '@/components/chat/ChatPane.vue'
import ChatPhoneHeader from '@/components/chat/ChatPhoneHeader.vue'
import ChatPhoneMenu from '@/components/chat/ChatPhoneMenu.vue'
import type { ChatTabState } from '@/utils/chatTab'

// A chat pushed over the session list on a phone (Figma "M04" to "M09"). The list replaces the
// tab bar, so this screen shows exactly one chat.
const { tab } = defineProps<{ tab: ChatTabState }>()
const emit = defineEmits<{ back: []; close: [] }>()

const isMenuOpen = ref(false)

const closeTab = () => {
  isMenuOpen.value = false
  emit('close')
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col px-safe">
    <ChatPhoneHeader :tab @back="emit('back')" @menu="isMenuOpen = true" />
    <ChatPane :key="tab.id" :tab is-compact />
    <ChatPhoneMenu :key="tab.id" v-model:open="isMenuOpen" :tab @close="closeTab" />
  </div>
</template>
