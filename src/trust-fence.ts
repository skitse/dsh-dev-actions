import type { IncomingHttpHeaders } from 'node:http'

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function authority(value: string): URL | undefined {
  try { return new URL(`http://${value}`) } catch { return undefined }
}

function loopback(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function trusted(host: URL, entries: readonly string[]): boolean {
  return entries.some(entry => {
    const allowed = authority(entry)
    if (allowed === undefined) return false
    return allowed.port === '' ? allowed.hostname === host.hostname : allowed.host === host.host
  })
}

export function isTrustedRequest(request: { headers: IncomingHttpHeaders }, trustedHosts: readonly string[]): boolean {
  const host = header(request.headers, 'host')
  if (host === undefined) return false
  const hostUrl = authority(host)
  if (hostUrl === undefined || (!loopback(hostUrl.hostname) && !trusted(hostUrl, trustedHosts))) return false
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(request.headers, 'origin')
  if (origin === undefined) return true
  try { return new URL(origin).host === hostUrl.host } catch { return false }
}
