import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { applyPublicConfig, getPublicConfig } from './public-config.ts'
import { formatStatus, type Engine } from './engine.ts'
import { getActivitySnapshot, getLastCuratorUrl } from './ui-state.ts'

interface WebServer {
  register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void
  tapIndex?(transform: (html: string) => string): () => void
}

export function registerWebUi(ctx: Context, engine: Engine): void {
  const server = ctx.get('webServer') as WebServer | undefined
  if (!server) return

  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/api/config', handler: (req, res) => handleConfig(req, res) }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/api/status', handler: (_req, res) => void handleStatus(engine, res) }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/api/activity', handler: (_req, res) => handleActivity(res) }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/ui.js', handler: (_req, res) => send(res, 200, overlayScript(), 'application/javascript; charset=utf-8') }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/panel', handler: (_req, res) => send(res, 200, panelHtml(), 'text/html; charset=utf-8') }))
  if (server.tapIndex) {
    ctx.effect(() => server.tapIndex!(html => html.includes('dsh-web-access/ui.js')
      ? html
      : html.replace('</body>', '<script src="/dsh-web-access/ui.js" defer></script></body>')))
  }
}

async function handleConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET') {
    sendJson(res, 200, getPublicConfig())
    return
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const body = await readJson(req)
      sendJson(res, 200, applyPublicConfig(body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}))
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }
  res.writeHead(405)
  res.end()
}

async function handleStatus(engine: Engine, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    text: await formatStatus(engine),
    curatorUrl: getLastCuratorUrl(),
  })
}

function handleActivity(res: ServerResponse): void {
  sendJson(res, 200, getActivitySnapshot())
}

function send(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8')
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => {
      raw += chunk
      if (raw.length > 64 * 1024) reject(new Error('config payload too large'))
    })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) }
      catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

function panelHtml(): string {
  return `<!doctype html><meta charset="utf-8"><title>dsh-web-access</title><p>Open the Web Access panel from the floating button, or load <code>/dsh-web-access/ui.js</code>.</p>`
}

