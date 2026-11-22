<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronBack, RefreshOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useSettingsStore } from '@/store/settings'
import { imageToDataUrl } from '@/core/util'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const settings = useSettingsStore()

const avatar = ref(settings.user.avatar || '')
const nickname = ref(settings.user.nickname)
const qqNumber = ref(settings.user.qqNumber)
const signature = ref(settings.user.signature)
const fileInput = ref<HTMLInputElement>()

onMounted(() => {
  avatar.value = settings.user.avatar || ''
})

async function pickAvatar(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast('选一张图片')
    return
  }
  try {
    avatar.value = await imageToDataUrl(file, 360)
  } catch {
    showToast('这张图读不出来，换一张试试')
  }
}

function randomQQ() {
  qqNumber.value = String(Math.floor(1e8 + Math.random() * 8.9e8))
  showToast('换了一个随机 QQ 号')
}

function resetAvatar() {
  avatar.value = ''
}

async function save() {
  const name = nickname.value.trim()
  if (!name) {
    showToast('昵称不能为空')
    return
  }
  const qq = qqNumber.value.trim()
  if (!/^\d{5,12}$/.test(qq)) {
    showToast('QQ 号填 5~12 位数字')
    return
  }
  await settings.saveUser({
    nickname: name,
    qqNumber: qq,
    signature: signature.value.trim(),
    avatar: avatar.value,
  })
  showToast('资料已更新')
  if (window.history.length > 1) router.back()
  else router.replace('/me')
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/me')
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">编辑资料</div>
      <button class="save" @click="save">保存</button>
    </header>

    <div class="scroll">
      <div class="avatar-card">
        <button class="avatar-btn" @click="fileInput?.click()">
          <Avatar :name="nickname || '我'" :src="avatar" :size="86" />
          <span class="avatar-btn__hint">更换</span>
        </button>
        <div class="avatar-actions">
          <div class="avatar-title">{{ nickname || '我' }}</div>
          <div class="avatar-desc">头像会显示在聊天列表和气泡旁边</div>
          <div class="avatar-links">
            <button class="mini" @click="fileInput?.click()">从相册选择</button>
            <button v-if="avatar" class="mini mini--dim" @click="resetAvatar">恢复默认</button>
          </div>
        </div>
      </div>

      <div class="sheet-block">
        <label class="field">
          <span class="field__label">昵称</span>
          <input v-model="nickname" class="input" maxlength="16" placeholder="你叫什么" />
        </label>
        <label class="field">
          <span class="field__label">
            QQ 号
            <button class="random" @click.prevent="randomQQ"><RefreshOutline /> 随机一个</button>
          </span>
          <input v-model="qqNumber" class="input" inputmode="numeric" maxlength="12" placeholder="5~12 位数字" />
        </label>
        <label class="field">
          <span class="field__label">个性签名</span>
          <input v-model="signature" class="input" maxlength="40" placeholder="一句话介绍自己" />
        </label>
        <div class="hint">
          QQ 号只是一个本地显示用的号码，不涉及真实 QQ 账号。想换成自定义号码直接改就行。
        </div>
      </div>

      <div class="hint" style="text-align: center; padding-top: 18px">
        资料只保存在这台设备的 IndexedDB 里
      </div>
    </div>

    <input ref="fileInput" type="file" accept="image/*" hidden @change="pickAvatar" />
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
.save {
  font-size: 14px;
  font-weight: 500;
  color: var(--brand);
  padding: 6px 12px;
}
.scroll {
  padding-bottom: 24px;
}
.avatar-card {
  display: flex;
  gap: 16px;
  align-items: center;
  margin: 12px 12px 4px;
  padding: 20px 16px;
  border-radius: 18px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
}
.avatar-btn {
  position: relative;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
}
.avatar-btn__hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 24px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 10.5px;
  line-height: 24px;
  text-align: center;
  border-radius: 0 0 43px 43px;
}
.avatar-actions {
  flex: 1;
  min-width: 0;
}
.avatar-title {
  font-size: 18px;
  font-weight: 600;
}
.avatar-desc {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 4px;
  line-height: 1.5;
}
.avatar-links {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.mini {
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 8px;
  background: rgba(0, 153, 255, 0.1);
  color: var(--brand);
}
.mini--dim {
  background: var(--bg-hover);
  color: var(--text-2);
}
.sheet-block {
  background: var(--bg-sheet);
  border-radius: 14px;
  margin: 12px;
  padding: 6px 0 10px;
  border: 1px solid var(--line);
}
.random {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--brand);
  margin-left: auto;
}
.random svg {
  width: 12px;
  height: 12px;
}
</style>
