<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { AddOutline, ChevronBack, ImageOutline, TrashOutline } from '@vicons/ionicons5'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useStickersStore } from '@/store/stickers'
import { imageToDataUrl } from '@/core/util'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const stickers = useStickersStore()

const adding = ref(false)
const fileInput = ref<HTMLInputElement>()
const preview = ref('')
const name = ref('')
const annotation = ref('')

async function pickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    preview.value = await imageToDataUrl(file, 320)
  } catch {
    showToast('这张图读不出来，换一张 GIF / PNG 试试')
  }
}

function openAdd() {
  preview.value = ''
  name.value = ''
  annotation.value = ''
  adding.value = true
  void stickers.load()
}

async function save() {
  if (!preview.value) {
    showToast('先选一张图')
    return
  }
  if (!name.value.trim()) {
    showToast('给它起个名字，AI 会看到这个名字')
    return
  }
  await stickers.add({ name: name.value, annotation: annotation.value, dataUrl: preview.value })
  adding.value = false
  showToast('表情包已添加')
}

async function remove(id: string, label: string) {
  await stickers.remove(id)
  showToast(`已删除「${label}」`)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/settings')
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">表情包</div>
      <button class="iconbtn" aria-label="添加" @click="openAdd"><AddOutline /></button>
    </header>

    <div class="scroll">
      <div class="hint">
        自己上传的表情包会存成图片。名字和注解会以
        <code>[表情包：名字，注解]</code>
        的形式告诉 AI，所以注解尽量写清楚它在表达什么。
      </div>

      <div v-if="stickers.list.length" class="grid">
        <div v-for="s in stickers.list" :key="s.id" class="item">
          <button class="item__del" aria-label="删除" @click="remove(s.id, s.name)"><TrashOutline /></button>
          <img :src="s.dataUrl" :alt="s.name" />
          <div class="item__name">{{ s.name }}</div>
          <div v-if="s.annotation" class="item__note">{{ s.annotation }}</div>
          <div v-else class="item__note item__note--empty">没写注解</div>
        </div>
      </div>

      <div v-else class="empty">
        <ImageOutline />
        还没有表情包。<br />点右上角「+」上传第一张。
      </div>

      <div class="foot">支持 PNG / JPG / GIF / WebP，单张尽量小于 1MB</div>
    </div>

    <input ref="fileInput" type="file" accept="image/*" hidden @change="pickFile" />

    <BottomSheet v-model="adding" title="添加表情包">
      <button class="picker" @click="fileInput?.click()">
        <img v-if="preview" :src="preview" alt="预览" />
        <span v-else class="picker__empty"><ImageOutline />选一张图片</span>
      </button>
      <label class="field">
        <span class="field__label">名字</span>
        <input v-model="name" class="input" maxlength="20" placeholder="例如：猫猫无语" />
      </label>
      <label class="field">
        <span class="field__label">注解（给 AI 看的）</span>
        <input v-model="annotation" class="input" maxlength="40" placeholder="例如：表示懒得接话、有点嫌弃" />
      </label>
      <div class="hint">发送时界面显示图片；模型收到的是「[表情包：名字，注解]」。</div>
      <template #footer>
        <button class="btn btn--ghost" @click="adding = false">取消</button>
        <button class="btn" @click="save">保存</button>
      </template>
    </BottomSheet>
  </div>
</template>

<style scoped>
.page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}
.scroll {
  padding-bottom: 24px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 8px 14px;
}
.item {
  position: relative;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 8px;
  text-align: center;
}
.item img {
  width: 100%;
  height: 86px;
  object-fit: contain;
  border-radius: 8px;
  background: var(--bg);
}
.item__name {
  font-size: 12px;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item__note {
  font-size: 10px;
  color: var(--text-3);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item__note--empty {
  opacity: 0.5;
}
.item__del {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  display: grid;
  place-items: center;
  z-index: 1;
}
.item__del svg {
  width: 14px;
  height: 14px;
}
.picker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(100% - 32px);
  margin: 6px 16px 4px;
  height: 132px;
  border-radius: 12px;
  border: 1.5px dashed var(--line-2);
  background: var(--bg);
  overflow: hidden;
}
.picker img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.picker__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: 12px;
}
.picker__empty svg {
  width: 28px;
  height: 28px;
}
code {
  font-size: 10.5px;
  background: var(--bg-hover);
  padding: 1px 4px;
  border-radius: 4px;
}
.foot {
  text-align: center;
  font-size: 10.5px;
  color: var(--text-3);
  padding: 20px;
}
</style>
