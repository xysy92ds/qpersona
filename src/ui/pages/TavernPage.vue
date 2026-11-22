<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AddOutline, SparklesOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useContactsStore } from '@/store/contacts'

const router = useRouter()
const contacts = useContactsStore()
const list = computed(() => contacts.characters)

async function enter(characterId: string) {
  const conv = await contacts.ensureConversation(characterId, 'tavern')
  router.push(`/chat/${conv.id}`)
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="topbar__title">酒馆</div>
      <button class="iconbtn" aria-label="添加角色" @click="router.push('/add')"><AddOutline /></button>
    </header>

    <div class="scroll">
      <div class="intro">
        <div class="intro__badge"><SparklesOutline /></div>
        <div class="intro__body">
          <div class="intro__title">同一个角色，换一套语法</div>
          <div class="intro__text">
            这里允许长叙述、动作和场景描写。角色卡与 QQ 端共享，切回来时 TA 还记得你们聊过什么。
          </div>
        </div>
      </div>

      <div class="group-title">可进入叙事的好友 · {{ list.length }}</div>
      <div class="list">
        <button v-for="ch in list" :key="ch.id" class="card" @click="enter(ch.id)">
          <Avatar :name="ch.card.name" :src="ch.ext.qq.avatar" :size="52" />
          <div class="card__body">
            <div class="card__name">{{ ch.card.name }}</div>
            <div class="card__desc">{{ ch.card.description || ch.ext.qq.signature || '一张还没有写简介的卡' }}</div>
            <div class="card__tags">
              <span v-for="t in (ch.card.tags || []).slice(0, 3)" :key="t">#{{ t }}</span>
            </div>
          </div>
          <span class="card__cta">叙事 ›</span>
        </button>
      </div>

      <div v-if="!list.length" class="empty">
        还没有角色。<br />先去「添加朋友」导入一张酒馆角色卡。
      </div>

      <div class="foot">酒馆端是同一应用内的独立路由 · 数据完全本地</div>
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
  padding-bottom: 18px;
}
.intro {
  display: flex;
  gap: 12px;
  margin: 10px 14px 2px;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(255, 170, 92, 0.16), rgba(255, 228, 196, 0.32));
  border: 1px solid rgba(255, 170, 92, 0.18);
}
.intro__badge {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, #ffb066, #ff8a3d);
  color: #fff;
  display: grid;
  place-items: center;
  flex: none;
}
.intro__badge svg {
  width: 21px;
  height: 21px;
}
.intro__title {
  font-size: 14.5px;
  font-weight: 600;
  color: #7a3c10;
}
.intro__text {
  font-size: 12px;
  line-height: 1.65;
  color: #8a5a34;
  margin-top: 5px;
}
[data-theme='dark'] .intro {
  background: linear-gradient(135deg, rgba(255, 170, 92, 0.12), rgba(90, 60, 30, 0.2));
}
[data-theme='dark'] .intro__title {
  color: #ffcf9e;
}
[data-theme='dark'] .intro__text {
  color: #c9a582;
}
.group-title {
  padding: 18px 20px 8px;
  font-size: 12px;
  color: var(--text-3);
}
.list {
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 12px;
  border-radius: 14px;
  background: var(--bg-sheet);
  border: 1px solid var(--line);
}
.card:active {
  background: var(--bg-hover);
}
.card__body {
  flex: 1;
  min-width: 0;
}
.card__name {
  font-size: 15.5px;
  font-weight: 600;
}
.card__desc {
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-3);
  margin-top: 3px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card__tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 5px;
}
.card__tags span {
  font-size: 10px;
  color: #d97706;
}
.card__cta {
  font-size: 12px;
  color: #d97706;
  flex: none;
}
.foot {
  text-align: center;
  font-size: 10.5px;
  color: var(--text-3);
  padding: 20px;
}
</style>
