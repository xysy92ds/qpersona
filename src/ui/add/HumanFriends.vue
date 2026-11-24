<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CheckmarkOutline, CloseOutline, PersonAddOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useCloudStore } from '@/store/cloud'
import { useHumanStore } from '@/store/human'
import type { FriendItem } from '@/core/human'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const cloud = useCloudStore()
const human = useHumanStore()
const username = ref('')
const busy = ref(false)
const error = ref('')
let timer: number | null = null

onMounted(() => {
  if (cloud.loggedIn) void human.refresh()
  timer = window.setInterval(() => {
    if (cloud.loggedIn && !human.loading) void human.refresh()
  }, 15_000)
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})

async function request() {
  if (!username.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    await human.request(username.value.trim())
    username.value = ''
    showToast('好友申请已发出')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '申请失败'
  } finally {
    busy.value = false
  }
}

async function accept(item: FriendItem) {
  busy.value = true
  try {
    const { conv } = await human.accept(item)
    showToast(`已添加 ${item.peer.username}`)
    router.push(`/chat/${conv.id}`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '接受失败')
  } finally {
    busy.value = false
  }
}

async function reject(item: FriendItem) {
  try {
    await human.reject(item)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

async function open(item: FriendItem) {
  try {
    const { conv } = await human.ensurePeer(item.peer)
    router.push(`/chat/${conv.id}`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '打开失败')
  }
}
</script>

<template>
  <div class="human">
    <div v-if="!cloud.loggedIn" class="guest">
      <div class="guest__title">真人好友需要登录</div>
      <p>登录后可以用用户名添加真人好友，消息由云端中转，离线保留 7 天。</p>
      <button class="btn btn--block" @click="router.push('/cloud')">去登录</button>
    </div>

    <template v-else>
      <div class="add-box">
        <input v-model="username" class="input" placeholder="对方的用户名" @keyup.enter="request" />
        <button class="btn" :disabled="busy || !username.trim()" @click="request">申请</button>
      </div>
      <div v-if="error" class="error">{{ error }}</div>
      <div class="hint">对方同意后会自动出现在消息列表；真人消息不经过 AI。</div>

      <template v-if="human.incoming.length">
        <div class="group-title">好友申请</div>
        <div v-for="f in human.incoming" :key="f.id" class="person">
          <Avatar :name="f.peer.username" :size="40" />
          <div class="person__body">
            <div class="person__name">{{ f.peer.username }}</div>
            <div class="person__desc">想加你为好友</div>
          </div>
          <button class="icon-btn ok" aria-label="接受" @click="accept(f)"><CheckmarkOutline /></button>
          <button class="icon-btn" aria-label="拒绝" @click="reject(f)"><CloseOutline /></button>
        </div>
      </template>

      <div class="group-title">我的真人好友 · {{ human.friends.length }}</div>
      <div v-if="!human.friends.length" class="empty">还没有真人好友，输入对方用户名发申请。</div>
      <button v-for="f in human.friends" :key="f.id" class="person" @click="open(f)">
        <Avatar :name="f.peer.username" :size="40" />
        <div class="person__body">
          <div class="person__name">{{ f.peer.username }}</div>
          <div class="person__desc">真人好友 · 点击聊天</div>
        </div>
        <span class="chev">›</span>
      </button>

      <template v-if="human.outgoing.length">
        <div class="group-title">等待对方同意</div>
        <div v-for="f in human.outgoing" :key="f.id" class="person person--dim">
          <Avatar :name="f.peer.username" :size="40" />
          <div class="person__body">
            <div class="person__name">{{ f.peer.username }}</div>
            <div class="person__desc">已发送申请</div>
          </div>
          <PersonAddOutline class="pending" />
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.human {
  padding: 12px;
}
.guest {
  padding: 24px 18px;
  border-radius: 16px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
  text-align: center;
}
.guest__title {
  font-size: 17px;
  font-weight: 600;
}
.guest p {
  margin: 8px 0 14px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
}
.add-box {
  display: flex;
  gap: 8px;
}
.add-box .input {
  flex: 1;
}
.add-box .btn {
  margin: 0;
  flex: none;
}
.error {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 77, 79, 0.09);
  color: var(--danger);
  font-size: 12px;
}
.hint {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-3);
}
.group-title {
  margin-top: 16px;
  margin-bottom: 6px;
  font-size: 11.5px;
  color: var(--text-3);
}
.person {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 12px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
}
.person--dim {
  opacity: 0.65;
}
.person__body {
  flex: 1;
  min-width: 0;
}
.person__name {
  font-size: 13.5px;
  font-weight: 500;
}
.person__desc {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}
.icon-btn {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bg-hover);
  color: var(--text-3);
}
.icon-btn svg {
  width: 17px;
  height: 17px;
}
.icon-btn.ok {
  color: #14b8a6;
}
.chev {
  color: var(--text-3);
  font-size: 18px;
}
.pending {
  width: 18px;
  height: 18px;
  color: var(--text-3);
}
.empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
}
</style>
