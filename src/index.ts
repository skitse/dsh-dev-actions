import { createHash, randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { ActionStore, type ActionProposal } from './action-store.js'
import { devActionsDomainSpec } from './storage.js'
import { DEV_ACTIONS_SKILL_CONTENT, DEV_ACTIONS_SKILL_DESCRIPTION, DEV_ACTIONS_SKILL_NAME } from './skill.js'
import type { Action, ActionBucket, ActionKind, ActionScope, DevActionsContext, Feedback, ManagedShellProcess } from './types.js'
import { isTrustedRequest } from './trust-fence.js'
import { booleanField, fail, ok, optionalStringField, readJson, stringField } from './wire.js'

export const name = 'dsh-dev-actions'
export const inject = ['webServer', 'sessions', 'tools', 'loader', 'systemPrompt', 'storageDomain', 'skills', 'shell', 'sandboxPolicy']

export const DEV_ACTIONS_GUIDANCE = `The Dev Actions panel is installed. It is a compact, user-controlled library of reusable actions beside the conversation.

Proactively maintain it with dev_action_upsert whenever, during development, you identify an operation the user is likely to need again. Do not wait for the user to ask for a button. Suitable actions include:
- command: repeatable shell work such as starting a dev server, running a focused test, launching Flutter on a chosen device, opening a simulator, tailing logs, or rebuilding generated files;
- prompt: a repeatable task request that should be sent as a new queued user turn;
- instruction: a recurring preference or direction the user often gives the AI, inserted into the composer for review before sending.

Only add high-value actions that remove repeated navigation, device IDs, paths, flags, or wording. Use a stable lowercase key so a later call updates the same action instead of creating duplicates. Prefer workspace scope for enduring project workflows and session scope for temporary acceptance steps. Do not add one-off commands, destructive actions, secrets, credential values, or commands whose effect the user cannot understand from the visible content. Keep the panel concise. The model may propose or update entries but never executes them; execution and sending require an explicit user click. Use dev_action_list before making several changes, dev_action_retire when an entry is obsolete, and dev_action_feedback_read after the user verifies or reports an issue.`

interface Run {
  id: string
  actionId: string
  sessionId: string
  process: ManagedShellProcess
  output: string
  exited: boolean
  exitCode: number | null
}

interface PublicRun { id: string; output: string; exited: boolean; exitCode: number | null }

function actionRevision(action: Action): string {
  return createHash('sha256').update(JSON.stringify([
    action.id, action.kind, action.content, action.status, action.updatedAt,
  ])).digest('hex').slice(0, 24)
}

const MAX_OUTPUT = 128 * 1024
const runs = new Map<string, Run>()
const feedbackBySession = new Map<string, Feedback[]>()

function append(run: Run, text: string): void {
  run.output = (run.output + text).slice(-MAX_OUTPUT)
}

function syncRun(run: Run): void {
  append(run, run.process.readOutput().delta)
  if (run.process.status !== 'running') {
    run.exited = true
    run.exitCode = run.process.exitCode
  }
}

function scopeFor(ctx: DevActionsContext, sessionId: string): { sessionId: string; workspace: string } {
  const cwd = ctx.sessions.get(sessionId)?.header.cwd
  if (cwd === undefined || cwd === '') throw new Error('session has no attached workspace')
  return { sessionId, workspace: realpathSync(cwd) }
}

function trustedHostsOf(ctx: DevActionsContext): string[] {
  for (const entry of ctx.loader.entries()) {
    if (entry.options.name === 'connection') {
      const config = entry.options.config as { trustedHosts?: unknown } | undefined
      return Array.isArray(config?.trustedHosts)
        ? config.trustedHosts.filter((host): host is string => typeof host === 'string')
        : []
    }
  }
  return []
}

function runForAction(sessionId: string, actionId: string): Run | undefined {
  return [...runs.values()].find(run => run.sessionId === sessionId && run.actionId === actionId && !run.exited)
}

function latestRunForAction(sessionId: string, actionId: string): Run | undefined {
  return [...runs.values()].reverse().find(run => run.sessionId === sessionId && run.actionId === actionId)
}

async function stop(run: Run): Promise<void> {
  if (!run.exited) run.process.kill()
  await run.process.done
  syncRun(run)
}

function startRun(ctx: DevActionsContext, action: Action, sessionId: string, cwd: string): Run {
  const session = ctx.sessions.get(sessionId)
  if (session === undefined) throw new Error('session is no longer available')
  if (runs.size >= 50) {
    for (const [runId, run] of runs) if (run.exited) runs.delete(runId)
    if (runs.size >= 50) throw new Error('too many development actions are running')
  }
  const sandboxPolicy = ctx.sandboxPolicy.resolve({ session })
  const process = ctx.shell.start(ctx.shell.resolve({
    command: action.content,
    workdir: cwd,
    stdoutMaxBytes: MAX_OUTPUT,
    sandboxPolicy,
  }))
  const run: Run = {
    id: randomUUID(), actionId: action.id, sessionId,
    process, output: '', exited: false, exitCode: null,
  }
  runs.set(run.id, run)
  void process.done.then(() => syncRun(run))
  return run
}

function publicAction(action: Action, sessionId: string): Action & { revision: string; run: PublicRun | null } {
  const run = latestRunForAction(sessionId, action.id)
  if (run !== undefined) syncRun(run)
  return {
    ...action,
    revision: actionRevision(action),
    run: run === undefined ? null : {
      id: run.id,
      output: run.output,
      exited: run.exited,
      exitCode: run.exitCode,
    },
  }
}

function actionOutput(action: Action): { id: string; key: string; kind: ActionKind; scope: ActionScope; label: string } {
  return { id: action.id, key: action.key, kind: action.kind, scope: action.scope, label: action.label }
}

function registerTools(ctx: DevActionsContext, store: ActionStore): () => void {
  const disposers: Array<() => void> = []
  disposers.push(ctx.tools.register(defineTool({
    name: 'dev_action_upsert',
    description: 'Proactively add or update one high-value reusable action in the Dev Actions panel. Use a stable key; calling again with the same key and scope updates the existing entry. The model only maintains the visible entry. A command never runs and a prompt/instruction never sends until the user explicitly clicks it.',
    parameters: {
      key: { type: 'string', required: true, description: 'Stable lowercase slug, e.g. flutter.ios.run or test.auth.focused.' },
      kind: { type: 'string', required: true, enum: ['command', 'prompt', 'instruction'], description: 'command runs in the workspace; prompt queues a user turn; instruction is inserted into the composer for review.' },
      label: { type: 'string', required: true, description: 'Short user-facing button label.' },
      content: { type: 'string', required: true, description: 'Exact command, prompt, or instruction shown to the user.' },
      reason: { type: 'string', required: true, description: 'Concise reason this is worth reusing.' },
      scope: { type: 'string', required: true, enum: ['workspace', 'session'], description: 'workspace persists across project sessions; session is for temporary acceptance work.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', required: true }, key: { type: 'string', required: true },
        kind: { type: 'string', required: true }, scope: { type: 'string', required: true }, label: { type: 'string', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: `Reusable action "${(value as { label: string }).label}" is available in the panel.` }],
    },
    execute: async (args: ActionProposal, exec) => {
      const sessionId = exec.agent?.session.id
      if (sessionId === undefined) throw new Error('dev_action_upsert requires an agent session')
      const scope = scopeFor(ctx, sessionId)
      return actionOutput(await store.upsert(args, scope.workspace, sessionId))
    },
  })))
  disposers.push(ctx.tools.register(defineTool({
    name: 'dev_action_list',
    description: 'List the current workspace and session Dev Actions before proposing several entries or deciding whether an action should be updated or retired.',
    parameters: { includeHidden: { type: 'boolean', description: 'Include actions the user or model has hidden.' } },
    output: {
      schema: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', required: true }, key: { type: 'string', required: true }, kind: { type: 'string', required: true },
        scope: { type: 'string', required: true }, label: { type: 'string', required: true }, content: { type: 'string', required: true },
        reason: { type: 'string', required: true }, status: { type: 'string', required: true }, pinned: { type: 'boolean', required: true },
        useCount: { type: 'integer', required: true },
      } } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args: { includeHidden?: boolean }, exec) => {
      const sessionId = exec.agent?.session.id
      if (sessionId === undefined) throw new Error('dev_action_list requires an agent session')
      const scope = scopeFor(ctx, sessionId)
      const actions = store.list(scope.workspace, sessionId)
        .filter(action => args.includeHidden === true || action.status === 'active')
        .map(({ createdAt: _createdAt, updatedAt: _updatedAt, lastUsedAt: _lastUsedAt, ...action }) => action)
      return Promise.resolve(actions)
    },
  })))
  disposers.push(ctx.tools.register(defineTool({
    name: 'dev_action_retire',
    description: 'Hide an obsolete action by its stable key. Do this when a workflow, device, script, or habitual instruction is no longer valid. Hidden entries remain recoverable by the user.',
    parameters: {
      key: { type: 'string', required: true, description: 'Stable action key.' },
      scope: { type: 'string', required: true, enum: ['workspace', 'session'] },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: { retired: { type: 'boolean', required: true } } }, render: (_args, value) => [{ type: 'text', text: (value as { retired: boolean }).retired ? 'Action hidden.' : 'No matching action found.' }] },
    execute: async (args: { key: string; scope: ActionScope }, exec) => {
      const sessionId = exec.agent?.session.id
      if (sessionId === undefined) throw new Error('dev_action_retire requires an agent session')
      const scope = scopeFor(ctx, sessionId)
      return { retired: await store.hideByKey(args.scope, args.key, scope.workspace, sessionId) }
    },
  })))
  disposers.push(ctx.tools.register(defineTool({
    name: 'dev_action_feedback_read',
    description: 'Read and clear explicit verification or issue feedback sent from Dev Actions in the current session.',
    parameters: {},
    output: { schema: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      actionId: { type: 'string', required: true }, key: { type: 'string', required: true }, kind: { type: 'string', required: true },
      label: { type: 'string', required: true }, content: { type: 'string', required: true }, text: { type: 'string', required: true }, createdAt: { type: 'integer', required: true },
    } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
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

function registerApi(ctx: DevActionsContext, store: ActionStore): () => void {
  return ctx.webServer.register({
    kind: 'prefix',
    path: '/dev-actions/api',
    handler: async (req, res) => {
      if (!isTrustedRequest(req, trustedHostsOf(ctx))) { fail(res, 403, 'untrusted host'); return }
      if (req.method !== 'POST') { fail(res, 405, 'method not allowed'); return }
      try {
        const body = await readJson(req)
        const sessionId = stringField(body, 'sessionId')
        const scope = scopeFor(ctx, sessionId)
        const path = new URL(req.url ?? '/', 'http://dsh.internal').pathname.slice('/dev-actions/api/'.length)
        if (path === 'state') {
          const actions = store.list(scope.workspace, sessionId).map(action => publicAction(action, sessionId))
          ok(res, { actions }); return
        }
        const actionId = stringField(body, 'actionId')
        const action = store.find(scope.workspace, sessionId, actionId)
        if (action === undefined) throw new Error('action is no longer available')
        const requireCurrentRevision = (): void => {
          if (stringField(body, 'revision', 64) !== actionRevision(action)) throw new Error('action changed; refresh and review it again')
        }
        if (path === 'run') {
          if (action.kind !== 'command') throw new Error('only command actions run on the host')
          if (action.status !== 'active') throw new Error('hidden actions cannot run')
          requireCurrentRevision()
          if (runForAction(sessionId, action.id) !== undefined) throw new Error('this action is already running')
          const run = startRun(ctx, action, sessionId, scope.workspace)
          try {
            await store.markUsed(scope.workspace, sessionId, action.id)
          } catch (error) {
            await stop(run)
            throw error
          }
          ok(res, { id: run.id }); return
        }
        if (path === 'used') {
          if (action.status !== 'active') throw new Error('hidden actions cannot be used')
          requireCurrentRevision()
          await store.markUsed(scope.workspace, sessionId, action.id)
          ok(res, { accepted: true }); return
        }
        if (path === 'stop') {
          const run = runForAction(sessionId, action.id)
          if (run !== undefined) await stop(run)
          ok(res, { ok: true }); return
        }
        if (path === 'state-set') {
          requireCurrentRevision()
          const status = optionalStringField(body, 'status')
          if (status !== undefined && status !== 'active' && status !== 'hidden') throw new Error('invalid status')
          const pinned = booleanField(body, 'pinned', true)
          if (status === undefined && pinned === undefined) throw new Error('state change is empty')
          const updated = await store.setUserState(scope.workspace, sessionId, action.id, {
            ...(status !== undefined ? { status } : {}),
            ...(pinned !== undefined ? { pinned } : {}),
          })
          ok(res, { action: publicAction(updated, sessionId) }); return
        }
        if (path === 'feedback') {
          requireCurrentRevision()
          const text = stringField(body, 'feedback', 1000)
          const feedback = feedbackBySession.get(sessionId) ?? []
          feedback.push({ actionId: action.id, key: action.key, kind: action.kind, label: action.label, content: action.content, text, createdAt: Date.now() })
          feedbackBySession.set(sessionId, feedback.slice(-20))
          ok(res, { accepted: true }); return
        }
        fail(res, 404, 'unknown dev action')
      } catch (error) {
        fail(res, 400, error instanceof Error ? error.message : String(error))
      }
    },
  })
}

async function setup(ctx: DevActionsContext): Promise<() => Promise<void>> {
  const domain = await ctx.storageDomain.open(devActionsDomainSpec)
  const disposers: Array<() => void> = []
  try {
    const table = domain.table('buckets') as KvTable<string, ActionBucket>
    const store = new ActionStore(table)
    disposers.push(registerTools(ctx, store))
    disposers.push(ctx.systemPrompt.section({ name: 'plugin:dev-actions', order: 205, text: DEV_ACTIONS_GUIDANCE }))
    disposers.push(ctx.skills.register({
      name: DEV_ACTIONS_SKILL_NAME,
      description: DEV_ACTIONS_SKILL_DESCRIPTION,
      source: 'runtime',
      content: DEV_ACTIONS_SKILL_CONTENT,
      invocation: { modelInvocable: true, userInvocable: true },
    }))
    disposers.push(registerApi(ctx, store))
    return async () => {
      for (const dispose of disposers.reverse()) dispose()
      await Promise.all([...runs.values()].map(run => stop(run)))
      runs.clear()
      feedbackBySession.clear()
      await domain.close()
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    await domain.close()
    throw error
  }
}

export function apply(ctx: DevActionsContext): void {
  ctx.effect(() => {
    let cleanup: (() => Promise<void>) | undefined
    let disposed = false
    const ready = setup(ctx).then(value => {
      if (disposed) return value()
      cleanup = value
    })
    return async () => {
      disposed = true
      await ready
      await cleanup?.()
    }
  }, 'dsh-dev-actions: setup')
}

export { ActionStore, feedbackBySession, runs }
