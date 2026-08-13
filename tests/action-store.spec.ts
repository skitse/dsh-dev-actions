import { describe, expect, it } from 'vitest'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { ActionStore, normalizeProposal } from '../src/action-store.js'
import { actionBucketSchema } from '../src/storage.js'
import type { ActionBucket } from '../src/types.js'

class MemoryTable implements KvTable<string, ActionBucket> {
  private readonly values = new Map<string, ActionBucket>()
  get(key: string): ActionBucket | undefined { return this.values.get(key) }
  entries(): IterableIterator<[string, ActionBucket]> { return new Map(this.values).entries() }
  keys(): IterableIterator<string> { return new Map(this.values).keys() }
  get size(): number { return this.values.size }
  async put(key: string, value: ActionBucket): Promise<void> { this.values.set(key, structuredClone(value)) }
  async delete(key: string): Promise<boolean> { return this.values.delete(key) }
  async update(key: string, fn: (current: ActionBucket) => ActionBucket): Promise<ActionBucket> {
    const current = this.values.get(key)
    if (current === undefined) throw new Error('missing')
    const next = fn(current)
    this.values.set(key, structuredClone(next))
    return next
  }
}

const proposal = {
  key: 'flutter.ios.run', kind: 'command' as const, label: '运行 iOS',
  content: 'flutter run -d ios', reason: '反复验收界面', scope: 'workspace' as const,
}

describe('action proposal', () => {
  it('normalizes stable keys and rejects unsafe shapes', () => {
    expect(normalizeProposal({ ...proposal, key: ' Flutter.IOS.Run ' }).key).toBe('flutter.ios.run')
    expect(() => normalizeProposal({ ...proposal, key: 'bad key' })).toThrow('stable lowercase slug')
    expect(() => normalizeProposal({ ...proposal, content: ' ' })).toThrow('content must contain')
  })
})

describe('ActionStore', () => {
  it('upserts by key, persists across sessions in one workspace, and tracks use', async () => {
    const store = new ActionStore(new MemoryTable())
    const first = await store.upsert(proposal, '/workspace', 'session-a')
    const updated = await store.upsert({ ...proposal, label: '启动 iOS 预览' }, '/workspace', 'session-b')
    expect(updated.id).toBe(first.id)
    expect(store.list('/workspace', 'session-c')).toHaveLength(1)
    expect(store.list('/workspace', 'session-c')[0]?.label).toBe('启动 iOS 预览')
    await store.markUsed('/workspace', 'session-c', first.id)
    expect(store.list('/workspace', 'session-c')[0]?.useCount).toBe(1)
  })

  it('keeps session actions isolated and lets hidden actions recover', async () => {
    const store = new ActionStore(new MemoryTable())
    const action = await store.upsert({ ...proposal, key: 'verify.login', scope: 'session', kind: 'prompt', content: '检查登录流程' }, '/workspace', 'session-a')
    expect(store.list('/workspace', 'session-b')).toHaveLength(0)
    await store.setUserState('/workspace', 'session-a', action.id, { status: 'hidden', pinned: true })
    expect(store.list('/workspace', 'session-a')[0]).toMatchObject({ status: 'hidden', pinned: true })
    await store.upsert({ ...proposal, key: 'verify.login', scope: 'session', kind: 'prompt', content: '重新检查登录流程' }, '/workspace', 'session-a')
    expect(store.list('/workspace', 'session-a')[0]?.status).toBe('hidden')
    await store.setUserState('/workspace', 'session-a', action.id, { status: 'active' })
    expect(store.list('/workspace', 'session-a')[0]?.status).toBe('active')
  })

  it('writes schema-valid buckets', async () => {
    const table = new MemoryTable()
    const store = new ActionStore(table)
    await store.upsert(proposal, '/workspace', 'session-a')
    const bucket = [...table.entries()][0]?.[1]
    expect(() => actionBucketSchema.parse(bucket)).not.toThrow()
  })

  it('fails loudly when a full action library has no evictable entry', async () => {
    const store = new ActionStore(new MemoryTable())
    for (let index = 0; index < 24; index += 1) {
      const action = await store.upsert({ ...proposal, key: `pinned.${index}` }, '/workspace', 'session-a')
      await store.setUserState('/workspace', 'session-a', action.id, { pinned: true })
    }
    await expect(store.upsert({ ...proposal, key: 'new.action' }, '/workspace', 'session-a')).rejects.toThrow('action library is full')
    expect(store.list('/workspace', 'session-a')).toHaveLength(24)
  })
})
