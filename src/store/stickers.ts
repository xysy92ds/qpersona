import { defineStore } from 'pinia'
import { db, putSticker } from '@/core/db'
import type { Sticker } from '@/core/types'
import { uid } from '@/core/util'

export const useStickersStore = defineStore('stickers', {
  state: () => ({
    list: [] as Sticker[],
    loaded: false,
  }),

  actions: {
    async load(force = false) {
      if (this.loaded && !force) return
      const rows = await db.stickers.toArray()
      rows.sort((a, b) => a.createdAt - b.createdAt)
      this.list = rows
      this.loaded = true
    },

    async add(input: { name: string; annotation: string; dataUrl: string }): Promise<Sticker> {
      const sticker: Sticker = {
        id: uid('st'),
        name: input.name.trim(),
        annotation: input.annotation.trim(),
        dataUrl: input.dataUrl,
        createdAt: Date.now(),
      }
      await putSticker(sticker)
      this.list.push(sticker)
      return sticker
    },

    async remove(id: string) {
      await db.stickers.delete(id)
      this.list = this.list.filter((s) => s.id !== id)
    },
  },
})
