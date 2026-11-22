import { defineStore } from 'pinia'

/** 全局壳层状态：侧栏、以后可能还有搜索层之类 */
export const useUiStore = defineStore('ui', {
  state: () => ({
    drawerOpen: false,
  }),
  actions: {
    openDrawer() {
      this.drawerOpen = true
    },
    closeDrawer() {
      this.drawerOpen = false
    },
  },
})
