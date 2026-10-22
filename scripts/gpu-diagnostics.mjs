#!/usr/bin/env node
// Local hardware/environment diagnostic. Deliberately separate from verify and CI.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const require = createRequire(import.meta.url)
const HELP = `npm run diagnose:gpu -- [--electron <runtime electron.exe>] [--output <directory>]
Local GPU health check; read-only, no automatic permission repair.
Exit codes: 0 PASS, 1 FAIL, 2 INCOMPLETE (or invalid arguments).
Reports default to out/gpu-diagnostics/<unique-run>/; no application data is loaded.
--help       Show help without launching Electron.
--timeout    Probe budget in milliseconds (5000..60000, default 15000).
--electron   Standalone Electron runtime binary; not a packaged Opia executable.
--output     Parent directory for a new report subdirectory (existing files are preserved).
`

export function parseIntegrityLabel(sddl) {
  if (typeof sddl !== 'string') return 'unknown'
  const ace = sddl.match(/\(ML;[^)]*\)/)?.[0]
  if (!ace) return sddl === '' || /^S:(?:AI|AR|P)*(?:NO_ACCESS_CONTROL)?$/.test(sddl) ? 'unspecified' : 'unknown'
  const sid = ace.slice(1, -1).split(';').at(-1)
  const aliases = { UN: 'untrusted', LW: 'low', ME: 'medium', MP: 'medium', HI: 'high', SI: 'system' }
  if (aliases[sid]) return aliases[sid]
  const rid = /^S-1-16-(\d+)$/.exec(sid)?.[1]
  if (!rid) return 'unknown'
  const value = Number(rid)
  return value < 4096 ? 'untrusted' : value < 8192 ? 'low' : value < 12288 ? 'medium' : value < 16384 ? 'high' : 'system'
}

export function assessGpuHealth({ probe, integrity = [], processError = null, integrityError = null }) {
  const failures = []
  const unknowns = []
  for (const file of integrity) {
    if (!file.exists) continue // Runtime versions can omit separately shipped ANGLE libraries.
    if (file.level === 'low' || file.level === 'untrusted') failures.push(`Low integrity runtime: ${file.path}`)
    else if (file.error || !file.level || file.level === 'unknown') unknowns.push(`Integrity unreadable: ${file.path}`)
  }
  if (integrityError) unknowns.push(`Integrity query: ${integrityError}`)
  if (processError) unknowns.push(`Probe process: ${processError}`)
  if (probe?.reason === 'probe-timeout') unknowns.push('GPU probe reached its deadline')
  if (!probe?.gpuInfoUpdated) unknowns.push('No gpu-info-update observed; GPU state is unknown')
  else {
    if (probe.hardwareAcceleration === false) failures.push('Hardware acceleration is disabled')
    else if (probe.hardwareAcceleration !== true) unknowns.push('Hardware acceleration state missing')
    for (const feature of ['gpu_compositing', 'rasterization']) {
      const value = probe.features?.[feature]
      if (typeof value !== 'string') unknowns.push(`GPU feature missing: ${feature}`)
      else if (!/^enabled(?:_|$)/.test(value)) failures.push(`${feature}: ${value}`)
    }
    if (probe.gpuInfoError) unknowns.push(`GPU info: ${probe.gpuInfoError}`)
    const devices = probe.gpuInfo?.gpuDevice
    if (!Array.isArray(devices) || !devices.some(device => device?.active)) unknowns.push('Active GPU information unavailable')
  }
  const status = failures.length ? 'FAIL' : unknowns.length ? 'INCOMPLETE' : 'PASS'
  return { status, exitCode: status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 2, findings: [...failures, ...unknowns] }
}

function parseOptions(args) {
  const options = { timeout: 15000, output: join(ROOT, 'out', 'gpu-diagnostics') }
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (!['--electron', '--output', '--timeout'].includes(name)) throw new Error(`Unknown argument: ${name}`)
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error(`Missing value: ${name}`)
    if (name === '--timeout') {
      options.timeout = Number(value)
      if (!Number.isInteger(options.timeout) || options.timeout < 5000 || options.timeout > 60000) throw new Error('Invalid --timeout (5000..60000)')
    } else options[name.slice(2)] = resolve(value)
  }
  return options
}

async function runProbe(executable, directory, timeout) {
  const stdout = openSync(join(directory, 'stdout.log'), 'wx')
  const stderr = openSync(join(directory, 'stderr.log'), 'wx')
  const env = { ...process.env }
  // Child-only cleanup. Preserve the parent environment and never print it.
  for (const name of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'ELECTRON_CLI_ARGS', 'NODE_OPTIONS']) delete env[name]
  let child
  try {
    child = spawn(executable, [
      '--enable-logging=file', `--log-file=${join(directory, 'chromium.log')}`, '--v=1',
      join(HERE, 'gpu-probe.cjs'), directory, String(timeout)
    ], { cwd: ROOT, env, stdio: ['ignore', stdout, stderr], windowsHide: true })
  } finally { closeSync(stdout); closeSync(stderr) }
  return await new Promise(resolveResult => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32') {
        // Scope forced cleanup to this run's unique marker, including GPU/renderer
        // children whose command lines contain this run's user-data directory.
        const cleanup = join(directory, 'stop-probe.ps1')
        const marker = directory.replaceAll("'", "''")
        const processName = basename(executable).replaceAll("'", "''")
        writeFileSync(cleanup, '\uFEFF' + [
          "$ErrorActionPreference = 'SilentlyContinue'",
          `$marker = '${marker}'`,
          `$processName = '${processName}'`,
          'Get-CimInstance Win32_Process | Where-Object {',
          '  $_.Name -eq $processName -and $_.CommandLine -and $_.CommandLine.Contains($marker)',
          '} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
        ].join('\r\n'), 'utf8')
        spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', cleanup],
          { windowsHide: true, stdio: 'ignore', timeout: 5000 })
      }
      child.kill()
    }, timeout)
    child.on('error', error => { clearTimeout(timer); resolveResult({ error: error.message }) })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolveResult({ code, signal, timedOut, error: timedOut ? 'timeout' : code !== 0 ? `exit ${code ?? signal}` : null })
    })
  })
}

