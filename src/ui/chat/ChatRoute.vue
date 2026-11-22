<script setup lang="ts">
import { computed } from 'vue'
import { useContactsStore } from '@/store/contacts'
import ChatPage from './ChatPage.vue'
import TavernChat from './TavernChat.vue'

const props = defineProps<{ id: string }>()
const contacts = useContactsStore()
const conv = computed(() => contacts.conversationById(props.id))
const isTavern = computed(() => conv.value?.profile === 'tavern')
</script>

<template>
  <TavernChat v-if="isTavern" :id="id" />
  <ChatPage v-else :id="id" />
</template>
