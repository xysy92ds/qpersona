<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CameraOutline,
  ChevronBack,
  CloseCircleOutline,
  NotificationsOffOutline,
  NotificationsOutline,
  PersonAddOutline,
} from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import BottomSheet from '@/ui/common/BottomSheet.vue'
import { useContactsStore } from '@/store/contacts'
import { imageToDataUrl } from '@/core/util'
import { showToast } from '@/ui/common/toast'

const props = defineProps<{ id: string }>()
const router = useRouter()
const contacts = useContactsStore()

const conv = computed(() => contacts.conversationById(props.id))
const members = computed(() =>
  (conv.value?.memberIds ?? [])
    .map((id) => contacts.characterById(id))
    .filter((m): m is NonNullable<typeof m> => !!m),
)

const title = ref(conv.value?.title ?? '')
const avatar = ref(conv.value?.avatar ?? '')
const activeMinutes = ref(conv.value?.groupActiveMinutes ?? 5)
const memberIds = ref<string[]>([...(conv.value?.memberIds ?? [])])
const memoryShare = ref(conv.value?.groupMemoryShare !== false)
const isolation = ref(conv.value?.groupIsolation !== false)
const muted = ref<Record<string, boolean>>({ ...(conv.value?.groupMuted ?? {}) })
const avatarInput = ref<HTMLInputElement>()
const addOpen = ref(false)

const addable = computed(() =>
  contacts.characters.filter((c) => !memberIds.value.includes(c.id)),
)

const durations = [1, 3, 5, 10, 30]

async function pickAvatar(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    avatar.value = await imageToDataUrl(file, 360)
  } catch {
    showToast('这张图读不出来，换一张试试')
  }
}

function toggleMute(id: string) {
  muted.value = { ...muted.value, [id]: !muted.value[id] }
}

function removeMember(id: string) {
  if (memberIds.value.length <= 2) {
    showToast('群聊至少保留两个成员')
    return
  }
  memberIds.value = memberIds.value.filter((x) => x !== id)
}

function addMember(id: string) {
  if (memberIds.value.length >= 20) {
    showToast('一个群最多 20 个角色')
    return
  }
  if (!memberIds.value.includes(id)) memberIds.value.push(id)
}

async function save() {
  if (!conv.value) return
  const name = title.value.trim()
  if (!name) {
    showToast('群名称不能为空')
    return
  }
  if (memberIds.value.length < 2) {
    showToast('群聊至少两个成员')
    return
  }
  await contacts.touch(conv.value.id, {
    title: name,
    avatar: avatar.value,
    groupActiveMinutes: activeMinutes.value,
    groupMemoryShare: memoryShare.value,
    groupIsolation: isolation.value,
    groupMuted: muted.value,
    memberIds: memberIds.value,
  })
  showToast('群资料已更新')
  router.back()
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace(`/chat/${props.id}`)
}
</script>

