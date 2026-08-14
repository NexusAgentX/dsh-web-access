import { activityMonitor } from './activity.ts'

let lastCuratorUrl: string | null = null

export function setLastCuratorUrl(url: string | null): void {
  lastCuratorUrl = url
}

export function getLastCuratorUrl(): string | null {
  return lastCuratorUrl
}

export function getActivitySnapshot() {
  return {
    entries: activityMonitor.getEntries().map(entry => ({
      id: entry.id,
      type: entry.type,
      query: entry.query,
      url: entry.url,
      status: entry.status,
      error: entry.error,
      startTime: entry.startTime,
      endTime: entry.endTime,
      durationMs: entry.endTime ? entry.endTime - entry.startTime : Date.now() - entry.startTime,
    })),
    curatorUrl: lastCuratorUrl,
  }
}
