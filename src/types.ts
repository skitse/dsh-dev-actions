import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from 'cordis'

export interface DevActionsWebServer { register(route: { kind: 'prefix' | 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void; registerUpgrade(route: unknown): () => void }
export interface DevActionsSessionStore { get(id: string): { header: { cwd?: string } } | undefined }
export interface DevActionsTools { register(tool: unknown): () => void }
export interface DevActionsLoader { entries(): Iterable<{ options: { name: string; config?: unknown } }> }
export type DevActionsContext = Context & { webServer: DevActionsWebServer; sessions: DevActionsSessionStore; tools: DevActionsTools; loader: DevActionsLoader }
export interface Offer { id: string; label: string; command: string; reason: string; createdAt: number }
export interface Feedback { label: string; command: string; text: string; createdAt: number }
