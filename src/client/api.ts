export interface Scope { sessionId: string; cwd?: string }
export interface Device { id: string; name: string }
export interface Run { id: string; command: string; output: string; exited: boolean; exitCode: number | null }
export interface Offer { id: string; action: 'flutter.run' | 'flutter.test' | 'flutter.analyze'; message: string; suggestedDevice?: string; createdAt: number }

async function call<T>(path: string, scope: Scope, extra: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/dev-actions/api/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: scope.sessionId, ...(scope.cwd === undefined ? {} : { cwd: scope.cwd }), ...extra }),
  })
  const payload = await response.json() as { ok?: boolean; value?: T; error?: { message?: string } }
  if (!response.ok || payload.ok !== true) throw new Error(payload.error?.message ?? `HTTP ${response.status}`)
  return payload.value as T
}

export const api = {
  state: (scope: Scope) => call<{ cwd: string; project: 'flutter' | 'unknown'; offer: Offer | null; run: Run | null }>('state', scope),
  devices: (scope: Scope) => call<Device[]>('devices', scope),
  run: (scope: Scope, device: string) => call<{ id: string; command: string }>('run', scope, { device }),
  input: (scope: Scope, input: 'r' | 'R' | 'q') => call<{ ok: true }>('input', scope, { input }),
  stop: (scope: Scope) => call<{ ok: true }>('stop', scope),
  feedback: (scope: Scope, feedback: string) => call<{ accepted: true }>('feedback', scope, { feedback }),
}