function readIntegrity(executable) {
  if (process.platform !== 'win32') return { files: [], note: 'Windows integrity labels are not applicable' }
  // Set encoding before invoking the file, so even execution-policy errors are UTF-8.
  // Paths travel as environment values, never as interpolated PowerShell code.
  const bootstrap = [
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    '& $env:OPIA_GPU_LABEL_SCRIPT -RuntimeDirectory $env:OPIA_GPU_RUNTIME_DIR',
    'if (-not $?) { exit 1 }'
  ].join('\r\n')
  const result = spawnSync('powershell.exe', [
    // This read-only, repository-owned script can inherit Low and be blocked by
    // RemoteSigned. The override applies only to this child, never machine policy.
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', Buffer.from(bootstrap, 'utf16le').toString('base64')
  ], { encoding: 'utf8', windowsHide: true, timeout: 15000, env: {
    ...process.env, OPIA_GPU_LABEL_SCRIPT: join(HERE, 'gpu-integrity.ps1'), OPIA_GPU_RUNTIME_DIR: dirname(executable)
  } })
  if (result.error || result.status !== 0) return { files: [], error: result.error?.message || result.stderr.trim() || `exit ${result.status}` }
  try {
    const files = JSON.parse(result.stdout.replace(/^\uFEFF/, ''))
    return { files: files.map(file => ({ ...file, level: file.exists ? parseIntegrityLabel(file.sddl) : 'not-present' })) }
  } catch (error) { return { files: [], error: `Invalid label output: ${error.message}` } }
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { console.log(HELP); return 0 }
  let options
  try { options = parseOptions(args) }
  catch (error) { console.error(error.message); return 2 }
  mkdirSync(options.output, { recursive: true })
  const directory = mkdtempSync(join(options.output, 'run-'))
  const report = { schemaVersion: 1, createdAt: new Date().toISOString(), platform: process.platform, directory }
  try {
    report.executable = options.electron || require('electron')
    if (!existsSync(report.executable)) throw new Error(`Electron runtime not found: ${report.executable}`)
    const labels = readIntegrity(report.executable)
    report.integrity = labels.files
    report.integrityError = labels.error || null
    report.integrityNote = labels.note || null
    report.process = await runProbe(report.executable, directory, options.timeout)
    report.processError = report.process.error
    try { report.probe = JSON.parse(readFileSync(join(directory, 'probe.json'), 'utf8')) }
    catch (error) { report.processError = report.processError || `Probe evidence unavailable: ${error.message}` }
  } catch (error) { report.processError = error.message }
  Object.assign(report, assessGpuHealth(report))
  const log = join(directory, 'chromium.log')
  report.initializationErrors = existsSync(log) ? readFileSync(log, 'utf8').split(/\r?\n/)
    .filter(line => /InitializeStaticGLBindingsOneOff failed|Exiting GPU process|Failed to create shared context|ERROR:.*(?:gpu|viz)/i.test(line)).slice(0, 20) : []
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  const active = report.probe?.gpuInfo?.gpuDevice?.filter(device => device.active).map(device => device.deviceString || `vendor=${device.vendorId}, device=${device.deviceId}`) || []
  const summary = [
    `# GPU diagnostic: ${report.status}`, '',
    `- Active GPU: ${active.join(', ') || 'unknown'}`,
    `- Hardware acceleration: ${report.probe?.hardwareAcceleration ?? 'unknown'}`,
    `- GPU compositing: ${report.probe?.features?.gpu_compositing ?? 'unknown'}`,
    `- Rasterization: ${report.probe?.features?.rasterization ?? 'unknown'}`,
    `- GPU sandbox: ${report.probe?.gpuInfo?.auxAttributes?.sandboxed ?? 'unknown'}`, '',
    ...report.findings.map(finding => `- ${finding}`), '',
    'Scope: standalone hidden Electron probe, not FPS or packaged-app acceptance.',
    'Read-only: no ACL repair, GPU override, driver changes, or application profile access.',
    'See report.json for runtime versions and integrity labels; chromium.log for initialization evidence.', ''
  ].join('\n')
  writeFileSync(join(directory, 'report.md'), summary, 'utf8')
  console.log(summary)
  console.log(`Report: ${join(directory, 'report.md')}`)
  return report.exitCode
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main() }
  catch (error) { console.error(`[gpu-diagnostics] ${error.message}`); process.exitCode = 2 }
}
