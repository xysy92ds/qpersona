<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronForward,
  ColorPaletteOutline,
  InformationCircleOutline,
  SettingsOutline,
  SparklesOutline,
  StarOutline,
} from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useSettingsStore } from '@/store/settings'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const settings = useSettingsStore()

const editing = ref(false)
const nick = ref('')
const signature = ref('')

function openEdit() {
  nick.value = settings.user.nickname
  signature.value = settings.user.signature
  editing.value = true
}

async function saveProfile() {
  const name = nick.value.trim() || '你'
  await settings.saveUser({ nickname: name, signature: signature.value.trim() })
  editing.value = false
  showToast('资料已保存')
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="topbar head__bar"><h1>我的</h1></div>
    </div>

    <div class="scroll">
      <button class="profile" @click="openEdit">
        <Avatar :name="settings.user.nickname" :src="settings.user.avatar" :size="62" />
        <div class="profile__body">
          <div class="profile__name">{{ settings.user.nickname }}</div>
          <div class="profile__meta">QQ 号 {{ settings.user.qqNumber }}</div>
          <div class="profile__sign">{{ settings.user.signature || '还没有个性签名' }}</div>
        </div>
        <ChevronForward class="chev" style="color: rgba(255,255,255,.7)" />
      </button>

      <div class="sheet-block">
        <button class="cell" @click="router.push('/settings/ai')">
          <div class="cell-icon" style="background: linear-gradient(135deg,#5b8cff,#7b5bff)"><SparklesOutline /></div>
          <div class="cell__body">
            <div class="cell__title">AI 设置</div>
            <div class="cell__desc">{{ settings.profiles.length ? `已配置 ${settings.profiles.length} 个模型方案` : '还没有配置模型' }}</div>
          </div>
          <span v-if="!settings.profiles.length" class="dot" />
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="router.push('/settings')">
          <div class="cell-icon" style="background: #8e8e93"><SettingsOutline /></div>
          <div class="cell__body"><div class="cell__title">设置</div></div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="showToast('装扮 · 即将推出')">
          <div class="cell-icon" style="background: #ff2d55"><ColorPaletteOutline /></div>
          <div class="cell__body"><div class="cell__title">装扮</div><div class="cell__desc">头像、气泡、主题</div></div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="showToast('收藏 · 即将推出')">
          <div class="cell-icon" style="background: #ffb300"><StarOutline /></div>
          <div class="cell__body"><div class="cell__title">我的收藏</div></div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="router.push('/tavern')">
          <div class="cell-icon" style="background: #ff7a45"><InformationCircleOutline /></div>
          <div class="cell__body"><div class="cell__title">酒馆</div><div class="cell__desc">同一批角色，换个方式聊</div></div>
          <ChevronForward class="chev" />
        </button>
      </div>

      <div class="foot">Q伴 · QPersona 0.1.0<br />本地优先 · 开源非商业 · 仅用于学习与演示</div>
    </div>

    <BottomSheet v-model="editing" title="编辑资料">
      <label class="field">
        <span class="field__label">昵称</span>
        <input v-model="nick" class="input" maxlength="16" placeholder="你叫什么" />
      </label>
      <label class="field">
        <span class="field__label">个性签名</span>
        <input v-model="signature" class="input" maxlength="40" placeholder="随便写一句" />
      </label>
      <div class="hint">QQ 号是本地的虚拟号码，用来在界面里显示。</div>
      <template #footer>
        <button class="btn btn--ghost" @click="editing = false">取消</button>
        <button class="btn" @click="saveProfile">保存</button>
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
  background: var(--bg);
}
.head {
  flex: none;
  background: var(--brand-grad);
  padding-bottom: 54px;
}
.head__bar {
  background: transparent;
  min-height: 44px;
}
.head__bar h1 {
  font-size: 20px;
}
.scroll {
  margin-top: -44px;
  padding: 0 0 20px;
}
.profile {
  display: flex;
  align-items: center;
  gap: 14px;
  width: calc(100% - 24px);
  margin: 0 12px 16px;
  padding: 16px 14px;
  border-radius: 16px;
  background: var(--brand-grad);
  color: #fff;
  text-align: left;
  box-shadow: 0 10px 24px rgba(11, 132, 243, 0.24);
}
.profile__body {
  flex: 1;
  min-width: 0;
}
.profile__name {
  font-size: 19px;
  font-weight: 600;
}
.profile__meta {
  font-size: 12px;
  opacity: 0.82;
  margin-top: 2px;
}
.profile__sign {
  font-size: 12.5px;
  opacity: 0.92;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sheet-block {
  background: var(--bg-sheet);
  border-radius: 12px;
  margin: 0 10px;
  overflow: hidden;
}
.cell-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: #fff;
  flex: none;
  margin-right: 2px;
}
.cell-icon svg {
  width: 19px;
  height: 19px;
}
.foot {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.8;
  padding: 24px 20px;
}
</style>
