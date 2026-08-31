/**
 * 示例插件：卡片渲染器（CardRenderer 注册点）—— v1 仅登记元数据，不改变界面。
 *
 * 现状说明（务必先读）：渲染进程卡片渲染器尚未跨进程加载，ArticleCard 没有注入点，
 * 也没有暴露插件的 IPC 通道，因此这里的 cardRenderers 只会出现在主进程启动日志
 * `[main] plugin registry: {...}` 的快照里，不会有可见效果。
 * 要写真正生效的插件请看另两个示例：
 *   plugins/example-json-feed/  FeedProvider（订阅源抓取，完整可用）
 *   plugins/example-theme/      Theme（主题，完整可用）
 * 完整契约与限制见 docs/PLUGIN_API.md。
 */
module.exports = {
  // manifest 字段仅用于自描述；加载器读的是同目录的 manifest.json
  manifest: { id: 'example-hello', name: '示例插件', version: '0.1.0' },
  cardRenderers: [{ id: 'hello-card', name: 'Hello 卡片' }]
}
