/** 示例插件：仅登记一个卡片渲染器元数据，验证插件管线可用 */
module.exports = {
  manifest: { id: 'example-hello', name: '示例插件', version: '0.1.0' },
  cardRenderers: [{ id: 'hello-card', name: 'Hello 卡片' }]
}
