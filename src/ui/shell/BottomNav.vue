<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Chatbubbles, ChatbubblesOutline, People, PeopleOutline, PersonCircle, PersonCircleOutline } from '@vicons/ionicons5'
import { useContactsStore } from '@/store/contacts'

const route = useRoute()
const contacts = useContactsStore()

const tabs = computed(() => [
  { name: 'messages', to: '/', label: '消息', icon: ChatbubblesOutline, activeIcon: Chatbubbles },
  { name: 'contacts', to: '/contacts', label: '联系人', icon: PeopleOutline, activeIcon: People },
  { name: 'me', to: '/me', label: '我的', icon: PersonCircleOutline, activeIcon: PersonCircle },
])

const unread = computed(() => contacts.totalUnread)
</script>

<template>
  <nav class="tabbar">
    <RouterLink
      v-for="t in tabs"
      :key="t.name"
      :to="t.to"
      class="tabbar__item"
      :class="{ active: route.name === t.name }"
    >
      <component :is="route.name === t.name ? t.activeIcon : t.icon" />
      <span>{{ t.label }}</span>
      <span v-if="t.name === 'messages' && unread" class="tabbar__badge">{{ unread > 99 ? '99+' : unread }}</span>
    </RouterLink>
  </nav>
</template>
