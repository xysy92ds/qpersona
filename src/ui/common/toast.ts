import { reactive } from 'vue'

export interface ToastItem {
  id: number
  text: string
}

export const toasts = reactive<ToastItem[]>([])

let seq = 0

export function showToast(text: string, duration = 1800) {
  const id = ++seq
  toasts.push({ id, text })
  window.setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, duration)
}
