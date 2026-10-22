// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const script = resolve('scripts/gpu-diagnostics.mjs')
const healthyProbe = {
  gpuInfoUpdated: true,
  hardwareAcceleration: true,
  features: { gpu_compositing: 'enabled', rasterization: 'enabled' },
  gpuInfo: { gpuDevice: [{ active: true, deviceString: 'Intel(R) UHD Graphics' }] }
}

async function assess(overrides = {}, integrity: unknown[] = []) {
  const { assessGpuHealth } = await import('../../scripts/gpu-diagnostics.mjs')
  return assessGpuHealth({ probe: { ...healthyProbe, ...overrides }, integrity })
}

describe('本机 GPU 自检命令', () => {
  it('帮助可独立运行，不启动 Electron', () => {
    const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('diagnose:gpu')
    expect(result.stdout).toContain('--electron')
  })

  it('未知参数返回信息不足的退出码，不悄悄忽略参数', () => {
    const result = spawnSync(process.execPath, [script, '--fix'], { encoding: 'utf8' })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--fix')
  })

  it('集成显卡实际启用硬件合成即可通过，不强制独显', async () => {
    expect(await assess()).toMatchObject({ status: 'PASS', exitCode: 0 })
  })

  it('硬件开关为 true 但合成已回退时仍失败', async () => {
    expect(await assess({ features: { gpu_compositing: 'disabled_software', rasterization: 'enabled' } }))
      .toMatchObject({ status: 'FAIL', exitCode: 1 })
  })

  it('硬件栅格化回退也会失败', async () => {
    expect(await assess({ features: { gpu_compositing: 'enabled', rasterization: 'disabled_software' } }))
      .toMatchObject({ status: 'FAIL', exitCode: 1 })
  })

  it('未观察到 gpu-info-update 时不采信看似健康的早期值', async () => {
    expect(await assess({ gpuInfoUpdated: false })).toMatchObject({ status: 'INCOMPLETE', exitCode: 2 })
  })

  it('GPU 详细信息读取失败时不会误报通过', async () => {
    expect(await assess({ gpuInfo: null, gpuInfoError: 'GPU info timeout' }))
      .toMatchObject({ status: 'INCOMPLETE', exitCode: 2 })
  })

  it('没有实际活动显卡信息时保留未知', async () => {
    expect(await assess({ gpuInfo: { gpuDevice: [] } })).toMatchObject({ status: 'INCOMPLETE', exitCode: 2 })
  })

  it('关键运行时文件为 Low 时报告明确故障', async () => {
    const result = await assess({}, [{ path: 'libEGL.dll', exists: true, level: 'low' }])
    expect(result).toMatchObject({ status: 'FAIL', exitCode: 1 })
    expect(result.findings.join('\n')).toContain('libEGL.dll')
  })

  it('标签读取失败不能冒充 Medium', async () => {
    expect(await assess({}, [{ path: 'libEGL.dll', exists: true, error: 'Access denied' }]))
      .toMatchObject({ status: 'INCOMPLETE', exitCode: 2 })
  })

  it('没有显式标签不等于标签读取失败', async () => {
    expect(await assess({}, [{ path: 'electron.exe', exists: true, level: 'unspecified' }]))
      .toMatchObject({ status: 'PASS', exitCode: 0 })
  })

  it('进程超时即使留下健康快照也不能误报通过', async () => {
    const { assessGpuHealth } = await import('../../scripts/gpu-diagnostics.mjs')
    expect(assessGpuHealth({ probe: healthyProbe, processError: 'timeout' }))
      .toMatchObject({ status: 'INCOMPLETE', exitCode: 2 })
  })

  it('探针内部到期也不能把早期健康状态当成完整结果', async () => {
    expect(await assess({ reason: 'probe-timeout' })).toMatchObject({ status: 'INCOMPLETE', exitCode: 2 })
  })

  it('本轮遇到的 Low / Medium 和数字 SID 均可识别，不依赖系统显示语言', async () => {
    const { parseIntegrityLabel } = await import('../../scripts/gpu-diagnostics.mjs')
    expect(parseIntegrityLabel('S:AI(ML;ID;NW;;;LW)')).toBe('low')
    expect(parseIntegrityLabel('S:(ML;;NW;;;ME)')).toBe('medium')
    expect(parseIntegrityLabel('S:(ML;;NW;;;S-1-16-4096)')).toBe('low')
    expect(parseIntegrityLabel('S:(ML;;NW;;;HI)')).toBe('high')
    expect(parseIntegrityLabel('S:')).toBe('unspecified')
    expect(parseIntegrityLabel('S:AI')).toBe('unspecified')
    expect(parseIntegrityLabel('S:AINO_ACCESS_CONTROL')).toBe('unspecified')
    expect(parseIntegrityLabel(null)).toBe('unknown')
  })
})
