import { useToastStore } from '../stores/useToastStore'

/** 全局单例轻量提示条：顶部居中，文案由调用方经 useToastStore.show 传入（本组件不写死文案）。
 *  水平居中的 transform 由 index.css 的 .toast 独占（动效 transform 与之组合），故组件不挂 -translate-x-1/2。 */
export function Toast(): JSX.Element | null {
  const message = useToastStore((s) => s.message)
  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="toast fixed left-1/2 top-4 z-50 rounded-card border border-border bg-card px-4 py-2 text-sm text-text shadow-lg"
    >
      {message}
    </div>
  )
}