function overlayScript(): string {
  return `(() => {
  if (window.__dshWebAccessUi) return;
  window.__dshWebAccessUi = true;
  const root = document.createElement('div');
  root.id = 'dsh-web-access-root';
  root.innerHTML = \`
    <style>
      #dsh-web-access-root { all: initial; font-family: ui-sans-serif, system-ui, sans-serif; }
      #dsh-web-access-root * { box-sizing: border-box; }
      #dwa-btn, #dwa-panel { position: fixed; z-index: 2147483000; }
      #dwa-btn { right: 16px; bottom: 16px; border: 0; border-radius: 999px; padding: 10px 14px; background: #111; color: #fff; cursor: pointer; box-shadow: 0 8px 24px rgb(0 0 0 / 25%); }
      #dwa-panel { display: none; right: 16px; bottom: 60px; width: min(420px, calc(100vw - 24px)); height: min(560px, calc(100vh - 88px)); background: #111; color: #f4f4f5; border-radius: 16px; overflow: hidden; box-shadow: 0 16px 48px rgb(0 0 0 / 35%); }
      #dwa-panel.open { display: flex; flex-direction: column; }
      #dwa-tabs { display: flex; gap: 4px; padding: 8px; background: #1c1c1f; }
      #dwa-tabs button { flex: 1; border: 0; background: transparent; color: #a1a1aa; padding: 8px; border-radius: 8px; cursor: pointer; }
      #dwa-tabs button.on { background: #27272a; color: #fff; }
      #dwa-body { flex: 1; overflow: auto; padding: 12px; font-size: 13px; line-height: 1.45; }
      #dwa-body input, #dwa-body select, #dwa-body textarea { width: 100%; margin: 4px 0 10px; padding: 8px; border-radius: 8px; border: 1px solid #3f3f46; background: #18181b; color: #fff; }
      #dwa-body label { color: #a1a1aa; display: block; }
      #dwa-body button.save { border: 0; background: #2563eb; color: #fff; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
      .dwa-row { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid #27272a; }
      .ok { color: #4ade80; } .bad { color: #f87171; } .pend { color: #fbbf24; }
      iframe { width: 100%; height: 100%; border: 0; background: #fff; }
    </style>
    <button id="dwa-btn" title="Web Access (Ctrl+Shift+W)">Web</button>
    <div id="dwa-panel">
      <div id="dwa-tabs">
        <button data-tab="activity" class="on">Activity</button>
        <button data-tab="curator">Curator</button>
        <button data-tab="config">Config</button>
        <button data-tab="status">Status</button>
      </div>
      <div id="dwa-body"></div>
    </div>
  \`;
  document.documentElement.appendChild(root);
  const panel = root.querySelector('#dwa-panel');
  const body = root.querySelector('#dwa-body');
  let tab = 'activity';
  const open = (name) => { tab = name; panel.classList.add('open'); root.querySelectorAll('#dwa-tabs button').forEach(btn => btn.classList.toggle('on', btn.dataset.tab === name)); void render(); };
  const toggle = (name = tab) => { if (panel.classList.contains('open') && tab === name) panel.classList.remove('open'); else open(name); };
  root.querySelector('#dwa-btn').addEventListener('click', () => toggle());
  root.querySelectorAll('#dwa-tabs button').forEach(btn => btn.addEventListener('click', () => open(btn.dataset.tab)));
  window.addEventListener('keydown', ev => {
    if (!(ev.ctrlKey && ev.shiftKey)) return;
    if (ev.key === 'W' || ev.key === 'w') { ev.preventDefault(); toggle('activity'); }
    if (ev.key === 'S' || ev.key === 's') { ev.preventDefault(); toggle('curator'); }
  });
  async function j(url, opt) { const res = await fetch(url, opt); return res.json(); }
  async function render() {
    if (tab === 'activity') {
      const data = await j('/dsh-web-access/api/activity');
      body.innerHTML = data.entries.length ? data.entries.map(e => {
        const cls = e.error ? 'bad' : e.status ? 'ok' : 'pend';
        return '<div class="dwa-row"><span>' + esc(e.type) + ' ' + esc(e.query || e.url || '') + '</span><span class="' + cls + '">' + esc(e.error || e.status || '...') + ' ' + e.durationMs + 'ms</span></div>';
      }).join('') : '<p>No requests yet.</p>';
    } else if (tab === 'curator') {
      const data = await j('/dsh-web-access/api/status');
      body.innerHTML = data.curatorUrl ? '<iframe src="' + esc(data.curatorUrl) + '"></iframe>' : '<p>No curator session yet. Ask the agent to search with workflow summary-review, or run /websearch.</p>';
    } else if (tab === 'status') {
      const data = await j('/dsh-web-access/api/status');
      body.innerHTML = '<pre>' + esc(data.text || '') + '</pre>';
    } else {
      const cfg = await j('/dsh-web-access/api/config');
      body.innerHTML = \`
        <label>workflow</label>
        <select id="dwa-workflow">
          <option value="auto-summary">auto-summary</option>
          <option value="summary-review">summary-review</option>
          <option value="none">none</option>
        </select>
        <label>provider</label><input id="dwa-provider" placeholder="auto / brave / exa / all">
        <label>summaryModel</label><input id="dwa-summary" placeholder="deepseek/... or google/gemini-...">
        <label>allowBrowserCookies</label><select id="dwa-cookies"><option value="">unset</option><option value="true">true</option><option value="false">false</option></select>
        <label>openaiApiKey</label><input id="dwa-openai" type="password" placeholder="\${cfg.keys?.openaiApiKey ? 'configured' : 'not set'}">
        <label>braveApiKey</label><input id="dwa-brave" type="password" placeholder="\${cfg.keys?.braveApiKey ? 'configured' : 'not set'}">
        <label>exaApiKey</label><input id="dwa-exa" type="password" placeholder="\${cfg.keys?.exaApiKey ? 'configured' : 'not set'}">
        <label>tavilyApiKey</label><input id="dwa-tavily" type="password" placeholder="\${cfg.keys?.tavilyApiKey ? 'configured' : 'not set'}">
        <label>jinaApiKey</label><input id="dwa-jina" type="password" placeholder="\${cfg.keys?.jinaApiKey ? 'configured' : 'not set'}">
        <label>geminiApiKey</label><input id="dwa-gemini" type="password" placeholder="\${cfg.keys?.geminiApiKey ? 'configured' : 'not set'}">
        <button class="save" id="dwa-save">Save</button>
      \`;
      body.querySelector('#dwa-workflow').value = cfg.workflow || 'auto-summary';
      body.querySelector('#dwa-provider').value = cfg.provider || cfg.searchProvider || '';
      body.querySelector('#dwa-summary').value = cfg.summaryModel || '';
      body.querySelector('#dwa-cookies').value = cfg.allowBrowserCookies === true ? 'true' : cfg.allowBrowserCookies === false ? 'false' : '';
      body.querySelector('#dwa-save').onclick = async () => {
        const cookies = body.querySelector('#dwa-cookies').value;
        await j('/dsh-web-access/api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          workflow: body.querySelector('#dwa-workflow').value,
          provider: body.querySelector('#dwa-provider').value || undefined,
          summaryModel: body.querySelector('#dwa-summary').value || undefined,
          allowBrowserCookies: cookies === '' ? undefined : cookies === 'true',
          openaiApiKey: body.querySelector('#dwa-openai').value,
          braveApiKey: body.querySelector('#dwa-brave').value,
          exaApiKey: body.querySelector('#dwa-exa').value,
          tavilyApiKey: body.querySelector('#dwa-tavily').value,
          jinaApiKey: body.querySelector('#dwa-jina').value,
          geminiApiKey: body.querySelector('#dwa-gemini').value,
        })});
        void render();
      };
    }
  }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, function(c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'": '&#39;'})[c]; }); }
  setInterval(() => { if (panel.classList.contains('open') && tab === 'activity') void render(); }, 1500);
})();`
}
