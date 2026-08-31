# 插件 API（v1）

面向第三方插件作者的契约参考。类型定义的唯一来源是
[`src/shared/plugin-api.ts`](../src/shared/plugin-api.ts)，加载器的唯一来源是
[`src/main/plugin/PluginManager.ts`](../src/main/plugin/PluginManager.ts)。
本文与二者不一致时，以代码为准 —— 并且欢迎提 Issue 修正本文。

> 本文描述的每条行为都由 [`tests/unit/pluginManager.test.ts`](../tests/unit/pluginManager.test.ts) 守着，
> 包括 `plugins/` 下三个示例必须真实可加载。

## 可用度速览

| 注册点 | manifest `provides` | 状态 | 效果 |
| --- | --- | --- | --- |
| `FeedProvider` | `"feed-provider"` | **完整可用** | 接管订阅源抓取，文章进入正常阅读链路 |
| `Theme` | `"theme"` | **完整可用** | 出现在「设置 → 主题」，可被亮/暗分类选用，全局换肤 |
| `CardRenderer` | `"card-renderer"` | **v1 未接通** | 只登记元数据并出现在启动日志快照里，**界面无任何变化** |

三类注册点都由 `manifest.provides` 声明门控：**没声明的能力不生效**，即使入口对象里带了对应字段。

## 加载模型

一个插件 = `plugins/` 下的一个目录：

```
plugins/<你的插件>/
├── manifest.json   # 清单（见下）
└── index.cjs       # CommonJS 入口
```

两个扫描根，按顺序：

1. `<appPath>/plugins` —— 开发期即仓库根的 `plugins/`；打包后位于 `app.asar` 内（随应用发布，用户不可写）
2. `%APPDATA%\Opia RSS Reader\plugins` —— **用户插件的唯一落点**。发行版是 portable exe，启动时解包到临时目录，所以只有这里能持久存放第三方插件

要点：

- **目录名与插件身份无关**，身份取 `manifest.id`。
- 加载发生在 `app.whenReady()` 内，**一次、同步、无热重载**。改插件代码要重启应用。
- 入口用 Node `require()` 加载，**未沙箱化**：`module.exports = {...}` 或 `exports.default = {...}` 都可（前者优先解析）。
- **没有生命周期钩子**：不存在 `init` / `dispose` / `activate`。加载器只读属性，不会调用插件的任何方法。
- 清单解析失败、入口 `require` 抛错、字段不全 —— 全部**逐个兜住**，只在主进程日志留一行 `console.error`，不影响其他插件与应用启动。

### manifest.json 字段的真实语义

| 字段 | 是否必需 | 加载器实际用途 |
| --- | --- | --- |
| `id` | 必需（缺失即拒绝该插件） | 插件身份、日志与快照里的 `pluginId` |
| `main` | 必需 | 相对插件目录的入口文件路径 |
| `provides` | 必需（必须是数组） | **能力开关**：`"feed-provider"` / `"theme"` 决定是否注册对应能力 |
| `name` | 声明了但**不被读取** | 无 |
| `version` | 声明了 | 仅用于 `loaded <id>@<version>` 日志行 |

不校验 id 字符集、不做重复 id 检测、没有 `engines`/API 版本协商。

## 安全边界

写插件前必须知道的两件事：

1. **插件拥有完整的 main 进程权限**：可以 `require('fs')`、`require('child_process')`，能读到用户的全部本地数据（含 `%APPDATA%` 下的订阅与历史）。没有权限声明机制，责任在作者自律。
2. **主题颜色值会被直接写进 CSS 自定义属性，核心不做净化**：`colors.*` 只能填合法颜色字面量。写 `red; position: fixed` 这类内容会把额外声明注入 `:root`。

## FeedProvider

```ts
interface FeedProvider {
  id: string                                    // provider 全局唯一 id
  name: string
  canHandle(url: string): boolean                // 是否能处理该订阅源 URL
  fetch(source: FeedSource): Promise<{ articles: Array<Omit<Article, 'sourceId'>> }>
}
```

`articles` 里**不要带 `sourceId`** —— `FeedService` 会按当前源统一打上。其余 `Article` 字段（`guid` / `title` / `link` / `pubDate` / `summary` / `contentHtml` / `coverUrl`）必填，`pubDate` 用 ISO 字符串。

### provider 是怎么被选中的

`FeedService.refresh()` 对每个**启用**的订阅源依次：

```
providers.get(source.providerId)          // 1. 按 providerId 精确取
  ?? providers.get('builtin-rss')         // 2. 取不到就静默回退内置 RSS
→ provider.canHandle(source.url)          // 3. 不接受则跳过该源（只 warn，不 fetch）
→ await provider.fetch(source)            // 4. 抛错则记 error 并继续下一个源
```

由此产生三个容易踩的坑：

- **`providerId` 写了但插件没加载成功 → 不报错，而是被当成 RSS 源硬抓。** 插件 provider 的 id 要足够独特。
- **用 id `builtin-rss` 会静默顶替内置 RSS 解析器**（`Map.set` 覆盖）。
- **`refresh` 的 `added` 只统计缓存里没有的新 `guid`**；`guid` 不稳定会导致每次刷新重复计新条目。

`canHandle` 是唯一的准入判据，应当尽量窄（示例用「http(s) 且路径以 `.json` 结尾」）。

### 怎么让一个源用上你的 provider

