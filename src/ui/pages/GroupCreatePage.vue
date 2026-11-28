<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CheckmarkCircle, ChevronBack, EllipseOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useContactsStore } from '@/store/contacts'
import { useCloudStore } from '@/store/cloud'
import { useSettingsStore } from '@/store/settings'
import { createServerGroup } from '@/core/groups'
import { showToast } from '@/ui/common/toast'

const router = useRouter()
const contacts = useContactsStore()
const cloud = useCloudStore()
const settings = useSettingsStore()

const selected = ref<string[]>([])
const title = ref('')

const list = computed(() => contacts.characters)
const canCreate = computed(() => selected.value.length >= 2)

function toggle(id: string) {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}

async function create() {
  if (!canCreate.value) {
    showToast('至少选两个角色')
    return
  }
  const picked = list.value.filter((c) => selected.value.includes(c.id))
  const names = picked.map((c) => c.ext.qq.nickname || c.card.name)
  const name = title.value.trim() || names.slice(0, 3).join('、')
  const humans = picked.filter((c) => c.ext.human)
  if (humans.length) {
    if (!cloud.loggedIn) {
      showToast('拉真人进群需要先登录云端账号')
      return
    }
    const bots = picked
      .filter((c) => !c.ext.human)
      .map((c) => {
        const avatar = c.ext.qq.avatar || ''
        return {
          id: c.id,
          name: c.ext.qq.nickname || c.card.name,
          avatar: avatar.startsWith('data:') && avatar.length > 38_000 ? '' : avatar.slice(0, 39_000),
        }
      })
    try {
      const sg = await createServerGroup(settings.cloudUrl, cloud.token, {
        name,
        humanUsernames: humans.map((c) => c.ext.human!.username),
        bots,
      })
      const conv = await contacts.createGroup(selected.value, name, {
        serverGroupId: sg.id,
        serverGroupOwnerId: sg.ownerId,
      })
      router.replace(`/chat/${conv.id}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '创建群失败', 3500)
    }
    return
  }
  const conv = await contacts.createGroup(selected.value, name)
  router.replace(`/chat/${conv.id}`)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/contacts')
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">发起群聊</div>
      <button class="done" :disabled="!canCreate" @click="create">创建</button>
    </header>

    <div class="scroll">
      <div class="tip">
        选中至少两位好友。真人会收到群消息；AI 角色只在被 @、叫到名字或聊到感兴趣的事时开口。
      </div>

      <label class="field">
        <span class="field__label">群名称（可留空）</span>
        <input v-model="title" class="input" maxlength="20" placeholder="例如：周三晚上的书店" />
      </label>

      <div class="group-title">选择好友 · 已选 {{ selected.length }}</div>
      <div class="list">
        <button v-for="c in list" :key="c.id" class="row" @click="toggle(c.id)">
          <Avatar :name="c.card.name" :src="c.ext.qq.avatar" :size="44" />
          <span class="row__body">
            <span class="row__name">{{ c.ext.qq.nickname || c.card.name }}</span>
            <span class="row__desc">{{ c.ext.qq.signature || c.card.tags?.join(' · ') || '还没有签名' }}</span>
          </span>
          <CheckmarkCircle v-if="selected.includes(c.id)" class="check on" />
          <EllipseOutline v-else class="check" />
        </button>
        <div v-if="!list.length" class="empty">还没有好友，先去添加角色。</div>
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
.done {
  font-size: 14px;
  font-weight: 500;
  color: var(--brand);
  padding: 6px 12px;
}
.done:disabled {
  opacity: 0.4;
}
.scroll {
  padding-bottom: 24px;
}
.tip {
  margin: 12px 14px 6px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(0, 153, 255, 0.08);
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.65;
}
.group-title {
  padding: 18px 20px 8px;
  font-size: 12px;
  color: var(--text-3);
}
.list {
  margin: 0 12px;
  background: var(--bg-sheet);
  border-radius: 14px;
  border: 1px solid var(--line);
  overflow: hidden;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}
.row:last-child {
  border-bottom: none;
}
.row:active {
  background: var(--bg-hover);
}
.row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row__name {
  font-size: 15px;
}
.row__desc {
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.check {
  width: 22px;
  height: 22px;
  color: var(--text-3);
  flex: none;
}
.check.on {
  color: var(--brand);
}
</style>
