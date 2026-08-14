import type { IncomingMessage, ServerResponse } from 'node:http'

export const CURATOR_MOUNT_PATH = '/dsh-web-access/curator'

export type CuratorHandler = (req: IncomingMessage, res: ServerResponse, pathname: string, search: string) => void | Promise<void>

const handlers = new Map<string, CuratorHandler>()
let publicOrigin = ''

export function setCuratorPublicOrigin(origin: string): void {
  publicOrigin = origin.replace(/\/$/, '')
}

export function getCuratorPublicOrigin(): string {
  return publicOrigin
}

export function curatorPageUrl(sessionToken: string): string {
  const path = `${CURATOR_MOUNT_PATH}/?session=${encodeURIComponent(sessionToken)}`
  return publicOrigin ? `${publicOrigin}${path}` : path
}

export function registerCuratorHandler(sessionToken: string, handler: CuratorHandler): () => void {
  handlers.set(sessionToken, handler)
  return () => {
    if (handlers.get(sessionToken) === handler) handlers.delete(sessionToken)
  }
}

export function hasMountedCurator(): boolean {
  return publicOrigin.length > 0 || handlers.size >= 0
}

export function isCuratorMountEnabled(): boolean {
  return publicOrigin.length > 0
}

export function dispatchCuratorRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
  if (!url.pathname.startsWith(CURATOR_MOUNT_PATH)) return false
  let pathname = url.pathname.slice(CURATOR_MOUNT_PATH.length) || '/'
  if (!pathname.startsWith('/')) pathname = `/${pathname}`
  const token = url.searchParams.get('session')
  if (!token) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Missing session')
    return true
  }
  const handler = handlers.get(token)
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('No curator session')
    return true
  }
  void handler(req, res, pathname, url.search)
  return true
}
