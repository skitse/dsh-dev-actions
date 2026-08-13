import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { DevActionsContext, Feedback, Offer } from './types.js'
import { isTrustedRequest } from './trust-fence.js'
import { fail, ok, readJson, stringField } from './wire.js'

export const name = 'dsh-dev-actions'
export const inject = ['webServer', 'sessions', 'tools', 'loader']

interface Run {
  id: string
  offerId: string
  sessionId: string
  command: string
  child: ChildProcessWithoutNullStreams
  output: string
  exited: boolean
  exitCode: number | null
}

const MAX_OUTPUT = 128 * 1024
const MAX_OFFERS = 6
const runs = new Map<string, Run>()
const offersBySession = new Map<string, Offer[]>()
const feedbackBySession = new Map<string, Feedback[]>()

function append(run: Run, text: string): void { run.output = (run.output + text).slice(-MAX_OUTPUT) }

function cwdFor(ctx: DevActionsContext, sessionId: string): string {
  const cwd = ctx.sessions.get(sessionId)?.header.cwd
  if (cwd === undefined || cwd === '') throw new Error('session has no attached workspace')
  return resolve(cwd)
}

function trustedHostsOf(ctx: DevActionsContext): string[] {
  for (const entry of ctx.loader.entries()) {
    if (entry.options.name === 'connection') {
      const config = entry.options.config as { trustedHosts?: unknown } | undefined
      return Array.isArray(config?.trustedHosts) ? config.trustedHosts.filter((host): host is string => typeof host === 'string') : []
    }
  }
  return []
}

function offerFor(sessionId: string, id: string): Offer | undefined { return offersBySession.get(sessionId)?.find(offer => offer.id === id) }
function runForOffer(sessionId: string, offerId: string): Run | undefined { return [...runs.values()].find(run => run.sessionId === sessionId && run.offerId === offerId && !run.exited) }
function stop(run: Run): void { if (!run.exited) run.child.kill('SIGINT') }

function startRun(offer: Offer, sessionId: string, cwd: string): Run {
  const child = spawn(process.env.SHELL || '/bin/sh', ['-lc', offer.command], { cwd, env: process.env })
  const run: Run = { id: randomUUID(), offerId: offer.id, sessionId, command: offer.command, child, output: '', exited: false, exitCode: null }
  child.stdout.on('data', chunk => append(run, String(chunk)))
  child.stderr.on('data', chunk => append(run, String(chunk)))
  child.once('error', error => { append(run, `${error.message}\n`); run.exited = true })
  child.once('close', code => { run.exited = true; run.exitCode = code })
  runs.set(run.id, run)
  return run
}

function registerTools(ctx: DevActionsContext): () => void {
  const disposers: Array<() => void> = []
  disposers.push(ctx.tools.register(defineTool({
    name: 'dev_action_offer',
    description: 'Offer one repeated, user-approved development command in the Dev Actions panel. Use it only for a command the user is likely to run or inspect more than once during this task. The panel exposes the exact command and reason; it never runs until the user clicks it. The command runs only in the current session workspace.',
    parameters: {
      label: { type: 'string', required: true, description: 'Short user-facing action label, for example "Run iOS simulator" or "Start web preview".' },
      command: { type: 'string', required: true, description: 'Exact shell command to show to the user and run after their click. Do not include cd; the session workspace is already the working directory.' },
      reason: { type: 'string', required: true, description: 'Why this action is useful for the current change or acceptance step.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: { offered: { type: 'boolean', required: true }, id: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: `Dev Action ${(value as { id: string }).id} is available in the panel. The user can inspect and run it, or ignore it.` }] },
    execute: (args: { label: string; command: string; reason: string }, exec) => {
      const sessionId = exec.agent?.session.id
      if (sessionId === undefined) throw new Error('dev_action_offer requires an agent session')
      if (args.label.length > 80 || args.command.length > 2000 || args.reason.length > 500) throw new Error('dev action text is too long')
      const current = offersBySession.get(sessionId) ?? []
      const duplicate = current.find(offer => offer.command === args.command)
      if (duplicate !== undefined) return Promise.resolve({ offered: true, id: duplicate.id })
      const offer: Offer = { id: randomUUID(), label: args.label, command: args.command, reason: args.reason, createdAt: Date.now() }
      offersBySession.set(sessionId, [...current, offer].slice(-MAX_OFFERS))
      return Promise.resolve({ offered: true, id: offer.id })
    },
  })))
  disposers.push(ctx.tools.register(defineTool({
    name: 'dev_action_feedback_read',
    description: 'Read explicit user verification or issue feedback sent from the Dev Actions panel for the current session. Use this when a user has run a proposed action or said they tested it.',
    parameters: {},
    output: { schema: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string', required: true }, command: { type: 'string', required: true }, text: { type: 'string', required: true }, createdAt: { type: 'integer', required: true } } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: (_args, exec) => {
      const sessionId = exec.agent?.session.id
      if (sessionId === undefined) throw new Error('dev_action_feedback_read requires an agent session')
      const feedback = feedbackBySession.get(sessionId) ?? []
      feedbackBySession.delete(sessionId)
      return Promise.resolve(feedback)
    },
  })))
  return () => { for (const dispose of disposers) dispose() }
}

export function apply(ctx: DevActionsContext): void {
  const disposeTools = registerTools(ctx)
  ctx.effect(() => () => {
    disposeTools()
    for (const run of runs.values()) stop(run)
    runs.clear(); offersBySession.clear(); feedbackBySession.clear()
  }, 'dsh-dev-actions: cleanup')
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: '/dev-actions/api',
    handler: async (req, res) => {
      if (!isTrustedRequest(req, trustedHostsOf(ctx))) { fail(res, 403, 'untrusted host'); return }
      if (req.method !== 'POST') { fail(res, 405, 'method not allowed'); return }
      try {
        const body = await readJson(req)
        const sessionId = stringField(body, 'sessionId')
        cwdFor(ctx, sessionId)
        const path = new URL(req.url ?? '/', 'http://dsh.internal').pathname.slice('/dev-actions/api/'.length)
        if (path === 'state') {
          const offers = (offersBySession.get(sessionId) ?? []).map(offer => {
            const run = runForOffer(sessionId, offer.id)
            return { ...offer, run: run === undefined ? null : { id: run.id, output: run.output, exited: run.exited, exitCode: run.exitCode } }
          })
          ok(res, { offers }); return
        }
        const offerId = stringField(body, 'offerId')
        const offer = offerFor(sessionId, offerId)
        if (offer === undefined) throw new Error('action is no longer available')
        if (path === 'run') {
          if (runForOffer(sessionId, offer.id) !== undefined) throw new Error('this action is already running')
          const run = startRun(offer, sessionId, cwdFor(ctx, sessionId))
          ok(res, { id: run.id }); return
        }
        if (path === 'stop') { const run = runForOffer(sessionId, offer.id); if (run !== undefined) stop(run); ok(res, { ok: true }); return }
        if (path === 'feedback') {
          const text = stringField(body, 'feedback')
          const feedback = feedbackBySession.get(sessionId) ?? []
          feedback.push({ label: offer.label, command: offer.command, text, createdAt: Date.now() })
          feedbackBySession.set(sessionId, feedback.slice(-20)); ok(res, { accepted: true }); return
        }
        fail(res, 404, 'unknown dev action')
      } catch (error) { fail(res, 400, error instanceof Error ? error.message : String(error)) }
    },
  }), 'dsh-dev-actions: api')
}

export { feedbackBySession, offersBySession, runs, startRun }
