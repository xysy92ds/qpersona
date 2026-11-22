<script setup lang="ts">
import { CloseOutline } from '@vicons/ionicons5'

withDefaults(defineProps<{ modelValue: boolean; title?: string }>(), { title: '' })
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const close = () => emit('update:modelValue', false)
</script>

<template>
  <Transition name="fade">
    <div v-if="modelValue" class="sheet-mask" @click.self="close">
      <div class="sheet-panel">
        <div class="sheet-grab" />
        <div class="sheet-head">
          <h3>{{ title }}</h3>
          <button class="iconbtn iconbtn--ghost" aria-label="关闭" @click="close">
            <CloseOutline />
          </button>
        </div>
        <div class="sheet-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="sheet-foot">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Transition>
</template>