当前 UI **没有 provider 选择器**（`BlankPage` 与 `SettingsPanel` 建源时都硬编码 `providerId: 'builtin-rss'`），所以：

1. 把插件目录放进 `%APPDATA%\Opia RSS Reader\plugins\`
2. 重启应用，确认日志有 `[PluginManager] loaded <id>@<version>`
3. 在应用内正常添加订阅源，**退出应用**
4. 编辑 `%APPDATA%\Opia RSS Reader\opia-data.json`，把该源的 `providerId` 改成你的 provider id
5. 再启动

`FeedService.listProviders()` 已实现但未接 IPC，所以应用内看不到已加载的 provider 列表 —— 现阶段唯一出口是日志。

### 复用核心工具？不行

构建产物不导出任何符号（`out/main/index.js` 无 `exports.*`），插件 `require` 不到核心模块。连 `extractCover` 这类小工具都得自带一份 —— `plugins/example-json-feed/index.cjs` 里就是这么做的。

## Theme

```ts
interface ThemeTokens {
  id: string                 // 强烈建议带自己的前缀
  name: string
  colorScheme?: 'light' | 'dark'   // 缺省时按背景亮度推导
  colors: { /* 恰好 12 个键，全部必填 */ }
  fonts: { heading: string; body: string }
  radius: number
  spacing: number
}
```

`colors` 的 12 个键：`bg`、`surface`、`card`、`border`、`text`、`textSecondary`、`accent`、`accentHover`、`onAccent`、`chip`、`chipText`、`read`。

`ThemeService.validate` 会校验：`id` 与 `name` 非空、12 个颜色键全部非空、两个字体非空、`colorScheme` 属于 `undefined | 'light' | 'dark'`。
**不校验**：颜色格式（`'红色'` 也能过）、`radius` / `spacing`、`id` 字符集。

关键行为：

- **`colorScheme` 决定主题出现在亮色区还是暗色区**，选错区就选不到。缺省时按背景相对亮度（WCAG 式，<0.5 记为暗）归类。建议显式声明。
- **`radius` / `spacing` 会落到 `--t-radius` / `--t-spacing`**，但基准字号固定 14px，主题改不了字号，也不会引起界面尺寸跳变。
- **id 撞车的优先级是 内置 > 插件 > 用户**（`list()` 拼接顺序 + `get()` 取首个匹配）。与内置同 id 等于白写。
- **非法插件主题会被逐个跳过**并记 `[main] plugin theme rejected: <id>`，不再拖垮启动流程。
- 渲染层经 `applyTheme` 把 12 色 + 双字体 + 圆角间距注入 `:root`，并同步 `color-scheme`，因此插件主题能完整换肤（含原生控件的亮暗渲染）。

## CardRenderer（v1 未接通）

```ts
cardRenderers?: Array<{ id: string; name: string }>   // 注意：只有元数据，不是渲染函数
```

契约里的 `CardRendererProps`（`article` / `read` / `favorite`）在代码中没有任何消费者。现状是：元数据进快照 → `console.log('[main] plugin registry: …')` → 结束。

要真正接通，至少需要三处改动（尚无实现）：

1. 新增插件相关的 IPC 通道（契约常量 → preload 暴露 → main handler 三处同步）
2. 渲染进程侧的组件注册表，并把 `CardRendererProps` 作为 props 传入
3. `ArticleCard` 内的注入点 —— 它当前是完全自包含的，没有插槽

在接通之前，请不要把它当作可用的渲染扩展点。

## 排障

日志在哪：开发期看 `npm run dev` 的终端；`build.ps1 -Run` 会 tail 到 `build/run.log`；发行版需要 `--enable-logging` 或用 DevTools 看渲染侧。

启动期与插件有关的三行：

```
[PluginManager] loaded <id>@<version>
[main] plugin theme rejected: <id>        # 仅当某主题校验失败
[main] plugin registry: {"providers":[…],"themes":[…],"cardRenderers":[…]}
```

`plugin registry` 是判断「插件到底被不被看见」的权威出口。三类静默失效（都不报错、也不进列表）：

| 症状 | 原因 |
| --- | --- |
| 快照里没有我的 provider | `provides` 漏写 `"feed-provider"` |
| provider 注册了但没抓到内容 | 该源的 `providerId` 不是你的 id（被 `canHandle` 拒了，日志有 `no provider for`） |
| 快照里没有我的主题 | `provides` 漏写 `"theme"`，或主题字段不全（看 `plugin theme rejected`） |

## 内置示例

| 目录 | 注册点 | 说明 |
| --- | --- | --- |
| [`plugins/example-json-feed/`](../plugins/example-json-feed) | `feed-provider` | JSON Feed 1.1 解析器：窄 `canHandle` + item→Article 映射 + 上游错误抛穿 |
| [`plugins/example-theme/`](../plugins/example-theme) | `theme` | 亮/暗各一的完整 `ThemeTokens`，带 id 前缀 |
| [`plugins/example-hello/`](../plugins/example-hello) | `card-renderer` | **仅元数据**，用于验证管线与说明 v1 未接通 |

## 版本策略

`OpiaPlugin` 目前是 v1，尚无版本号协商。**破坏性变更会改 `plugin-api.ts` 的文件头注释并在 Release Notes 中显式声明**；在此之前请把你的插件与内置示例的行为对齐测试（`npm test` 会校验 `plugins/` 下全部示例）。
