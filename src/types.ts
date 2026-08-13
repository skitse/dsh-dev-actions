import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from 'cordis'

export interface DevActionsWebServer {
  register(route: { kind: 'prefix' | 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void
  registerUpgrade(route: unknown): () => void
}

export interface DevActionsSessionStore {
  get(id: string): { header: { cwd?: string } } | undefined
}

export interface DevActionsTools { register(tool: unknown): () => void }

export type DevActionsContext = Context & {
  webServer: DevActionsWebServer
  sessions: DevActionsSessionStore
  tools: DevActionsTools
}

export interface Offer {
  id: string
  action: 'flutter.run'
  message: string
  suggestedDevice?: string
  createdAt: number
}