<template>
  <div v-if="conv" class="page">
    <header class="topbar">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">群聊设置</div>
      <button class="save" @click="save">保存</button>
    </header>

    <div class="scroll">
      <div class="head-card">
        <button class="group-avatar" @click="avatarInput?.click()">
          <Avatar :name="title || '群聊'" :src="avatar" :size="76" />
          <span class="group-avatar__cam"><CameraOutline /></span>
        </button>
        <div class="head-card__body">
          <div class="head-card__name">{{ title || '未命名群聊' }}</div>
          <div class="head-card__meta">{{ memberIds.length }} 位成员</div>
          <div class="head-card__hint">点头像更换群头像，不传就按群名生成</div>
        </div>
      </div>

      <div class="sheet-block">
        <label class="field">
          <span class="field__label">群名称</span>
          <input v-model="title" class="input" maxlength="20" placeholder="给这个群起个名字" />
        </label>
      </div>

      <div class="group-title">被叫醒后保持活跃</div>
      <div class="sheet-block pad">
        <div class="seg">
          <button
            v-for="m in durations"
            :key="m"
            class="seg__btn"
            :class="{ on: activeMinutes === m }"
            @click="activeMinutes = m"
          >{{ m }} 分钟</button>
        </div>
        <div class="hint" style="padding: 8px 2px 4px">
          这段时间内，被 @ 或聊到兴趣的角色会继续接话；超过时间没有新消息就静默，不再调用模型。
        </div>
      </div>

      <div class="group-title">群聊行为</div>
      <div class="sheet-block">
        <button class="cell" @click="isolation = !isolation">
          <div class="cell__body">
            <div class="cell__title">严格上下文隔离</div>
            <div class="cell__desc">
              打开后，每个成员主要看自己上次发言之后的群消息 + 最近 10 条，省 token 也更像真人。
            </div>
          </div>
          <span class="switch" :class="{ on: isolation }" />
        </button>
      </div>

      <div class="group-title">记忆</div>
      <div class="sheet-block">
        <button class="cell" @click="memoryShare = !memoryShare">
          <div class="cell__body">
            <div class="cell__title">群聊里可以提起私聊的事</div>
            <div class="cell__desc">
              打开后，私聊总结的记忆也会注入群聊；群聊里记下的事，私聊里也能想起来。
            </div>
          </div>
          <span class="switch" :class="{ on: memoryShare }" />
        </button>
      </div>

      <div class="group-title">群成员 · {{ memberIds.length }}</div>
      <div class="sheet-block">
        <div v-for="m in members" :key="m.id" class="member">
          <Avatar :name="m.card.name" :src="m.ext.qq.avatar" :size="40" />
          <div class="member__body">
            <div class="member__name">{{ m.ext.qq.nickname || m.card.name }}</div>
            <div class="member__desc">{{ m.ext.qq.signature || m.card.tags?.join(' · ') || '群成员' }}</div>
          </div>
          <button class="member__mute" :aria-label="muted[m.id] ? '取消免打扰' : '免打扰'" @click="toggleMute(m.id)">
            <NotificationsOffOutline v-if="muted[m.id]" />
            <NotificationsOutline v-else />
          </button>
          <button class="member__del" aria-label="移出群聊" @click="removeMember(m.id)">
            <CloseCircleOutline />
          </button>
        </div>
        <button class="member member--add" :disabled="!addable.length" @click="addOpen = true">
          <span class="member__add-icon"><PersonAddOutline /></span>
          <span>添加成员</span>
        </button>
      </div>

      <div class="foot">改动只保存在本地；至少保留两个成员。</div>
    </div>

    <input ref="avatarInput" type="file" accept="image/*" hidden @change="pickAvatar" />

    <BottomSheet v-model="addOpen" title="添加成员">
      <button
        v-for="c in addable"
        :key="c.id"
        class="cell"
        @click="addMember(c.id)"
      >
        <Avatar :name="c.card.name" :src="c.ext.qq.avatar" :size="38" />
        <span class="cell__body">
          <span class="cell__title">{{ c.ext.qq.nickname || c.card.name }}</span>
          <span class="cell__desc">点一下加入群聊</span>
        </span>
      </button>
      <div v-if="!addable.length" class="hint">好友都已经在群里了。</div>
    </BottomSheet>
  </div>

  <div v-else class="notfound">
    <p>群聊不存在。</p>
    <button class="btn" @click="router.replace('/contacts')">回到联系人</button>
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
.head-card {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 14px 12px;
  padding: 18px 16px;
  border-radius: 16px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
}
.group-avatar {
  position: relative;
  flex: none;
  width: 76px;
  height: 76px;
}
.group-avatar__cam {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.62);
  color: #fff;
  display: grid;
  place-items: center;
  border: 2px solid var(--bg-sheet);
}
.group-avatar__cam svg {
  width: 12px;
  height: 12px;
}
.head-card__name {
  font-size: 18px;
  font-weight: 600;
}
.head-card__meta {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 3px;
}
.head-card__hint {
  font-size: 10.5px;
  color: var(--text-3);
  margin-top: 6px;
  line-height: 1.5;
}
.sheet-block {
  background: var(--bg-sheet);
  border-radius: 14px;
  margin: 0 12px;
  border: 1px solid var(--line);
  overflow: hidden;
}
.sheet-block.pad {
  padding: 8px 12px;
}
.group-title {
  padding: 18px 20px 8px;
  font-size: 12px;
  color: var(--text-3);
}
.seg {
  display: flex;
  gap: 4px;
  background: var(--bg-hover);
  border-radius: 10px;
  padding: 3px;
  flex-wrap: wrap;
}
.seg__btn {
  flex: 1;
  min-width: 56px;
  height: 32px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.seg__btn.on {
  background: var(--bg-sheet);
  color: var(--text);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1);
}
.member {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}
.member:last-child {
  border-bottom: none;
}
.member__body {
  flex: 1;
  min-width: 0;
}
.member__name {
  font-size: 14.5px;
}
.member__desc {
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.member__mute {
  width: 26px;
  height: 26px;
  color: var(--text-3);
  display: grid;
  place-items: center;
}
.member__mute svg {
  width: 18px;
  height: 18px;
}
.member__del {
  width: 26px;
  height: 26px;
  color: var(--text-3);
  display: grid;
  place-items: center;
}
.member__del svg {
  width: 20px;
  height: 20px;
}
.member--add {
  color: var(--brand);
  font-size: 13px;
  gap: 10px;
}
.member__add-icon {
  width: 40px;
  display: grid;
  place-items: center;
}
.member__add-icon svg {
  width: 22px;
  height: 22px;
}
.foot {
  text-align: center;
  font-size: 10.5px;
  color: var(--text-3);
  padding: 20px;
}
.notfound {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-2);
}
</style>
