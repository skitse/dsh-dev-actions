import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Domain, DomainSpec } from '@deepseek-ai/dsh-storage-domain'
import type { Context } from 'cordis'

export interface DevActionsWebServer { register(route: { kind: 'prefix' | 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void; registerUpgrade(route: unknown): () => void }
export interface DevActionsSession { header: { cwd?: string }; events?: readonly unknown[] }
export interface DevActionsSessionStore { get(id: string): DevActionsSession | undefined }
export interface DevActionsTools { register(tool: unknown): () => void }
export interface DevActionsLoader { entries(): Iterable<{ options: { name: string; config?: unknown } }> }
export interface DevActionsSystemPrompt { section(section: { name: string; order: number; text: string }): () => void }
export interface DevActionsStorageDomain { open<S extends DomainSpec>(spec: S): Promise<Domain<S>> }
export interface DevActionsSkills { register(skill: { name: string; description: string; source: string; content: string; invocation?: { modelInvocable: boolean; userInvocable: boolean } }): () => void }
export interface ManagedShellProcess {
  status: 'running' | 'completed' | 'killed'
  exitCode: number | null
  done: Promise<void>
  readOutput(): { delta: string }
  kill(): boolean
}
export interface DevActionsShell {
  resolve(request: { command: string; workdir: string; stdoutMaxBytes: number; sandboxPolicy: unknown }): unknown
  start(spec: unknown): ManagedShellProcess
}
export interface DevActionsSandboxPolicy { resolve(request: { session: unknown }): unknown }
export type DevActionsContext = Context & {
  webServer: DevActionsWebServer
  sessions: DevActionsSessionStore
  tools: DevActionsTools
  loader: DevActionsLoader
  systemPrompt: DevActionsSystemPrompt
  storageDomain: DevActionsStorageDomain
  skills: DevActionsSkills
  shell: DevActionsShell
  sandboxPolicy: DevActionsSandboxPolicy
}

export type ActionKind = 'command' | 'prompt' | 'instruction'
export type ActionScope = 'workspace' | 'session'
export type ActionStatus = 'active' | 'hidden'

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
}

export interface ActionBucket {
  ownerKind: ActionScope
  ownerId: string
  actions: Action[]
}

export interface Feedback {
  actionId: string
  key: string
  kind: ActionKind
  label: string
  content: string
  text: string
  createdAt: number
}
