import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { isCommandEnabled, loadConfigSafe, normalizeQueryList, saveConfig } from './config.ts'
import {
  executeWebSearch,
  formatStatus,
  formatStoredResults,
  type Engine,
} from './engine.ts'
import { setActiveSession } from './storage.ts'
import { getActiveGoogleEmail, isGeminiWebAvailable } from './gemini-web.ts'

export function registerCommands(ctx: Context, engine: Engine): void {
  const commands = ctx.get('commands')
  if (!commands) return
  const config = loadConfigSafe()

  if (isCommandEnabled(config, 'websearch')) {
    commands.register({
      name: 'websearch',
      description: 'Run a web search, optionally opening the curator',
      input: { hint: '[query, query, ...]' },
      async handler(invocation) {
        setActiveSession(typeof invocation.agent.session?.id === 'string' ? invocation.agent.session.id : undefined)
        const queries = normalizeQueryList(invocation.rawInput.split(','))
        if (queries.length === 0) {
          return { kind: 'success', text: 'Usage: /websearch query one, query two' }
        }
        try {
          const result = await executeWebSearch(engine, {
            queries,
            workflow: engine.defaultWorkflow === 'none' ? 'auto-summary' : engine.defaultWorkflow,
          }, invocation.signal)
          return { kind: 'success', text: result.text }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })
  }

  if (isCommandEnabled(config, 'curator')) {
    commands.register({
      name: 'curator',
      description: 'Toggle or set the search curator workflow',
      input: { hint: '[on|off|none|summary-review|auto-summary]' },
      handler(invocation) {
        const arg = invocation.rawInput.trim().toLowerCase()
        if (!arg) {
          const next = engine.defaultWorkflow === 'summary-review' ? 'auto-summary' : 'summary-review'
          saveConfig({ workflow: next })
          engine.defaultWorkflow = next
          return { kind: 'success', text: `curator workflow is now ${next}` }
        }
        if (arg === 'on' || arg === 'summary-review') {
          saveConfig({ workflow: 'summary-review' })
          engine.defaultWorkflow = 'summary-review'
          return { kind: 'success', text: 'curator workflow is now summary-review' }
        }
        if (arg === 'off' || arg === 'none') {
          saveConfig({ workflow: 'none' })
          engine.defaultWorkflow = 'none'
          return { kind: 'success', text: 'curator workflow is now none' }
        }
        if (arg === 'auto-summary') {
          saveConfig({ workflow: 'auto-summary' })
          engine.defaultWorkflow = 'auto-summary'
          return { kind: 'success', text: 'curator workflow is now auto-summary' }
        }
        return { kind: 'error', text: 'Usage: /curator [on|off|none|summary-review|auto-summary]' }
      },
    })
  }

  if (isCommandEnabled(config, 'search')) {
    commands.register({
      name: 'search',
      description: 'List stored search and fetch results',
      handler(invocation) {
        setActiveSession(typeof invocation.agent.session?.id === 'string' ? invocation.agent.session.id : undefined)
        return { kind: 'success', text: formatStoredResults() }
      },
    })
  }

  if (isCommandEnabled(config, 'google-account')) {
    commands.register({
      name: 'google-account',
      description: 'Show the Google account used for Gemini Web cookies',
      async handler() {
        const cookies = await isGeminiWebAvailable()
        if (!cookies) return { kind: 'success', text: 'No Gemini Web cookies available. Set allowBrowserCookies or PI_ALLOW_BROWSER_COOKIES=1.' }
        const email = await getActiveGoogleEmail(cookies)
        return { kind: 'success', text: email ? `Active Google account: ${email}` : 'Gemini cookies found, but the account email could not be read.' }
      },
    })
  }

  commands.register({
    name: 'webaccess',
    description: 'Show dsh-web-access provider status',
    async handler() {
      return { kind: 'success', text: await formatStatus(engine) }
    },
  })
}
