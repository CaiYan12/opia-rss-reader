// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  FIXED,
  assessSampleConditions,
  parseOptions,
  summarizeRafSamples,
  summarizeTraceEvents
} from '../../scripts/perf-probe.mjs'

const script = resolve('scripts/perf-probe.mjs')

describe('性能探针参数', () => {
  it('默认同时跑轻量采样与 trace，输出到 out/perf-probe', () => {
    const options = parseOptions([])
    expect(options.mode).toBe('both')
    expect(options.timeout).toBe(120000)
    expect(options.output.replaceAll('\\', '/')).toMatch(/\/out\/perf-probe$/)
  })

  it('接受显式模式与超时', () => {
    expect(parseOptions(['--mode', 'trace'])).toMatchObject({ mode: 'trace' })
    expect(parseOptions(['--mode', 'light', '--timeout', '30000'])).toMatchObject({
      mode: 'light',
      timeout: 30000
    })
  })

  it('未知参数不静默忽略', () => {
    expect(() => parseOptions(['--fix'])).toThrow(/Unknown argument/)
    expect(() => parseOptions(['--mode'])).toThrow(/Missing value/)
  })

  it('对照组开关是布尔参数，不吞掉后面的值', () => {
    expect(parseOptions([]).pauseGrid).toBe(false)
    expect(parseOptions(['--pause-grid'])).toMatchObject({ pauseGrid: true, mode: 'both' })
    expect(parseOptions(['--pause-grid', '--mode', 'light'])).toMatchObject({
      pauseGrid: true,
      mode: 'light'
    })
    expect(parseOptions(['--mode', 'light', '--pause-grid']).pauseGrid).toBe(true)
  })

  it('非法模式与越界超时明确失败', () => {
    expect(() => parseOptions(['--mode', 'fps'])).toThrow(/Invalid --mode/)
    expect(() => parseOptions(['--timeout', '29999'])).toThrow(/Invalid --timeout/)
    expect(() => parseOptions(['--timeout', '300001'])).toThrow(/Invalid --timeout/)
  })

  it('帮助可独立运行，不启动 Electron', () => {
    const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('perf:probe')
    expect(result.stdout).toContain('--mode')
    expect(result.stdout).toContain('--pause-grid')
  })

  it('参数错误返回信息不足的退出码', () => {
    const result = spawnSync(process.execPath, [script, '--fix'], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--fix')
  })
})

describe('rAF 指标聚合', () => {
  it('按回调间隔给出频率、中位、P95 和最差', () => {
    const result = summarizeRafSamples([0, 10, 20, 35])
    expect(result).toMatchObject({
      measured: true,
      callbacks: 4,
      durationMs: 35,
      hz: 85.7,
      intervalMedianMs: 10,
      intervalP95Ms: 15,
      intervalWorstMs: 15,
      intervalsOver33Ms: 0,
      intervalsOver50Ms: 0
    })
  })

  it('统计超过 33.34ms 与 50ms 的间隔', () => {
    const result = summarizeRafSamples([0, 20, 40, 90])
    expect(result).toMatchObject({
      intervalMedianMs: 20,
      intervalP95Ms: 50,
      intervalWorstMs: 50,
      intervalsOver33Ms: 1,
      intervalsOver50Ms: 0
    })
  })

  it('样本不足或含非数字时返回未测，不填 0', () => {
    expect(summarizeRafSamples([])).toMatchObject({ measured: false })
    expect(summarizeRafSamples([1, Number.NaN])).toMatchObject({ measured: false })
  })
})

describe('trace 指标聚合', () => {
  const RENDERER = 42
  const BROWSER = 7
  const OTHER = 99

  function frameEvents() {
    const events = []
    for (let i = 0; i < 10; i++) {
      events.push({ name: 'BeginFrame', pid: RENDERER, ts: i * 100000 })
      events.push({ name: 'DrawFrame', pid: RENDERER, ts: i * 100000 + 1000 })
    }
    for (let i = 0; i < 4; i++) {
      events.push({
        name: 'PipelineReporter',
        ph: 'b',
        pid: RENDERER,
        ts: 50000 + i * 200000,
        args: { frame_reporter: { state: 'STATE_PRESENTED_ALL', frame_sequence: i + 1 } }
      })
      // 同一帧的重复 begin（不同 id2.local）不得重复计数
      events.push({
        name: 'PipelineReporter',
        ph: 'b',
        pid: RENDERER,
        ts: 51000 + i * 200000,
        args: { frame_reporter: { state: 'STATE_PRESENTED_ALL', frame_sequence: i + 1 } }
      })
    }
    events.push({
      name: 'PipelineReporter',
      ph: 'b',
      pid: RENDERER,
      ts: 900000,
      args: { frame_reporter: { state: 'STATE_PRESENTED_PARTIAL', frame_sequence: 5 } }
    })
    events.push({ name: 'DroppedFrame', pid: RENDERER, ts: 100000 })
    events.push({ name: 'DroppedFrame', pid: RENDERER, ts: 300000 })
    events.push({ name: 'DroppedFrame', pid: RENDERER, ts: 2600000 })
    events.push({ name: 'DroppedFrame', pid: OTHER, ts: 200000 })
    for (let i = 0; i < 2; i++) events.push({ name: 'BeginFrame', pid: OTHER, ts: 200000 + i * 100000 })
    for (const ts of [0, 500000, 1000000]) {
      events.push({ name: 'InputLatency::GestureScrollUpdate', pid: BROWSER, ts })
    }
    return events
  }

  it('按手势窗口和渲染进程统计呈现帧与 DroppedFrame', () => {
    const result = summarizeTraceEvents(frameEvents(), { refreshHz: 165 })
    expect(result).toMatchObject({
      measured: true,
      windowSource: 'gesture',
      durationMs: 1000,
      rendererPid: RENDERER,
      beginFrames: 10,
      drawFrames: 10,
      droppedFrames: 2,
      presentedFrames: 4,
      presentedHz: 4,
      expectedVsyncs: 165,
      droppedRatioOfBeginFrames: 0.2,
      presentedRatioOfBeginFrames: 0.4
    })
    expect(result.presentedIntervalMedianMs).toBe(200)
    expect(result.presentedIntervalWorstMs).toBe(200)
  })

  it('没有手势事件时可用时钟标记收窄窗口', () => {
    const events = frameEvents().filter((event) => event.name !== 'InputLatency::GestureScrollUpdate')
    events.push(
      { name: 'clock_sync', ts: 0, args: { sync_id: 'perf-probe-start' } },
      { name: 'clock_sync', ts: 1000000, args: { sync_id: 'perf-probe-end' } }
    )
    expect(summarizeTraceEvents(events, { refreshHz: 165 })).toMatchObject({
      measured: true,
      windowSource: 'clock-sync',
      droppedFrames: 2,
      presentedFrames: 4
    })
  })

  it('没有帧事件时显式返回未测', () => {
    expect(summarizeTraceEvents([], { refreshHz: 165 })).toMatchObject({ measured: false })
  })

  it('没有 BeginFrame 时仍可从 PipelineReporter 识别渲染进程', () => {
    const events = frameEvents().filter((event) => event.name !== 'BeginFrame')
    const result = summarizeTraceEvents(events, { refreshHz: 165 })
    expect(result.rendererPid).toBe(RENDERER)
  })
})

describe('固定条件判定', () => {
  const good = {
    gpuStatus: 'PASS',
    isolationVerified: true,
    devicePixelRatio: FIXED.devicePixelRatio,
    innerWidth: FIXED.viewportWidth,
    innerHeight: FIXED.viewportHeight,
    uiZoom: FIXED.uiZoom,
    entryCount: FIXED.sampleEntries,
    imageCount: FIXED.sampleImages,
    imagesComplete: FIXED.sampleImages,
    scrollStart: 0,
    scrollEnd: FIXED.scrollDistance,
    visibilityStart: 'visible',
    visibilityEnd: 'visible',
    appHiddenStart: false,
    appHiddenEnd: false
  }

  it('全部满足才判可比', () => {
    expect(assessSampleConditions(good)).toEqual({ met: true, issues: [] })
  })

  it.each([
    ['GPU 未 PASS', { gpuStatus: 'FAIL' }, /GPU/],
    ['DPR 不符', { devicePixelRatio: 1 }, /devicePixelRatio/],
    ['视口不符', { innerWidth: 1100 }, /视口/],
    ['uiZoom 不符', { uiZoom: 1.2 }, /uiZoom/],
    ['条目数不符', { entryCount: 31 }, /条目数/],
    ['图像数不符', { imageCount: 33 }, /图像元素数/],
    ['图像未加载完', { imagesComplete: 33 }, /图像未全部加载/],
    ['滚动未到终点', { scrollEnd: 2990 }, /滚动终点/],
    ['页面不可见', { visibilityEnd: 'hidden' }, /visibilityState/],
    ['隐藏标记被设置', { appHiddenEnd: true }, /data-app-hidden/],
    ['隔离未证明', { isolationVerified: false }, /独立 profile/]
  ])('%s 时判不可比', (_name, override, pattern) => {
    const result = assessSampleConditions({ ...good, ...override })
    expect(result.met).toBe(false)
    expect(result.issues.join('\n')).toMatch(pattern)
  })
})
