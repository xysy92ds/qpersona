<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronBack, CloudOutline, LogOutOutline, SyncOutline } from '@vicons/ionicons5'
import { useCloudStore } from '@/store/cloud'
import { useSettingsStore } from '@/store/settings'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const cloud = useCloudStore()
const settings = useSettingsStore()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const showServer = ref(false)
const serverDraft = ref(settings.cloudUrl)

const lastSyncText = computed(() =>
  cloud.lastSync ? new Date(cloud.lastSync).toLocaleString('zh-CN') : '还没有同步过',
)

async function submit() {
  error.value = ''
  if (!username.value.trim()) {
    error.value = '先填用户名'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少 6 位'
    return
  }
  busy.value = true
  try {
    if (mode.value === 'register') await cloud.register(username.value.trim(), password.value)
    else await cloud.login(username.value.trim(), password.value)
    password.value = ''
    showToast('登录成功，开始同步')
    await cloud.syncNow()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    busy.value = false
  }
}

async function sync() {
  await cloud.syncNow()
  if (cloud.error) showToast(cloud.error)
  else showToast(cloud.lastResult || '同步完成')
}

async function saveServer() {
  await settings.setCloudUrl(serverDraft.value)
  showServer.value = false
  showToast('服务器地址已保存')
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
      <div class="topbar__title">账号与同步</div>
      <div style="width: 38px" />
    </header>

    <div class="scroll">
      <div v-if="!cloud.loggedIn" class="hero">
        <div class="hero__icon"><CloudOutline /></div>
        <div class="hero__title">游客模式</div>
        <div class="hero__text">
          现在所有数据只保存在这台设备。登录后可以备份到云端，换浏览器/换手机时恢复；
          游客不会上传任何内容。
        </div>
      </div>

      <div v-else class="hero hero--ok">
        <div class="hero__icon"><CloudOutline /></div>
        <div class="hero__title">{{ cloud.user?.username }}</div>
        <div class="hero__text">云端只做备份，恢复时以本地数据为准；连续 30 天不登录会清空云端聊天、记忆和角色，账号保留。</div>
      </div>

      <template v-if="!cloud.loggedIn">
        <div class="tabs">
          <button class="tab" :class="{ on: mode === 'login' }" @click="mode = 'login'">登录</button>
          <button class="tab" :class="{ on: mode === 'register' }" @click="mode = 'register'">注册</button>
        </div>

        <label class="field">
          <span class="field__label">用户名</span>
          <input v-model="username" class="input" maxlength="20" placeholder="3~20 位，字母/数字/下划线/中文" />
        </label>
        <label class="field">
          <span class="field__label">密码</span>
          <input v-model="password" class="input" type="password" maxlength="128" placeholder="至少 6 位" />
        </label>

        <div v-if="error" class="error">{{ error }}</div>
        <button class="btn btn--block" :disabled="busy" @click="submit">
          {{ busy ? '处理中…' : mode === 'login' ? '登录并同步' : '注册并同步' }}
        </button>
        <div class="hint">用户名会被查重；密码只保存哈希，不会明文存服务器。</div>
      </template>

      <template v-else>
        <div class="card">
          <div class="row"><span>上次同步</span><b>{{ lastSyncText }}</b></div>
          <div class="row"><span>本次结果</span><b>{{ cloud.lastResult || '—' }}</b></div>
        </div>

        <button class="btn btn--block" :disabled="cloud.syncing" @click="sync">
          <SyncOutline /> {{ cloud.syncing ? '同步中…' : '立即同步' }}
        </button>
        <div v-if="cloud.error" class="error">{{ cloud.error }}</div>

        <button class="ghost" @click="cloud.logout(); showToast('已退出，数据仍在本机')">
          <LogOutOutline /> 退出登录
        </button>
      </template>

      <button class="link" @click="showServer = !showServer">服务器地址</button>
      <div v-if="showServer" class="server">
        <input v-model="serverDraft" class="input" placeholder="https://jianyie-api.jianyie.workers.dev" />
        <button class="mini" @click="saveServer">保存</button>
      </div>

      <div class="hint">
        同步范围：角色、会话、消息、记忆、表情包、个人资料/外观、模型方案（不含 API Key）。API Key 不会上传；新设备需要自己填。
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
  background: var(--bg-page);
}
.scroll {
  padding: 12px 14px 26px;
}
.hero {
  padding: 22px 18px;
  border-radius: 16px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  text-align: center;
}
.hero--ok {
  background: linear-gradient(135deg, rgba(47, 134, 255, 0.1), rgba(9, 52, 140, 0.06));
  border-color: rgba(47, 134, 255, 0.2);
}
.hero__icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 8px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #2f86ff;
  background: rgba(47, 134, 255, 0.12);
}
.hero__icon svg {
  width: 26px;
  height: 26px;
}
.hero__title {
  font-size: 18px;
  font-weight: 600;
}
.hero__text {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}
.tabs {
  display: flex;
  gap: 4px;
  margin: 14px 0;
  padding: 3px;
  border-radius: 10px;
  background: var(--bg-hover);
}
.tab {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-2);
}
.tab.on {
  background: var(--bg-sheet);
  color: var(--text);
  font-weight: 600;
}
.card {
  margin: 14px 0;
  border-radius: 13px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  padding: 4px 14px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  font-size: 12.5px;
  border-bottom: 1px solid var(--line);
}
.row:last-child {
  border-bottom: none;
}
.row span {
  color: var(--text-3);
}
.row b {
  font-weight: 500;
  text-align: right;
}
.btn {
  margin-top: 12px;
}
.ghost {
  width: 100%;
  margin-top: 12px;
  padding: 11px;
  border-radius: 10px;
  color: var(--text-2);
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 13px;
}
.ghost svg {
  width: 16px;
  height: 16px;
}
.error {
  margin: 10px 0;
  padding: 9px 11px;
  border-radius: 9px;
  background: rgba(255, 77, 79, 0.09);
  color: var(--danger);
  font-size: 12px;
  line-height: 1.5;
}
.link {
  display: block;
  margin: 16px auto 0;
  font-size: 11.5px;
  color: var(--text-3);
}
.server {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.server .input {
  flex: 1;
}
.mini {
  padding: 0 12px;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
}
.hint {
  margin-top: 14px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-3);
}
</style>
