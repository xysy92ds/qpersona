<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  BookOutline,
  ChevronBack,
  ChevronForward,
  CreateOutline,
  InformationCircleOutline,
  MoonOutline,
  SettingsOutline,
  SparklesOutline,
} from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useSettingsStore } from '@/store/settings'
import { useContactsStore } from '@/store/contacts'
import { db } from '@/core/db'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const settings = useSettingsStore()
const contacts = useContactsStore()

const msgCount = ref(0)
const about = ref(false)

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}

onMounted(async () => {
  msgCount.value = await db.messages.count()
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">我的</div>
      <button class="text-btn" @click="router.push('/profile')">编辑资料</button>
    </header>

    <div class="scroll">
      <div class="cover">
        <div class="cover__glow" />
        <div class="me">
          <Avatar :name="settings.user.nickname" :src="settings.user.avatar" :size="76" />
          <div class="me__body">
            <div class="me__name">{{ settings.user.nickname }}</div>
            <div class="me__meta">
              <span class="me__qq">QQ {{ settings.user.qqNumber }}</span>
            </div>
            <button class="me__sign" @click="router.push('/profile')">
              {{ settings.user.signature || '点这里写一句个性签名' }}
              <CreateOutline />
            </button>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b>{{ contacts.characters.length }}</b><span>好友</span></div>
          <div class="stat"><b>{{ contacts.conversations.length }}</b><span>会话</span></div>
          <div class="stat"><b>{{ msgCount }}</b><span>消息</span></div>
        </div>
      </div>

      <div class="sheet-block">
        <button class="cell" @click="router.push('/profile')">
          <div class="cell-icon" style="background: #3b82f6"><CreateOutline /></div>
          <div class="cell__body"><div class="cell__title">编辑资料</div><div class="cell__desc">头像、昵称、QQ 号、个性签名</div></div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="router.push('/settings/ai')">
          <div class="cell-icon" style="background: linear-gradient(135deg,#5b8cff,#7b5bff)"><SparklesOutline /></div>
          <div class="cell__body">
            <div class="cell__title">AI 设置</div>
            <div class="cell__desc">{{ settings.profiles.length ? `${settings.profiles.length} 个模型方案` : '还没有配置模型' }}</div>
          </div>
          <span v-if="!settings.profiles.length" class="dot" />
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="router.push('/tavern')">
          <div class="cell-icon" style="background: #f97316"><BookOutline /></div>
          <div class="cell__body"><div class="cell__title">酒馆</div><div class="cell__desc">和同一个角色进入长篇叙事</div></div>
          <ChevronForward class="chev" />
        </button>
      </div>

      <div class="sheet-block">
        <button class="cell" @click="settings.toggleTheme()">
          <div class="cell-icon" style="background: #5856d6"><MoonOutline /></div>
          <div class="cell__body"><div class="cell__title">深色模式</div></div>
          <span class="switch" :class="{ on: settings.isDark }" />
        </button>
        <button class="cell" @click="router.push('/settings')">
          <div class="cell-icon" style="background: #8e8e93"><SettingsOutline /></div>
          <div class="cell__body"><div class="cell__title">设置</div><div class="cell__desc">外观、消息、数据与关于</div></div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="about = true">
          <div class="cell-icon" style="background: #94a3b8"><InformationCircleOutline /></div>
          <div class="cell__body"><div class="cell__title">关于 Q伴</div></div>
          <span class="cell__value">0.6.0</span>
          <ChevronForward class="chev" />
        </button>
      </div>

      <div class="foot">Q伴 · QPersona<br />本地优先 · 开源非商业 · 仅用于学习与演示</div>
    </div>

    <BottomSheet v-model="about" title="关于 Q伴">
      <div class="about">
        <div class="about__logo">Q</div>
        <div class="about__name">Q伴 / QPersona 0.6.0</div>
        <p>
          看起来是 QQ，用起来也是 QQ —— 但好友全都是 AI 角色。<br />
          以 QQ 为交互外壳、以酒馆角色卡为人格内核，数据全部保存在这台设备上。
        </p>
        <p class="about__dim">
          界面风格参考 QQ，相关素材版权归腾讯所有。<br />
          本项目开源、非商业，仅用于学习与技术演示。
        </p>
      </div>
      <template #footer>
        <button class="btn btn--ghost" @click="about = false; showToast('已经是本地最新版本')">检查更新</button>
        <button class="btn" @click="about = false">知道了</button>
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
.text-btn {
  font-size: 13px;
  color: var(--brand);
  padding: 6px 10px;
}
.scroll {
  padding-bottom: 24px;
}
.cover {
  position: relative;
  margin: 0 12px 12px;
  padding: 18px 16px 14px;
  border-radius: 18px;
  background:
    radial-gradient(120% 120% at 100% 0%, rgba(0, 153, 255, 0.18), transparent 55%),
    radial-gradient(90% 90% at 0% 100%, rgba(123, 91, 255, 0.14), transparent 60%),
    var(--bg-sheet);
  border: 1px solid var(--line);
  overflow: hidden;
}
.cover__glow {
  position: absolute;
  width: 180px;
  height: 180px;
  right: -70px;
  top: -90px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 153, 255, 0.22), transparent 65%);
}
.me {
  display: flex;
  gap: 14px;
  align-items: center;
  position: relative;
}
.me__body {
  flex: 1;
  min-width: 0;
}
.me__name {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.me__meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.me__qq {
  font-size: 11.5px;
  color: var(--text-3);
  background: var(--bg-hover);
  padding: 1px 7px;
  border-radius: 6px;
}
.me__sign {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 7px;
  font-size: 12px;
  color: var(--text-2);
  max-width: 100%;
}
.me__sign svg {
  width: 12px;
  height: 12px;
  color: var(--text-3);
  flex: none;
}
.stats {
  display: flex;
  gap: 26px;
  margin-top: 16px;
  position: relative;
}
.stat {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.stat b {
  font-size: 16px;
  font-weight: 600;
}
.stat span {
  font-size: 11px;
  color: var(--text-3);
}
.sheet-block {
  background: var(--bg-sheet);
  border-radius: 14px;
  margin: 0 12px 12px;
  overflow: hidden;
  border: 1px solid var(--line);
}
.cell-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: #fff;
  flex: none;
}
.cell-icon svg {
  width: 18px;
  height: 18px;
}
.foot {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.9;
  padding: 18px 20px;
}
.about {
  padding: 4px 18px 10px;
  text-align: center;
}
.about__logo {
  width: 62px;
  height: 62px;
  margin: 4px auto 10px;
  border-radius: 18px;
  background: linear-gradient(135deg, #2ac8ff, #0b6fe0);
  color: #fff;
  font-size: 34px;
  font-weight: 700;
  display: grid;
  place-items: center;
}
.about__name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 10px;
}
.about p {
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-2);
  margin: 0 0 10px;
}
.about__dim {
  color: var(--text-3) !important;
  font-size: 11.5px !important;
}
</style>
