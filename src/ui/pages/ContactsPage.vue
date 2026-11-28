<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AddOutline, PeopleOutline, PersonAddOutline, SearchOutline } from '@vicons/ionicons5'
import Avatar from '@/ui/common/Avatar.vue'
import { useContactsStore } from '@/store/contacts'

const router = useRouter()
const contacts = useContactsStore()
const list = computed(() => contacts.characters)
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="topbar__title">联系人</div>
      <button class="iconbtn" aria-label="添加" @click="router.push('/add')"><AddOutline /></button>
    </header>

    <button class="search" @click="router.push('/search')">
      <SearchOutline />
      <span>搜索好友、签名、标签</span>
    </button>

    <div class="scroll">
      <div class="sheet-block">
        <button class="cell" @click="router.push('/add')">
          <div class="cell-icon" style="background: #ff9f0a"><PersonAddOutline /></div>
          <div class="cell__body">
            <div class="cell__title">新的朋友</div>
            <div class="cell__desc">导入角色卡 / 新建角色 / 聊天记录培养</div>
          </div>
          <span class="cell__value">去添加</span>
        </button>
        <button class="cell" @click="router.push('/group/new')">
          <div class="cell-icon" style="background: #34c759"><PeopleOutline /></div>
          <div class="cell__body">
            <div class="cell__title">发起群聊</div>
            <div class="cell__desc">把 AI 角色和真人好友拉进一个群</div>
          </div>
          <span class="cell__value">去创建</span>
        </button>
      </div>

      <div class="group-title">我的好友 · {{ list.length }}</div>
      <div class="sheet-block">
        <button v-for="c in list" :key="c.id" class="cell" @click="router.push(`/character/${c.id}`)">
          <Avatar :name="c.card.name" :src="c.ext.qq.avatar" :size="42" />
          <div class="cell__body">
            <div class="cell__title">{{ c.ext.qq.nickname || c.card.name }}</div>
            <div class="cell__desc">{{ c.card.tags?.slice(0, 3).join(' · ') || c.ext.qq.signature || '还没有个性签名' }}</div>
          </div>
        </button>
        <div v-if="!list.length" class="empty">还没有好友，去「新的朋友」加一个。</div>
      </div>
      <div class="foot-note">好友包括本地 AI 角色和真人；真人消息经云端中转，离线保留 7 天</div>
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
.search {
  flex: none;
  margin: 2px 16px 12px;
  height: 40px;
  border-radius: 12px;
  background: var(--bg-sheet);
  color: var(--text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13.5px;
}
.search svg {
  width: 16px;
  height: 16px;
}
.scroll {
  padding-bottom: 16px;
}
.sheet-block {
  background: var(--bg-sheet);
  border-radius: 14px;
  margin: 0 12px;
  overflow: hidden;
  border: 1px solid var(--line);
}
.group-title {
  padding: 20px 22px 8px;
  font-size: 12px;
  color: var(--text-3);
}
.cell {
  background: transparent;
}
.cell-icon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  flex: none;
}
.cell-icon svg {
  width: 22px;
  height: 22px;
}
.foot-note {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  padding: 24px 30px;
  line-height: 1.6;
}
</style>
