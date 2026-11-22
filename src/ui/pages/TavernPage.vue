<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronBack, SparklesOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useContactsStore } from '@/store/contacts'

const router = useRouter()
const contacts = useContactsStore()
const list = computed(() => contacts.characters)

async function enter(characterId: string) {
  const conv = await contacts.ensureConversation(characterId, 'tavern')
  router.push(`/chat/${conv.id}`)
}

function goBack() {
  router.replace('/')
}
</script>

<template>
  <div class="tavern">
    <header class="topbar tavern-head">
      <button class="iconbtn" aria-label="返回" @click="goBack"><ChevronBack /></button>
      <div class="topbar__title">酒馆</div>
      <div style="width: 36px" />
    </header>

    <div class="scroll">
      <div class="intro">
        <SparklesOutline class="intro__icon" />
        <div class="intro__title">同一批角色，换一套语法</div>
        <div class="intro__text">
          酒馆端与 QQ 端共用角色卡和记忆，但注入不同的提示词：这里允许长叙述、动作与场景描写。
          从 QQ 切过来时，角色记得你们聊过什么。
        </div>
      </div>

      <div class="grid">
        <button v-for="ch in list" :key="ch.id" class="card" @click="enter(ch.id)">
          <Avatar :name="ch.card.name" :src="ch.ext.qq.avatar" :size="56" round />
          <div class="card__name">{{ ch.card.name }}</div>
          <div class="card__desc">{{ ch.card.description || ch.ext.qq.signature || '一张还没有写简介的卡' }}</div>
          <div class="card__tags">
            <span v-for="t in (ch.card.tags || []).slice(0, 3)" :key="t">#{{ t }}</span>
          </div>
          <div class="card__cta">进入叙事 →</div>
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
.tavern {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(90% 60% at 50% 0%, rgba(255, 186, 116, 0.18), transparent 70%),
    linear-gradient(180deg, #1a1410 0%, #120e0b 100%);
  color: #f3e7da;
}
.tavern-head {
  background: transparent;
  border-bottom: 1px solid rgba(255, 214, 170, 0.1);
}
.tavern-head .topbar__title {
  color: #ffd9a8;
  letter-spacing: 2px;
}
.tavern-head :deep(.iconbtn) {
  color: #ffd9a8;
}
.scroll {
  padding-bottom: 24px;
}
.intro {
  margin: 18px 16px 6px;
  padding: 18px 16px;
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(255, 196, 128, 0.14), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 210, 160, 0.14);
}
.intro__icon {
  width: 22px;
  height: 22px;
  color: #ffc47a;
  margin-bottom: 8px;
}
.intro__title {
  font-size: 16px;
  font-weight: 600;
  color: #ffe0b8;
}
.intro__text {
  font-size: 12px;
  line-height: 1.7;
  color: rgba(243, 231, 218, 0.68);
  margin-top: 7px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
}
.card {
  text-align: left;
  border-radius: 16px;
  padding: 14px 12px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 210, 160, 0.1);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 190px;
}
.card:active {
  background: rgba(255, 255, 255, 0.08);
}
.card__name {
  font-size: 15px;
  font-weight: 600;
  margin-top: 4px;
}
.card__desc {
  font-size: 11px;
  line-height: 1.55;
  color: rgba(243, 231, 218, 0.6);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}
.card__tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.card__tags span {
  font-size: 10px;
  color: #ffc47a;
  opacity: 0.8;
}
.card__cta {
  font-size: 11.5px;
  color: #ffc47a;
  margin-top: 2px;
}
.foot {
  text-align: center;
  font-size: 10.5px;
  color: rgba(243, 231, 218, 0.35);
  padding: 18px;
}
.empty {
  color: rgba(243, 231, 218, 0.5);
}
</style>
