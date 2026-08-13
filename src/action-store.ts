import { randomUUID } from 'node:crypto'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { Action, ActionBucket, ActionKind, ActionScope, ActionStatus } from './types.js'

export interface ActionProposal {
  key: string
  kind: ActionKind
  label: string
  content: string
  reason: string
  scope: ActionScope
}

const ACTION_KEY = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

function bounded(value: string, name: string, max: number): string {
  const text = value.trim()
  if (text.length === 0 || text.length > max) throw new Error(`${name} must contain 1-${max} characters`)
  return text
}

export function normalizeProposal(input: ActionProposal): ActionProposal {
  const key = bounded(input.key, 'key', 80).toLowerCase()
  if (!ACTION_KEY.test(key)) throw new Error('key must be a stable lowercase slug')
  if (!['command', 'prompt', 'instruction'].includes(input.kind)) throw new Error('unsupported action kind')
  if (!['workspace', 'session'].includes(input.scope)) throw new Error('unsupported action scope')
  const content = bounded(input.content, 'content', input.kind === 'command' ? 2000 : 4000)
  return {
    key,
    kind: input.kind,
    label: bounded(input.label, 'label', 80),
    content,
    reason: bounded(input.reason, 'reason', 500),
    scope: input.scope,
  }
}

function bucketKey(scope: ActionScope, ownerId: string): string {
  return `${scope === 'workspace' ? 'w' : 's'}:${ownerId}`
}

export class ActionStore {
  private readonly tails = new Map<string, Promise<void>>()

  constructor(private readonly table: KvTable<string, ActionBucket>) {}

  list(workspace: string, sessionId: string): Action[] {
    const workspaceActions = this.read('workspace', workspace)
    const sessionActions = this.read('session', sessionId)
    return [...workspaceActions, ...sessionActions].sort((left, right) =>
      Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt)
  }

  find(workspace: string, sessionId: string, actionId: string): Action | undefined {
    return this.list(workspace, sessionId).find(action => action.id === actionId)
  }

  async upsert(proposal: ActionProposal, workspace: string, sessionId: string): Promise<Action> {
    const value = normalizeProposal(proposal)
    const ownerId = value.scope === 'workspace' ? workspace : sessionId
    return await this.mutate(value.scope, ownerId, (actions) => {
      const now = Date.now()
      const existing = actions.find(action => action.key === value.key)
      if (existing !== undefined) {
        const updated: Action = { ...existing, ...value, updatedAt: now }
        return { actions: actions.map(action => action.id === existing.id ? updated : action), value: updated }
      }
      const created: Action = {
        ...value,
        id: randomUUID(),
        status: 'active',
        pinned: false,
        createdAt: now,
        updatedAt: now,
        useCount: 0,
      }
      if (actions.length >= 24) {
        const eviction = actions.filter(action => !action.pinned).sort((a, b) => a.updatedAt - b.updatedAt)[0]
        if (eviction === undefined) throw new Error('action library is full; unpin or hide an action first')
        return { actions: [...actions.filter(action => action.id !== eviction.id), created], value: created }
      }
      return { actions: [...actions, created], value: created }
    })
  }

  async setUserState(workspace: string, sessionId: string, actionId: string, patch: { status?: ActionStatus; pinned?: boolean }): Promise<Action> {
    const action = this.find(workspace, sessionId, actionId)
    if (action === undefined) throw new Error('action is no longer available')
    const ownerId = action.scope === 'workspace' ? workspace : sessionId
    return await this.mutate(action.scope, ownerId, (actions) => {
      const current = actions.find(candidate => candidate.id === actionId)
      if (current === undefined) throw new Error('action is no longer available')
      const updated: Action = { ...current, ...patch, updatedAt: Date.now() }
      return { actions: actions.map(candidate => candidate.id === actionId ? updated : candidate), value: updated }
    })
  }

  async hideByKey(scope: ActionScope, key: string, workspace: string, sessionId: string): Promise<boolean> {
    const ownerId = scope === 'workspace' ? workspace : sessionId
    const normalizedKey = bounded(key, 'key', 80).toLowerCase()
    const existing = this.read(scope, ownerId).find(action => action.key === normalizedKey)
    if (existing === undefined) return false
    await this.setUserState(workspace, sessionId, existing.id, { status: 'hidden' })
    return true
  }

  async markUsed(workspace: string, sessionId: string, actionId: string): Promise<Action> {
    const action = this.find(workspace, sessionId, actionId)
    if (action === undefined) throw new Error('action is no longer available')
    const ownerId = action.scope === 'workspace' ? workspace : sessionId
    return await this.mutate(action.scope, ownerId, (actions) => {
      const current = actions.find(candidate => candidate.id === actionId)
      if (current === undefined) throw new Error('action is no longer available')
      const now = Date.now()
      const updated: Action = { ...current, useCount: current.useCount + 1, lastUsedAt: now, updatedAt: now }
      return { actions: actions.map(candidate => candidate.id === actionId ? updated : candidate), value: updated }
    })
  }

  private read(scope: ActionScope, ownerId: string): Action[] {
    const bucket = this.table.get(bucketKey(scope, ownerId))
    if (bucket === undefined) return []
    if (bucket.ownerKind !== scope || bucket.ownerId !== ownerId) throw new Error('action bucket ownership mismatch')
    return bucket.actions
  }

  private async mutate<T>(scope: ActionScope, ownerId: string, change: (actions: Action[]) => { actions: Action[]; value: T }): Promise<T> {
    const key = bucketKey(scope, ownerId)
    const previous = this.tails.get(key) ?? Promise.resolve()
    let result!: T
    const operation = previous.then(async () => {
      const current = this.table.get(key)
      const actions = current === undefined ? [] : this.read(scope, ownerId)
      const changed = change(actions)
      result = changed.value
      await this.table.put(key, { ownerKind: scope, ownerId, actions: changed.actions })
    })
    const tail = operation.then(() => undefined, () => undefined)
    this.tails.set(key, tail)
    try {
      await operation
      return result
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}
