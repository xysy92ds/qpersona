<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BookOutline,
  ChevronForward,
  CloseOutline,
  CreateOutline,
  MoonOutline,
  SettingsOutline,
  SparklesOutline,
} from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useUiStore } from '@/store/ui'
import { useSettingsStore } from '@/store/settings'
import { useContactsStore } from '@/store/contacts'
import { db } from '@/core/db'

const router = useRouter()
const route = useRoute()
const ui = useUiStore()
const settings = useSettingsStore()
const contacts = useContactsStore()

const msgCount = ref(0)
const dragX = ref(0)

let touchX = 0
let touchY = 0
let dragStarted = false

watch(
  () => route.fullPath,
  () => {
    if (ui.drawerOpen) ui.closeDrawer()
  },
)

watch(
  () => ui.drawerOpen,
  async (open) => {
    if (open) msgCount.value = await db.messages.count()
  },
)

function go(to: string) {
  ui.closeDrawer()
  router.push(to)
}

function close() {
  ui.closeDrawer()
  dragX.value = 0
}

function onTouchStart(e: TouchEvent) {
  touchX = e.touches[0]!.clientX
  touchY = e.touches[0]!.clientY
  dragStarted = false
}

function onTouchMove(e: TouchEvent) {
  const dx = e.touches[0]!.clientX - touchX
  const dy = e.touches[0]!.clientY - touchY
  if (!dragStarted && Math.abs(dy) > Math.abs(dx)) return
  if (dx < 0) {
    dragStarted = true
    dragX.value = Math.max(dx, -320)
  }
}

function onTouchEnd() {
  if (dragX.value < -80) close()
  else dragX.value = 0
}
</script>

<template>
  <Transition name="drawer">
    <div v-if="ui.drawerOpen" class="drawer-root">
      <div class="drawer-mask" @click="close" />
      <aside
        class="drawer"
        :style="dragX ? { transform: `translateX(${dragX}px)`, transition: 'none' } : undefined"
        @touchstart.passive="onTouchStart"
        @touchmove.passive="onTouchMove"
        @touchend="onTouchEnd"
      >
        <button class="drawer-close" aria-label="关闭侧栏" @click="close"><CloseOutline /></button>

        <div class="drawer-head">
          <button class="drawer-profile" @click="go('/me')">
            <div class="drawer-id">
              <Avatar :name="settings.user.nickname" :src="settings.user.avatar" :size="64" />
              <div class="drawer-id__text">
                <div class="drawer-name">{{ settings.user.nickname }}</div>
                <div class="drawer-qq">QQ {{ settings.user.qqNumber }}</div>
              </div>
            </div>
            <div class="drawer-sign">
              {{ settings.user.signature || '编辑个签，展示你的状态' }}
              <ChevronForward class="chev" />
            </div>
          </button>
          <div class="drawer-stats">
            <span><b>{{ contacts.characters.length }}</b> 好友</span>
            <span><b>{{ contacts.conversations.length }}</b> 会话</span>
            <span><b>{{ msgCount }}</b> 消息</span>
          </div>
        </div>

        <div class="drawer-menu">
          <button class="drawer-item" @click="go('/profile')"><CreateOutline /> 编辑资料 <ChevronForward class="chev" /></button>
          <button class="drawer-item" @click="go('/settings/ai')"><SparklesOutline /> AI 设置 <ChevronForward class="chev" /></button>
          <button class="drawer-item" @click="go('/tavern')"><BookOutline /> 酒馆 <ChevronForward class="chev" /></button>
          <button class="drawer-item" @click="go('/settings')"><SettingsOutline /> 设置 <ChevronForward class="chev" /></button>
        </div>

        <div class="drawer-foot">
          <button class="drawer-mode" @click="settings.toggleTheme()">
            <MoonOutline /> {{ settings.isDark ? '切到浅色' : '夜间模式' }}
          </button>
          <span class="drawer-ver">Q伴 0.15.0</span>
        </div>
        <div class="drawer-hint">向左滑动关闭</div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-root {
  position: absolute;
  inset: var(--sb-h) 0 0 0;
  z-index: 70;
  display: flex;
}
.drawer-mask {
  position: absolute;
  inset: 0;
  background: rgba(8, 12, 18, 0.38);
}
.drawer {
  position: relative;
  width: min(318px, 82%);
  height: 100%;
  background: var(--bg-page);
  box-shadow: 16px 0 44px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  touch-action: pan-y;
  will-change: transform;
}
.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 0.24s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(-100%);
}
.drawer-enter-active .drawer-mask,
.drawer-leave-active .drawer-mask {
  transition: opacity 0.24s;
}
.drawer-enter-from .drawer-mask,
.drawer-leave-to .drawer-mask {
  opacity: 0;
}
.drawer-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.6);
  color: var(--text-2);
  z-index: 2;
}
[data-theme='dark'] .drawer-close {
  background: rgba(255, 255, 255, 0.12);
}
.drawer-close svg {
  width: 18px;
  height: 18px;
}
.drawer-head {
  padding: 16px 16px 12px;
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(0, 153, 255, 0.16), transparent 55%),
    radial-gradient(90% 90% at 0% 0%, rgba(123, 91, 255, 0.12), transparent 60%);
  border-bottom: 1px solid var(--line);
}
.drawer-profile {
  display: block;
  width: 100%;
  text-align: left;
  padding: 14px 14px 10px;
  border-radius: 16px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
}
.drawer-id {
  display: flex;
  align-items: center;
  gap: 12px;
}
.drawer-name {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.drawer-qq {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}
.drawer-sign {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
  margin-top: 10px;
}
.drawer-sign .chev {
  margin-left: auto;
}
.drawer-stats {
  display: flex;
  gap: 26px;
  padding: 14px 6px 2px;
}
.drawer-stats span {
  font-size: 11px;
  color: var(--text-3);
  display: flex;
  align-items: baseline;
  gap: 3px;
}
.drawer-stats b {
  font-size: 15px;
  color: var(--text);
  font-weight: 600;
}
.drawer-menu {
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.drawer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 50px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 15px;
  color: var(--text);
  text-align: left;
}
.drawer-item:active {
  background: var(--bg-hover);
}
.drawer-item svg {
  width: 21px;
  height: 21px;
  color: var(--text-2);
  flex: none;
}
.drawer-item .chev {
  margin-left: auto;
  width: 16px;
  height: 16px;
}
.drawer-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-top: 1px solid var(--line);
}
.drawer-mode {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
}
.drawer-mode svg {
  width: 17px;
  height: 17px;
}
.drawer-ver {
  font-size: 10.5px;
  color: var(--text-3);
}
.drawer-hint {
  text-align: center;
  font-size: 10px;
  color: var(--text-3);
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  opacity: 0.7;
}
</style>
