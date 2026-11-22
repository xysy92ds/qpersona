<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { AddCircleOutline, HappyOutline, MicOutline, StopCircleOutline } from '@vicons/ionicons5'
import { showToast } from '@/ui/common/toast'

const props = defineProps<{ disabled?: boolean; streaming?: boolean }>()
const emit = defineEmits<{ send: [string]; stop: [] }>()

const text = ref('')
const area = ref<HTMLTextAreaElement>()

function resize() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(96, el.scrollHeight) + 'px'
}

function submit() {
  const v = text.value.trim()
  if (!v || props.disabled) return
  emit('send', v)
  text.value = ''
  nextTick(resize)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

watch(text, () => nextTick(resize))
</script>

<template>
  <div class="composer">
    <button class="cbtn" aria-label="语音消息" @click="showToast('语音消息 · 即将推出')">
      <MicOutline />
    </button>
    <div class="field-wrap">
      <textarea
        ref="area"
        v-model="text"
        class="area"
        rows="1"
        placeholder=""
        enterkeyhint="send"
        @keydown="onKey"
        @input="resize"
      />
    </div>
    <button class="cbtn" aria-label="表情" @click="showToast('表情面板 · 即将推出')">
      <HappyOutline />
    </button>
    <button class="cbtn" aria-label="更多" @click="showToast('图片 / 文件 / 语音 · 即将推出')">
      <AddCircleOutline />
    </button>
    <button v-if="streaming" class="send send--stop" @click="$emit('stop')">
      <StopCircleOutline />
    </button>
    <button v-else class="send" :disabled="!text.trim()" @click="submit">发送</button>
  </div>
</template>

<style scoped>
.composer {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: 7px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
  background: var(--bg-sheet);
  border-top: 1px solid var(--line);
  z-index: 10;
}
.cbtn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  color: var(--text-2);
  flex: none;
  border-radius: 50%;
  margin-bottom: 3px;
}
.cbtn:active {
  background: var(--bg-hover);
}
.cbtn svg {
  width: 24px;
  height: 24px;
}
.field-wrap {
  flex: 1;
  min-width: 0;
  background: var(--bg);
  border-radius: 10px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  min-height: 36px;
}
.area {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  line-height: 1.4;
  max-height: 96px;
  padding: 0;
  margin: 0;
}
.send {
  flex: none;
  height: 32px;
  min-width: 52px;
  padding: 0 12px;
  border-radius: 9px;
  background: var(--brand);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 2px;
  transition: opacity 0.15s;
}
.send:disabled {
  opacity: 0.4;
  background: var(--brand);
}
.send--stop {
  display: grid;
  place-items: center;
  min-width: 44px;
  background: var(--bg-hover);
  color: var(--text-2);
}
.send--stop svg {
  width: 20px;
  height: 20px;
}
</style>
