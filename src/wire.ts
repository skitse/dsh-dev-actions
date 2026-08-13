import type { IncomingMessage, ServerResponse } from 'node:http'

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += bytes.byteLength
    if (size > 64 * 1024) throw new Error('request too large')
    chunks.push(bytes)
  }
  const body = Buffer.concat(chunks).toString('utf8')
  const value: unknown = body === '' ? {} : JSON.parse(body)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('object body required')
  return value as Record<string, unknown>
}

export function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function ok(res: ServerResponse, value: unknown): void { json(res, 200, { ok: true, value }) }
export function fail(res: ServerResponse, status: number, message: string): void { json(res, status, { ok: false, error: { message } }) }

export function stringField(body: Record<string, unknown>, key: string, max = 200): string {
  const value = body[key]
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new Error(`${key} must be a non-empty string`)
  return value
}

export function optionalStringField(body: Record<string, unknown>, key: string, max = 200): string | undefined {
  const value = body[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new Error(`${key} must be a non-empty string`)
  return value
}

export function booleanField(body: Record<string, unknown>, key: string, optional = false): boolean | undefined {
  const value = body[key]
  if (optional && value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`)
  return value
}
