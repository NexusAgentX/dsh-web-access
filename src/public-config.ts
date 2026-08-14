import { loadConfig, loadConfigSafe, resetConfigCache, saveConfig } from './config.ts'

const KEY_FIELDS = [
  'openaiApiKey', 'braveApiKey', 'exaApiKey', 'tavilyApiKey', 'jinaApiKey',
  'perplexityApiKey', 'geminiApiKey', 'firecrawlApiKey', 'kagiApiKey',
  'parallelApiKey', 'tinyfishApiKey', 'search1apiApiKey', 'bochaApiKey',
] as const

const PUBLIC_FIELDS = [
  'workflow', 'provider', 'searchProvider', 'summaryModel', 'autoOpenBrowser',
  'allowBrowserCookies', 'chromeProfile', 'maxInlineContentChars', 'curatorTimeoutSeconds',
] as const

export function getPublicConfig(): Record<string, unknown> {
  const config = loadConfigSafe() as Record<string, unknown>
  const keys: Record<string, boolean> = {}
  for (const field of KEY_FIELDS) keys[field] = isConfigured(config[field])
  const publicConfig: Record<string, unknown> = { keys }
  for (const field of PUBLIC_FIELDS) {
    if (config[field] !== undefined) publicConfig[field] = config[field]
  }
  return publicConfig
}

const listeners = new Set<(config: Record<string, unknown>) => void>()

export function onPublicConfigChange(listener: (config: Record<string, unknown>) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function applyPublicConfig(updates: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const field of PUBLIC_FIELDS) {
    if (field in updates) next[field] = updates[field]
  }
  const keys = updates.keys
  if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
    for (const field of KEY_FIELDS) {
      const value = (keys as Record<string, unknown>)[field]
      if (typeof value === 'string' && value.trim() && value !== '********') next[field] = value.trim()
    }
  }
  for (const field of KEY_FIELDS) {
    if (typeof updates[field] === 'string' && updates[field].trim() && updates[field] !== '********') {
      next[field] = (updates[field] as string).trim()
    }
  }
  saveConfig(next)
  resetConfigCache()
  loadConfig()
  const published = getPublicConfig()
  for (const listener of listeners) {
    try { listener(published) }
    catch { /* a UI listener must not block config writes */ }
  }
  return published
}

function isConfigured(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  return value !== undefined && value !== null && value !== false
}
