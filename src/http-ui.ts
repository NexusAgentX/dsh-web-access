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
      #dsh-web-access-root {
        font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif);
        color: var(--dsw-alias-label-primary);
      }
      #dsh-web-access-root * { box-sizing: border-box; }
      #dwa-btn, #dwa-panel { position: fixed; z-index: 2147483000; }
      #dwa-btn {
        right: 16px; bottom: 16px; border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 999px; padding: 8px 14px; cursor: pointer;
        background: var(--dsw-alias-button-floating-fill);
        color: var(--dsw-alias-label-primary);
        box-shadow: var(--dsw-shadow-lv2);
        font: 500 13px/20px var(--dsw-font-family);
      }
      #dwa-btn:hover { background: var(--dsw-alias-button-floating-hover); }
      #dwa-btn:focus-visible, #dwa-panel button:focus-visible, #dwa-body input:focus-visible, #dwa-body select:focus-visible {
        outline: 2px solid var(--dsw-alias-state-business-primary);
        outline-offset: 2px;
      }
      #dwa-panel {
        display: none; right: 16px; bottom: 56px;
        width: min(420px, calc(100vw - 24px)); height: min(560px, calc(100vh - 88px));
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 12px; overflow: hidden;
        box-shadow: var(--dsw-shadow-lv3);
      }
      #dwa-panel.open { display: flex; flex-direction: column; }
      #dwa-head {
        padding: 12px 14px 0;
        font: 600 14px/22px var(--dsw-font-family);
      }
      #dwa-tabs {
        display: flex; gap: 4px; padding: 8px 10px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-module-platform);
      }
      #dwa-tabs button {
        flex: 1; border: 0; background: transparent;
        color: var(--dsw-alias-label-secondary);
        padding: 6px 8px; border-radius: 8px; cursor: pointer;
        font: 500 13px/20px var(--dsw-font-family);
      }
      #dwa-tabs button:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
      #dwa-tabs button.on {
        background: var(--dsw-specific-sidebar-nav-item-active);
        color: var(--dsw-alias-label-primary);
      }
      #dwa-body {
        flex: 1; overflow: auto; padding: 12px 14px;
        font: 400 13px/20px var(--dsw-font-family);
        color: var(--dsw-alias-label-secondary);
        scrollbar-color: var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l2)) transparent;
      }
      #dwa-body p { margin: 0 0 8px; }
      #dwa-body pre {
        margin: 0; white-space: pre-wrap;
        font-family: var(--ds-font-family-code, ui-monospace, monospace);
        font-size: 12px; line-height: 18px;
        color: var(--dsw-alias-label-primary);
      }
      #dwa-body input, #dwa-body select, #dwa-body textarea {
        width: 100%; margin: 4px 0 12px; padding: 8px 10px; border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-specific-input-major);
        color: var(--dsw-alias-label-primary);
        font: 400 13px/20px var(--dsw-font-family);
      }
      #dwa-body input::placeholder { color: var(--dsw-alias-label-caption); }
      #dwa-body label {
        color: var(--dsw-alias-label-tertiary);
        display: block; font: 500 12px/18px var(--dsw-font-family);
      }
      #dwa-body button.save {
        border: 0; border-radius: 8px; cursor: pointer; padding: 8px 14px;
        background: var(--dsw-alias-button-info-fill);
        color: var(--dsw-alias-label-primary-inverted);
        font: 500 13px/20px var(--dsw-font-family);
      }
      #dwa-body button.save:hover { background: var(--dsw-alias-button-info-hover); }
      .dwa-row {
        display: flex; justify-content: space-between; gap: 8px;
        padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l1);
        color: var(--dsw-alias-label-primary);
      }
      .ok { color: var(--dsw-alias-state-success-primary); }
      .bad { color: var(--dsw-alias-state-error-primary); }
      .pend { color: var(--dsw-alias-state-warn-label); }
      iframe { width: 100%; height: 100%; border: 0; background: var(--dsw-alias-bg-base); }
      @media (prefers-reduced-motion: reduce) {
        #dwa-btn, #dwa-panel, #dwa-tabs button, #dwa-body button.save { transition: none; }
      }
    </style>
    <button id="dwa-btn" title="联网访问 (Ctrl+Shift+W)">联网</button>
    <div id="dwa-panel" role="dialog" aria-label="联网访问">
      <div id="dwa-head">联网访问</div>
      <div id="dwa-tabs">
        <button data-tab="activity" class="on">活动</button>
        <button data-tab="curator">策展</button>
        <button data-tab="config">配置</button>
        <button data-tab="status">状态</button>
      </div>
      <div id="dwa-body"></div>
    </div>
  \`;
  (document.body || document.documentElement).appendChild(root);
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
      }).join('') : '<p>还没有请求。</p>';
    } else if (tab === 'curator') {
      const data = await j('/dsh-web-access/api/status');
      body.innerHTML = data.curatorUrl ? '<iframe src="' + esc(data.curatorUrl) + '"></iframe>' : '<p>还没有策展会话。让模型用 workflow: summary-review 搜索，或运行 /websearch。</p>';
    } else if (tab === 'status') {
      const data = await j('/dsh-web-access/api/status');
      body.innerHTML = '<pre>' + esc(data.text || '') + '</pre>';
    } else {
      const cfg = await j('/dsh-web-access/api/config');
      body.innerHTML = \`
        <label>工作流</label>
        <select id="dwa-workflow">
          <option value="auto-summary">自动摘要</option>
          <option value="summary-review">策展审阅</option>
          <option value="none">仅原始结果</option>
        </select>
        <label>搜索提供方</label><input id="dwa-provider" placeholder="auto / brave / exa / all">
        <label>摘要模型</label><input id="dwa-summary" placeholder="deepseek/... 或 google/gemini-...">
        <label>允许浏览器 Cookie</label><select id="dwa-cookies"><option value="">未设置</option><option value="true">是</option><option value="false">否</option></select>
        <label>OpenAI Key</label><input id="dwa-openai" type="password" placeholder="\${cfg.keys?.openaiApiKey ? '已配置' : '未设置'}">
        <label>Brave Key</label><input id="dwa-brave" type="password" placeholder="\${cfg.keys?.braveApiKey ? '已配置' : '未设置'}">
        <label>Exa Key</label><input id="dwa-exa" type="password" placeholder="\${cfg.keys?.exaApiKey ? '已配置' : '未设置'}">
        <label>Tavily Key</label><input id="dwa-tavily" type="password" placeholder="\${cfg.keys?.tavilyApiKey ? '已配置' : '未设置'}">
        <label>Jina Key</label><input id="dwa-jina" type="password" placeholder="\${cfg.keys?.jinaApiKey ? '已配置' : '未设置'}">
        <label>Gemini Key</label><input id="dwa-gemini" type="password" placeholder="\${cfg.keys?.geminiApiKey ? '已配置' : '未设置'}">
        <button class="save" id="dwa-save">保存</button>
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
