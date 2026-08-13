import type { Context } from 'cordis'
import type { ActionKind, ActionScope, ActionStatus } from '../types.js'

export interface Scope { sessionId: string; cwd?: string }
export interface Run { id: string; output: string; exited: boolean; exitCode: number | null }
export interface Action {
  id: string
  key: string
  kind: ActionKind
  label: string
  content: string
  reason: string
  scope: ActionScope
  status: ActionStatus
  pinned: boolean
  createdAt: number
  updatedAt: number
  useCount: number
  lastUsedAt?: number
  revision: string
  run: Run | null
}

interface SessionInput {
  state: { getSnapshot(): { draft: string } }
  setDraft(text: string): void
}

interface Conversation {
  input: { for(context: Context): SessionInput }
  send(text: string): Promise<void>
}

async function call<T>(path: string, scope: Scope, extra: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/dev-actions/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: scope.sessionId, ...extra }),
    signal,
  })
  const payload = await response.json() as { ok?: boolean; value?: T; error?: { message?: string } }
  if (!response.ok || payload.ok !== true) throw new Error(payload.error?.message ?? `HTTP ${response.status}`)
  return payload.value as T
}

function conversationFor(ctx: Context, sessionId: string): { scoped: Context; conversation: Conversation } {
  const sessions = ctx.sessions as { scope(id: string): Context | undefined }
  const scoped = sessions.scope(sessionId)
  const conversation = (ctx as unknown as { get(name: string): unknown }).get('conversation') as Conversation | undefined
  if (scoped === undefined || conversation === undefined) throw new Error('当前会话输入框尚未就绪')
  return { scoped, conversation }
}

export function insertDraft(ctx: Context, scope: Scope, text: string): void {
  const { scoped, conversation } = conversationFor(ctx, scope.sessionId)
  const input = conversation.input.for(scoped)
  const draft = input.state.getSnapshot().draft
  input.setDraft(draft.trim() === '' ? text : `${draft}\n\n${text}`)
}

export async function sendPrompt(ctx: Context, scope: Scope, text: string): Promise<void> {
  const session = (ctx.sessions as unknown as { binding(id: string): { session: { prompt(content: Array<{ type: 'text'; text: string }>, mode: 'queue'): Promise<{ ok: boolean; error?: { message?: string } }> } } | undefined }).binding(scope.sessionId)?.session
  if (session === undefined) throw new Error('当前会话尚未就绪')
  const result = await session.prompt([{ type: 'text', text }], 'queue')
  if (!result.ok) throw new Error(result.error?.message ?? '发送失败')
}

export const api = {
  state: (scope: Scope, signal?: AbortSignal) => call<{ actions: Action[] }>('state', scope, {}, signal),
  run: (scope: Scope, action: Action) => call<{ id: string }>('run', scope, { actionId: action.id, revision: action.revision }),
  used: (scope: Scope, action: Action) => call<{ accepted: true }>('used', scope, { actionId: action.id, revision: action.revision }),
  stop: (scope: Scope, actionId: string) => call<{ ok: true }>('stop', scope, { actionId }),
  setState: (scope: Scope, action: Action, patch: { status?: ActionStatus; pinned?: boolean }) => call<{ action: Action }>('state-set', scope, { actionId: action.id, revision: action.revision, ...patch }),
  feedback: (scope: Scope, action: Action, feedback: string) => call<{ accepted: true }>('feedback', scope, { actionId: action.id, revision: action.revision, feedback }),
}
