import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { OVERLAY_CSS } from './styles.ts'

type Tab = 'activity' | 'curator' | 'config' | 'status'

interface ActivityEntry {
  type?: string
  query?: string
  url?: string
  error?: string
  status?: number | string
  durationMs?: number
}

export function WebAccessOverlay() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('activity')
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [statusText, setStatusText] = useState('')
  const [curatorUrl, setCuratorUrl] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})

  const load = useCallback(async (next: Tab) => {
    if (next === 'activity') {
      const data = await json('/dsh-web-access/api/activity')
      setActivity(Array.isArray(data.entries) ? data.entries as ActivityEntry[] : [])
    } else if (next === 'curator' || next === 'status') {
      const data = await json('/dsh-web-access/api/status')
      setStatusText(String(data.text ?? ''))
      setCuratorUrl(typeof data.curatorUrl === 'string' ? data.curatorUrl : '')
    } else {
      setConfig(await json('/dsh-web-access/api/config'))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void load(tab)
    if (tab !== 'activity') return
    const timer = setInterval(() => { void load('activity') }, 1500)
    return () => clearInterval(timer)
  }, [open, tab, load])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (!(event.ctrlKey && event.shiftKey)) return
      if (event.key === 'W' || event.key === 'w') {
        event.preventDefault()
        setTab('activity')
        setOpen(value => tab === 'activity' ? !value : true)
      }
      if (event.key === 'S' || event.key === 's') {
        event.preventDefault()
        setTab('curator')
        setOpen(value => tab === 'curator' ? !value : true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, tab])

  return (
    <div id="dsh-web-access-root" data-dsh-web-access-slot="1">
      <style>{OVERLAY_CSS}</style>
      <button id="dwa-btn" type="button" title="联网访问 (Ctrl+Shift+W)" onClick={() => setOpen(value => !value)}>联网</button>
      <div id="dwa-mask" className={open ? 'open' : ''} onClick={() => setOpen(false)} />
      <div id="dwa-panel" className={open ? 'open' : ''} role="dialog" aria-modal="true" aria-labelledby="dwa-title">
        <div id="dwa-head">
          <h2 id="dwa-title">联网访问</h2>
          <button id="dwa-close" type="button" aria-label="关闭" onClick={() => setOpen(false)}>×</button>
        </div>
        <div id="dwa-tabs">
          {(['activity', 'curator', 'config', 'status'] as const).map(name => (
            <button key={name} type="button" className={tab === name ? 'on' : ''} onClick={() => setTab(name)}>
              {name === 'activity' ? '活动' : name === 'curator' ? '策展' : name === 'config' ? '配置' : '状态'}
            </button>
          ))}
        </div>
        <div id="dwa-body">
          {tab === 'activity' && <ActivityPane entries={activity} />}
          {tab === 'curator' && <CuratorPane url={curatorUrl} />}
          {tab === 'status' && <StatusPane text={statusText} />}
          {tab === 'config' && <ConfigPane config={config} onSaved={() => { void load('config') }} />}
        </div>
        <div id="dwa-foot">Esc 关闭 · Ctrl+Shift+W 活动 · Ctrl+Shift+S 策展</div>
      </div>
    </div>
  )
}

function ActivityPane({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return <div className="dwa-empty">还没有联网请求</div>
  return (
    <>
      {entries.map((entry, index) => {
        const cls = entry.error ? 'bad' : entry.status ? 'ok' : 'pend'
        return (
          <div className="dwa-row" key={index}>
            <span className={`dwa-dot ${cls}`} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="dwa-k">{entry.type === 'api' ? '搜索' : '抓取'}</span>
              {' '}{entry.query || entry.url || ''}
            </span>
            <span className={`dwa-meta ${cls}`}>{String(entry.error || entry.status || '进行中')} · {formatDuration(entry.durationMs)}</span>
          </div>
        )
      })}
    </>
  )
}

function CuratorPane({ url }: { url: string }) {
  if (!url) return <div className="dwa-empty">还没有策展会话<br />让模型使用「策展审阅」工作流，或运行 /websearch</div>
  return (
    <>
      <div className="dwa-toolbar">
        <span>策展会话进行中</span>
        <a href={url} target="_blank" rel="noreferrer">新窗口打开</a>
      </div>
      <iframe title="策展" src={url} />
    </>
  )
}

function StatusPane({ text }: { text: string }) {
  const rows = text.split('\n').filter(Boolean)
  if (rows.length === 0) return <div className="dwa-empty">暂无状态</div>
  return (
    <div className="dwa-card">
      {rows.map((line, index) => {
        const split = line.indexOf(':')
        if (split < 0) return <div className="dwa-row" key={index}><span className="dwa-v">{line}</span></div>
        return (
          <div className="dwa-row" key={index}>
            <span className="dwa-k">{line.slice(0, split)}</span>
            <span className="dwa-v">{line.slice(split + 1).trim()}</span>
          </div>
        )
      })}
    </div>
  )
}

function ConfigPane({ config, onSaved }: { config: Record<string, unknown>; onSaved: () => void }) {
  const keys = (config.keys ?? {}) as Record<string, boolean>
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const cookies = String(form.get('cookies') ?? '')
    const payload: Record<string, unknown> = {
      workflow: form.get('workflow'),
      provider: form.get('provider') || undefined,
      summaryModel: form.get('summary') || undefined,
      allowBrowserCookies: cookies === '' ? undefined : cookies === 'true',
    }
    for (const name of ['openai', 'brave', 'exa', 'tavily', 'jina', 'gemini']) {
      payload[`${name}ApiKey`] = form.get(name)
    }
    await json('/dsh-web-access/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    onSaved()
  }
  return (
    <form onSubmit={save}>
      <div className="dwa-card">
        <h3>搜索</h3>
        <div className="field">
          <label>工作流</label>
          <select name="workflow" defaultValue={String(config.workflow ?? 'auto-summary')}>
            <option value="auto-summary">自动摘要</option>
            <option value="summary-review">策展审阅</option>
            <option value="none">仅原始结果</option>
          </select>
        </div>
        <div className="field">
          <label>搜索提供方</label>
          <input name="provider" defaultValue={String(config.provider ?? config.searchProvider ?? '')} placeholder="auto / brave / exa / all" />
        </div>
        <div className="field">
          <label>允许浏览器 Cookie</label>
          <select name="cookies" defaultValue={config.allowBrowserCookies === true ? 'true' : config.allowBrowserCookies === false ? 'false' : ''}>
            <option value="">未设置</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </div>
      </div>
      <div className="dwa-card">
        <h3>摘要</h3>
        <div className="field">
          <label>摘要模型</label>
          <input name="summary" defaultValue={String(config.summaryModel ?? '')} placeholder="deepseek/... 或 google/gemini-..." />
        </div>
      </div>
      <div className="dwa-card">
        <h3>密钥</h3>
        {(['openai', 'brave', 'exa', 'tavily', 'jina', 'gemini'] as const).map(name => (
          <div className="field" key={name}>
            <label>{name}ApiKey</label>
            <input name={name} type="password" placeholder={keys[`${name}ApiKey`] ? '已配置' : '未设置'} />
          </div>
        ))}
      </div>
      <div className="dwa-actions">
        <button type="submit" className="dwa-save">保存</button>
      </div>
    </form>
  )
}

async function json(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init)
  return await response.json() as Record<string, unknown>
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '0ms'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}
