<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  ChevronBack,
  ChevronForward,
  ColorPaletteOutline,
  InformationCircleOutline,
  MoonOutline,
  NotificationsOutline,
  ShieldCheckmarkOutline,
  SparklesOutline,
} from '@vicons/ionicons5'
import { useSettingsStore } from '@/store/settings'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const settings = useSettingsStore()

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/me')
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">设置</div>
      <div style="width: 36px" />
    </header>

    <div class="scroll">
      <div class="sheet-block">
        <button class="cell" @click="showToast('账号与安全 · 本地版无需登录')">
          <div class="cell-icon" style="background: #34c759"><ShieldCheckmarkOutline /></div>
          <div class="cell__body"><div class="cell__title">账号与安全</div></div>
          <span class="cell__value">本地版</span>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="showToast('消息气泡装扮 · 即将推出')">
          <div class="cell-icon" style="background: #ff2d55"><ColorPaletteOutline /></div>
          <div class="cell__body"><div class="cell__title">消息气泡</div><div class="cell__desc">气泡样式与头像装扮</div></div>
          <ChevronForward class="chev" />
        </button>
      </div>

      <div class="group-title">消息与通知</div>
      <div class="sheet-block">
        <button class="cell" @click="settings.setFlag('notify', !settings.flags.notify)">
          <div class="cell-icon" style="background: #ff9f0a"><NotificationsOutline /></div>
          <div class="cell__body"><div class="cell__title">消息提醒</div></div>
          <span class="switch" :class="{ on: settings.flags.notify }" />
        </button>
        <button class="cell" @click="settings.setTheme(settings.theme === 'dark' ? 'light' : 'dark')">
          <div class="cell-icon" style="background: #5856d6"><MoonOutline /></div>
          <div class="cell__body"><div class="cell__title">深色模式</div></div>
          <span class="switch" :class="{ on: settings.theme === 'dark' }" />
        </button>
      </div>

      <div class="group-title">AI 与自动化</div>
      <div class="sheet-block">
        <button class="cell" @click="router.push('/settings/ai')">
          <div class="cell-icon" style="background: linear-gradient(135deg,#5b8cff,#7b5bff)"><SparklesOutline /></div>
          <div class="cell__body">
            <div class="cell__title">AI 设置</div>
            <div class="cell__desc">模型方案 · 能力槽位 · 功能开关</div>
          </div>
          <ChevronForward class="chev" />
        </button>
        <button class="cell" @click="settings.setFlag('memory', !settings.flags.memory)">
          <div class="cell__body">
            <div class="cell__title">记忆总结</div>
            <div class="cell__desc">每 10 轮对话后台总结一次长期记忆</div>
          </div>
          <span class="switch" :class="{ on: settings.flags.memory }" />
        </button>
        <button class="cell" @click="settings.setFlag('groupInterest', !settings.flags.groupInterest)">
          <div class="cell__body">
            <div class="cell__title">群聊兴趣调度</div>
            <div class="cell__desc">按兴趣值决定谁被叫醒，屏蔽状态零模型调用</div>
          </div>
          <span class="switch" :class="{ on: settings.flags.groupInterest }" />
        </button>
        <button class="cell" @click="settings.setFlag('tts', !settings.flags.tts)">
          <div class="cell__body">
            <div class="cell__title">语音播报</div>
            <div class="cell__desc">把角色回复读出来（需要配置 TTS 槽位）</div>
          </div>
          <span class="switch" :class="{ on: settings.flags.tts }" />
        </button>
      </div>

      <div class="group-title">关于</div>
      <div class="sheet-block">
        <button class="cell" @click="showToast('Q伴 0.1.0 · 学习与演示用途')">
          <div class="cell-icon" style="background: #8e8e93"><InformationCircleOutline /></div>
          <div class="cell__body"><div class="cell__title">关于 Q伴</div></div>
          <span class="cell__value">0.1.0</span>
          <ChevronForward class="chev" />
        </button>
      </div>

      <div class="foot">
        本项目为开源非商业作品，界面风格参考 QQ，<br />所有「好友」均为本地 AI 角色，不连接真实 QQ 服务。
      </div>
    </div>
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
.scroll {
  padding-bottom: 24px;
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
}
.cell-icon svg {
  width: 19px;
  height: 19px;
}
.group-title {
  padding: 18px 22px 7px;
}
.foot {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.8;
  padding: 26px 24px;
}
</style>
