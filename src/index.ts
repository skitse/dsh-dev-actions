import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { DevActionsContext, Offer } from './types.js'
import { fail, ok, readJson, stringField } from './wire.js'

export const name = 'dsh-dev-actions'
export const inject = ['webServer', 'sessions', 'tools']

interface Run {
  id: string
  sessionId: string
  cwd: string
  command: string
  child: ChildProcessWithoutNullStreams
  output: string
  exited: boolean
  exitCode: number | null
}

const MAX_OUTPUT = 128 * 1024
const runs = new Map<string, Run>()
const offers = new Map<string, Offer>()

function append(run: Run, text: string): void {
  run.output = (run.output + text).slice(-MAX_OUTPUT)
}

function cwdFor(ctx: DevActionsContext, sessionId: string, supplied?: string): string {
  const header = ctx.sessions.get(sessionId)?.header.cwd
  const cwd = header || supplied
  if (cwd === undefined || cwd === '') throw new Error('session has no workspace')
  return resolve(cwd)
}

async function flutterAvailable(cwd: string): Promise<boolean> {
  try { await access(join(cwd, 'pubspec.yaml'), constants.F_OK); return true } catch { return false }
}

function runFor(sessionId: string): Run | undefined {
  for (const run of runs.values()) if (run.sessionId === sessionId && !run.exited) return run
  return undefined
}

function registerOfferTool(ctx: DevActionsContext): () => void {
  return ctx.tools.register(defineTool({
    name: 'dev_action_offer',
    description: 'Offer the user a safe, session-scoped development action in the Dev Actions panel. Use this after changing code when the user should run or inspect the app. Do not pass shell commands or device ids.',
    parameters: {
      action: { type: 'string', enum: ['flutter.run', 'flutter.test', 'flutter.analyze'], required: true },
      message: { type: 'string', required: true },
      suggestedDevice: { type: 'string' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { offered: { type: 'boolean', required: true }, id: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: `Dev action offered in the panel (id ${(value as { id: string }).id}). The user can run it or ignore it.` }],
    },
    execute: (args: { action: Offer['action']; message: string; suggestedDevice?: string }, exec) => {
      const sessionId = exec.agent?.session.id
      if (sessionId === undefined) throw new Error('dev_action_offer requires an agent session')
      const offer: Offer = { id: randomUUID(), action: args.action, message: args.message, suggestedDevice: args.suggestedDevice, createdAt: Date.now() }
      offers.set(sessionId, offer)
      return Promise.resolve({ offered: true, id: offer.id })
    },
  }))
}

export function apply(ctx: DevActionsContext): void {
  const disposeTool = registerOfferTool(ctx)
  ctx.effect(() => disposeTool, 'dsh-dev-actions: offer tool')
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dev-actions/api',
    handler: async (req, res) => {
      if (req.method !== 'POST') { fail(res, 405, 'method not allowed'); return }
      try {
        const body = await readJson(req)
        const sessionId = stringField(body, 'sessionId')
        const cwd = cwdFor(ctx, sessionId, typeof body.cwd === 'string' ? body.cwd : undefined)
        const path = new URL(req.url ?? '/', 'http://dsh.internal').pathname.slice('/dev-actions/api/'.length)
        if (path === 'state') {
          const isFlutter = await flutterAvailable(cwd)
          const active = runFor(sessionId)
          ok(res, { cwd, project: isFlutter ? 'flutter' : 'unknown', offer: offers.get(sessionId) ?? null, run: active === undefined ? null : { id: active.id, command: active.command, output: active.output, exited: active.exited, exitCode: active.exitCode } })
          return
        }
        if (path === 'devices') {
          if (!(await flutterAvailable(cwd))) throw new Error('pubspec.yaml not found in workspace')
          const child = spawn('flutter', ['devices', '--machine'], { cwd, env: process.env })
          let stdout = ''; let stderr = ''
          child.stdout.on('data', chunk => { stdout += String(chunk) }); child.stderr.on('data', chunk => { stderr += String(chunk) })
          const code = await new Promise<number | null>(resolveDone => child.on('close', resolveDone))
          if (code !== 0) throw new Error(stderr.trim() || `flutter devices exited with ${code}`)
          const parsed: unknown = JSON.parse(stdout)
          ok(res, Array.isArray(parsed) ? parsed.map(item => ({ id: item && typeof item === 'object' && 'id' in item ? String(item.id) : '', name: item && typeof item === 'object' && 'name' in item ? String(item.name) : '' })).filter(item => item.id !== '') : [])
          return
        }
        if (path === 'run') {
          const device = stringField(body, 'device')
          if (runFor(sessionId) !== undefined) throw new Error('a dev action is already running for this session')
          const child = spawn('flutter', ['run', '-d', device], { cwd, env: process.env })
          const run: Run = { id: randomUUID(), sessionId, cwd, command: `flutter run -d ${device}`, child, output: '', exited: false, exitCode: null }
          child.stdout.on('data', chunk => append(run, String(chunk))); child.stderr.on('data', chunk => append(run, String(chunk)))
          child.on('close', code => { run.exited = true; run.exitCode = code })
          runs.set(run.id, run); ok(res, { id: run.id, command: run.command }); return
        }
        if (path === 'input') {
          const run = runFor(sessionId); if (run === undefined) throw new Error('no active Flutter run')
          const input = stringField(body, 'input'); if (!['r', 'R', 'q'].includes(input)) throw new Error('input must be r, R, or q')
          run.child.stdin.write(input); ok(res, { ok: true }); return
        }
        if (path === 'stop') {
          const run = runFor(sessionId); if (run !== undefined) run.child.kill('SIGINT'); ok(res, { ok: true }); return
        }
        if (path === 'feedback') {
          const feedback = stringField(body, 'feedback'); offers.delete(sessionId); ok(res, { accepted: true, feedback }); return
        }
        fail(res, 404, 'unknown dev action')
      } catch (error) { fail(res, 400, error instanceof Error ? error.message : String(error)) }
    },
  }), 'dsh-dev-actions: api')
}

export { runs, offers }
