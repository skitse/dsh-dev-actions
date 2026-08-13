export interface Scope { sessionId: string; cwd?: string }
export interface Run { id: string; output: string; exited: boolean; exitCode: number | null }
export interface Offer { id: string; label: string; command: string; reason: string; createdAt: number; run: Run | null }

async function call<T>(path: string, scope: Scope, extra: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/dev-actions/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: scope.sessionId, ...extra }) })
  const payload = await response.json() as { ok?: boolean; value?: T; error?: { message?: string } }
  if (!response.ok || payload.ok !== true) throw new Error(payload.error?.message ?? `HTTP ${response.status}`)
  return payload.value as T
}

export const api = {
  state: (scope: Scope) => call<{ offers: Offer[] }>('state', scope),
  run: (scope: Scope, offerId: string) => call<{ id: string }>('run', scope, { offerId }),
  stop: (scope: Scope, offerId: string) => call<{ ok: true }>('stop', scope, { offerId }),
  feedback: (scope: Scope, offerId: string, feedback: string) => call<{ accepted: true }>('feedback', scope, { offerId, feedback }),
}
