# SPEC：synthwave 网格合成层优化

2026-10-22。承接 `docs/GPU-AUDIT-2026-10-22.md` 的实测结论，目标是**在不降低视觉效果的前提下**把网格动画移出主线程重绘路径。

**状态**：本轮实施与验收已完成（#44–#47），2026-10-22 封稿，通过 PR 交付 main。下面 Problem Statement 的数字为旧实现 / 临时原型的历史测量，最终真实构建 A/B 见文末。

## Problem Statement

蒸汽梦核式的透视网格用 `background-position` 做 3.2s 循环动画，作用在一个 95vh、带 `perspective(1600px) rotateX(52deg)` 的平面上。实测（恢复 RTX 4070 硬件合成后，rAF 回调频率，非显示 FPS）：

| 状态 | rAF 回调频率 |
|---|---:|
| 原样 | 14.9–48.9Hz |
| 仅暂停网格动画 | 129.3 / 130.1Hz |
| 仅把模糊降到 12px | 16.6Hz（单段样本） |
| 网格纹理移到子层、用 `transform` 位移的原型 | 133.4Hz |

结论：瓶颈是网格动画本身。降模糊在**本次只有单段样本**，未观察到改善——这不足以泛化为「降模糊无效」，也不构成降级依据；`blur(18px)` 保持不动，但理由是「没有证据支持改」，而不是「已经证明改了没用」。

## Solution

把周期网格纹理从父层背景挪进一个**内层纹理元素**，用 `transform: translateY()` 做同周期位移；父层保留 `perspective` / `rotateX` / `mask` / 地面底色 / 地平线伪元素与几何。动画因此落在合成层，主线程不再每帧重绘整块平面。

## User Stories

1. 作为读者，滚动时网格仍从远处向观者涌来，速度与当前一致（56px / 3.2s）。
2. 作为读者，落日、天空、卡片毛玻璃观感不变——尤其 `blur(18px) saturate(1.15)` 保留。
3. 作为维护者，网格动画不再触发布局/绘制主线程，滚动在弱机上仍有足够帧预算。
4. 作为无障碍使用者，`prefers-reduced-motion` 与窗口不可见时网格静止（沿用现有规则）。
5. 作为使用者，亮/暗两侧、阅读页与订阅页、任意 `uiZoom` 下网格位置与速度一致。

## Implementation Decisions

- **纹理层**：`.juya-scene-grid.juya-scene-grid-persp::after`，绝对定位覆盖父层并**多出一个周期的余量**（父层高 95vh，纹理层高 `calc(100% + 56px)`，`top: -56px`），保证位移过程中不露底。
- **背景迁移**：两条 `repeating-linear-gradient` 从父层移到纹理层；父层只保留 `background-color: #170a2a`（亮侧由变体规则覆盖为 `#ffcadb`）。
- **动画**：`@keyframes` 只动 `transform`；`will-change: transform` 挂在纹理层，父层删除 `will-change: background-position` 与 `animation`。
- **方向必须实测校准**：原 `background-position: 0 → 56px` 在 rotateX 平面上的视觉方向，与 `translateY` 的方向是否一致，不得凭推断；以「网格向观者涌来」为验收，方向反了就是错的。
- **遮挡关系不变**：纹理层在父层内部、`mask` 作用下，遮罩仍由父层承担；地平线 `::before` 层级高于纹理层。
- **不做降级**：不动 `blur`、不动落日、不动卡面。

## Testing Decisions

- **静态守卫**（`tests/unit/juyaCssGuard.test.ts`）：父层不得再有 `animation` / `will-change: background-position`；纹理层必须有 `transform` 动画、周期 56px；`will-change: transform` 在纹理层。
- **E2E**（`tests/e2e/reader.spec.ts`）：网格仍可见且底边在视口内（沿用现有断言）；新增「纹理层 transform 在两次采样间发生变化」，证明动画真的在跑。
- **视觉等价**：现有 synthwave 亮/暗 E2E 断言不改阈值；`npm run verify` 必须 exit 0（nocturne 归档不受影响，改的是 synthwave 作用域规则）。
- **性能验收不进 CI**：旧 / 新真实构建共用同一探针、运行时与合成文章，预热后按旧→新→新→旧重复至少两轮，light / trace 分档，报告成对差值、中位数及组内波动。差值被波动覆盖时写「收益未确定」。初版 ≥100Hz 的绝对目标已撤销，100Hz 仅作历史参考，不进入测试 / CI / 探针退出码。

## Out of Scope

- 不降 `blur`、不改落日/天空/卡面/字体/图标。
- 不动 nocturne：其 dust 与剩余波动尚未归因，见 GPU 核查记录。
- 不做发行包（portable / win-unpacked）验收。
- 不引入新的 `will-change` 常驻层。

## Further Notes

- 证据来源：`docs/GPU-AUDIT-2026-10-22.md`「蒸汽梦核式：优化可能已得到原型支持」。
- 原型只是可行性验证；正式实现的方向 / 相位校准由 #44 完成，亮 / 暗 × 阅读 / 订阅、缩放 1.2、窄窗、reduced-motion、隐藏暂停与 keep-alive 回归由 #45 完成。
- GPU 初始化修复（三个 DLL 的完整性标签）发生在 `node_modules` 内、不随仓库传播；性能复测前先跑 `npm run diagnose:gpu`，PASS 才具备比较意义。

## 收口与验收（2026-10-22）

- 实现、回归与探针分别见 #44 / #45 / #46；#47 使用 `58219a1` 与 `1018243` 两个真实构建进行两档各 8 段的交错 A/B，完整结果已集成于本地 `feat/synthwave`，基线 `77f245d`。
- light 的旧 / 新 rAF 中位数为 21.8 / 80.3Hz，成对差值中位 +58.2Hz，大于组内最大跨度 18.6Hz；trace 的 DroppedFrame 单段计数中位 722→148。支持本机该合成阅读样本上有收益，不推广为显示 FPS、所有机器或全部缩放的保证。
- 最新代码验证为 `npm run verify` exit 0：572 单测 / 139 E2E / 对比度 70+14 / 5 张归档一致；规范与票面评审均 0 项发现。详细测量与边界见 [GPU 核查记录](GPU-AUDIT-2026-10-22.md)。
- 18px 模糊与其余视觉取值保持不动。`uiZoom=1.2` 构图、物理显示 FPS、发行包 GPU 验收及扩大性能矩阵不在本次收口范围；本轮按用户授权以 PR 交付 main 并同步远端，集成记录以 GitHub PR 为准；不进行新版本发行。
