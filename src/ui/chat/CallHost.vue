<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/store/ui'
import { useContactsStore } from '@/store/contacts'
import CallOverlay from './CallOverlay.vue'

const ui = useUiStore()
const contacts = useContactsStore()

const conv = computed(() => contacts.conversationById(ui.callConvId ?? undefined))
const ch = computed(() => contacts.characterById(conv.value?.characterId))
</script>

<template>
  <CallOverlay
    v-if="conv && ch"
    :character="ch"
    :conversation-id="conv.id"
    @close="ui.closeCall()"
  />
</template>
