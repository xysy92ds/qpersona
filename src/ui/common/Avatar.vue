<script setup lang="ts">
import { computed } from 'vue'
import { avatarSvg } from '@/core/avatar'

const props = withDefaults(
  defineProps<{
    name: string
    src?: string
    size?: number
    round?: boolean
  }>(),
  { src: '', size: 44, round: false },
)

const url = computed(() => props.src || avatarSvg(props.name))
</script>

<template>
  <img
    class="avatar"
    :class="{ 'avatar--round': round }"
    :src="url"
    :alt="name"
    :style="{ width: size + 'px', height: size + 'px' }"
    draggable="false"
  />
</template>
