import { create } from 'zustand'

/** 全局单例轻量提示（toast）：用于「标签已达上限」等一次性提示。
 *  连续调用不堆叠：只保留最新一条并重置 2.4s 自动清除计时。 */
interface ToastState {
  message: string | null
  show(message: string): void
  clear(): void
}

// 自动清除计时器句柄：模块级（store 外），show 时先 clearTimeout 旧的再设新的
let timer: ReturnType<typeof setTimeout> | null = null

const TOAST_DURATION_MS = 2400

export const useToastStore = create<ToastState>((set) => ({
  message: null,

  show(message) {
    if (timer) clearTimeout(timer)
    set({ message })
    timer = setTimeout(() => {
      timer = null
      set({ message: null })
    }, TOAST_DURATION_MS)
  },

  clear() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    set({ message: null })
  }
}))
