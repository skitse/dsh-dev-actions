import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { Action, ActionBucket } from './types.js'

const safeTime = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

export const actionSchema = z.object({
  id: z.uuid(),
  key: z.string().min(1).max(80),
  kind: z.enum(['command', 'prompt', 'instruction']),
  label: z.string().min(1).max(80),
  content: z.string().min(1).max(4000),
  reason: z.string().min(1).max(500),
  scope: z.enum(['workspace', 'session']),
  status: z.enum(['active', 'hidden']),
  pinned: z.boolean(),
  createdAt: safeTime,
  updatedAt: safeTime,
  useCount: z.number().int().nonnegative(),
  lastUsedAt: safeTime.optional(),
}).refine(action => action.updatedAt >= action.createdAt, {
  path: ['updatedAt'],
  message: 'updatedAt must not precede createdAt',
}) as z.ZodType<Action>

export const actionBucketSchema = z.object({
  ownerKind: z.enum(['workspace', 'session']),
  ownerId: z.string().min(1),
  actions: z.array(actionSchema).max(24),
}).superRefine((bucket, ctx) => {
  const ids = new Set<string>()
  const keys = new Set<string>()
  bucket.actions.forEach((action, index) => {
    if (ids.has(action.id)) ctx.addIssue({ code: 'custom', path: ['actions', index, 'id'], message: 'duplicate action id' })
    if (keys.has(action.key)) ctx.addIssue({ code: 'custom', path: ['actions', index, 'key'], message: 'duplicate action key' })
    if (action.scope !== bucket.ownerKind) ctx.addIssue({ code: 'custom', path: ['actions', index, 'scope'], message: 'action scope does not match bucket' })
    ids.add(action.id)
    keys.add(action.key)
  })
}) as z.ZodType<ActionBucket>

export const devActionsDomainSpec = defineDomain({
  name: 'dev_actions',
  version: 0,
  tables: {
    buckets: domainTable<string, ActionBucket>(actionBucketSchema),
  },
})
