import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { applyPublicConfig, getPublicConfig } from './public-config.ts'
import { CURATOR_MOUNT_PATH, dispatchCuratorRequest, setCuratorPublicOrigin } from './curator-mount.ts'
import { formatStatus, type Engine } from './engine.ts'
import { getActivitySnapshot, getLastCuratorUrl } from './ui-state.ts'

interface WebServer {
  port?: number
  register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void
  tapIndex?(transform: (html: string) => string): () => void
}

export function registerWebUi(ctx: Context, engine: Engine): void {
  const server = ctx.get('webServer') as WebServer | undefined
  if (!server) return

  const port = typeof server.port === 'number' && server.port > 0 ? server.port : 3080
  setCuratorPublicOrigin(`http://127.0.0.1:${port}`)
  ctx.effect(() => () => setCuratorPublicOrigin(''))
  ctx.effect(() => server.register({ kind: 'prefix', path: CURATOR_MOUNT_PATH, handler: (req, res) => { dispatchCuratorRequest(req, res) } }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/api/config', handler: (req, res) => handleConfig(req, res) }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/api/status', handler: (_req, res) => void handleStatus(engine, res) }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/api/activity', handler: (_req, res) => handleActivity(res) }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/ui.js', handler: (_req, res) => send(res, 200, overlayScript(), 'application/javascript; charset=utf-8') }))
  ctx.effect(() => server.register({ kind: 'exact', path: '/dsh-web-access/panel', handler: (_req, res) => send(res, 200, panelHtml(), 'text/html; charset=utf-8') }))
  if (server.tapIndex) {
    ctx.effect(() => server.tapIndex!(html => {
      if (html.includes('dsh-web-access-fallback')) return html
      const boot = '<script data-dsh-web-access-fallback>document.addEventListener("DOMContentLoaded",function(){var g=window.__DSH_BOOT__;if(g&&g.entries&&g.entries.some(function(e){return e.id==="dsh-web-access"}))return;var s=document.createElement("script");s.src="/dsh-web-access/ui.js";document.body.appendChild(s)});</script>'
      return html.includes('</body>') ? html.replace('</body>', `${boot}</body>`) : html + boot
    }))
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
  return `<!doctype html><meta charset="utf-8"><title>联网访问</title><p>请从 Web UI 右下角打开面板。</p>`
}

function overlayScript(): string {
  return `(() => {
  if (window.__dshWebAccessUi) return;
  window.__dshWebAccessUi = true;

  const css = \`
    #dsh-web-access-root {
      font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif);
      color: var(--dsw-alias-label-primary);
    }
    #dsh-web-access-root * { box-sizing: border-box; }
    #dwa-btn {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      height: 36px; padding: 0 14px; gap: 6px;
      display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 18px; cursor: pointer;
      background: var(--dsw-alias-button-floating-fill);
      color: var(--dsw-alias-label-primary);
      box-shadow: var(--dsw-shadow-lv2);
      font-size: 14px; line-height: 22px; font-weight: 500;
    }
    #dwa-btn:hover { background: var(--dsw-alias-button-floating-hover); }
    #dwa-mask {
      display: none; position: fixed; inset: 0; z-index: 2147482998;
      background: var(--dsw-alias-bg-mask-1);
      backdrop-filter: var(--dsw-mask-blur);
    }
    #dwa-mask.open { display: block; }
    #dwa-panel {
      display: none; position: fixed; z-index: 2147482999;
      right: 20px; bottom: 68px;
      width: min(420px, calc(100vw - 32px));
      height: min(580px, calc(100vh - 100px));
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--dsw-alias-border-inverted);
      border-radius: 24px;
      background: var(--dsw-alias-bg-layer-2);
      box-shadow: var(--dsw-shadow-lv3);
    }
    #dwa-panel.open { display: flex; }
    #dwa-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; padding: 22px 14px 12px 24px; flex: none;
    }
    #dwa-head h2 {
      margin: 0; font-size: 16px; line-height: 24px; font-weight: 500;
      color: var(--dsw-alias-label-primary);
    }
    #dwa-close {
      width: 28px; height: 28px; border: 0; border-radius: 8px;
      background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
      font-size: 18px; line-height: 28px;
    }
    #dwa-close:hover { background: var(--dsw-alias-interactive-bg-hover); }
    #dwa-tabs {
      display: flex; gap: 4px; margin: 0 16px; padding: 4px;
      border-radius: 12px; background: var(--dsw-alias-bg-module-platform); flex: none;
    }
    #dwa-tabs button {
      flex: 1; border: 0; background: transparent; cursor: pointer;
      color: var(--dsw-alias-label-secondary);
      padding: 6px 8px; border-radius: 10px;
      font-size: 13px; line-height: 20px; font-weight: 500;
    }
    #dwa-tabs button:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
    #dwa-tabs button.on {
      background: var(--dsw-specific-sidebar-nav-item-active);
      color: var(--dsw-alias-label-primary);
    }
    #dwa-body {
      flex: 1; min-height: 0; overflow: auto; padding: 16px 24px 8px;
      font-size: 14px; line-height: 22px;
      color: var(--dsw-alias-label-primary);
      scrollbar-color: var(--dsh-scrollbar-thumb, var(--dsw-alias-scrollbar-bg-l2)) transparent;
    }
    #dwa-foot {
      flex: none; padding: 8px 24px 16px;
      font-size: 12px; line-height: 18px;
      color: var(--dsw-alias-label-caption);
    }
    .dwa-empty {
      margin: 32px 0; text-align: center;
      color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px;
    }
    .dwa-card {
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 12px;
      background: var(--dsw-alias-bg-layer-3);
      padding: 14px 16px; margin-bottom: 12px;
    }
    .dwa-card h3 {
      margin: 0 0 10px; font-size: 13px; line-height: 20px; font-weight: 600;
      color: var(--dsw-alias-label-secondary);
    }
    .dwa-row {
      display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
      padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l1);
    }
    .dwa-row:last-child { border-bottom: 0; }
    .dwa-k { color: var(--dsw-alias-label-tertiary); font-size: 13px; flex: none; }
    .dwa-v { color: var(--dsw-alias-label-primary); text-align: right; word-break: break-all; }
    .dwa-meta { color: var(--dsw-alias-label-caption); font-size: 12px; flex: none; }
    .ok { color: var(--dsw-alias-state-success-primary); }
    .bad { color: var(--dsw-alias-state-error-primary); }
    .pend { color: var(--dsw-alias-state-warn-label); }
    .dwa-dot {
      width: 8px; height: 8px; border-radius: 50%; flex: none; margin-top: 6px;
      background: var(--dsw-alias-state-warn-primary);
    }
    .dwa-dot.ok { background: var(--dsw-alias-state-success-primary); }
    .dwa-dot.bad { background: var(--dsw-alias-state-error-primary); }
    #dwa-body label {
      display: block; margin: 0 0 6px;
      font-size: 12px; line-height: 18px; font-weight: 500;
      color: var(--dsw-alias-label-tertiary);
    }
    #dwa-body .field { margin-bottom: 12px; }
    #dwa-body input, #dwa-body select {
      width: 100%; height: 32px; padding: 0 8px;
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 8px;
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-primary);
      font-size: 14px; line-height: 22px;
    }
    #dwa-body input::placeholder { color: var(--dsw-alias-label-dimmed); }
    #dwa-body input:focus, #dwa-body select:focus {
      outline: none; border-color: var(--dsw-alias-brand-primary);
    }
    .dwa-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
    .dwa-ghost, .dwa-save {
      height: 28px; padding: 0 14px; border-radius: 14px; cursor: pointer;
      font-size: 13px; line-height: 20px;
    }
    .dwa-ghost {
      border: 1px solid var(--dsw-alias-border-l2);
      background: transparent; color: var(--dsw-alias-label-secondary);
    }
    .dwa-ghost:hover { background: var(--dsw-alias-interactive-bg-hover); }
    .dwa-save {
      border: 0;
      background: var(--dsw-alias-button-primary-fill);
      color: var(--dsw-alias-label-primary-foreground);
    }
    .dwa-save:hover { background: var(--dsw-alias-button-primary-hover); }
    .dwa-toolbar {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      margin-bottom: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary);
    }
    .dwa-toolbar a { color: var(--dsw-alias-state-business-primary); text-decoration: none; }
    iframe { width: 100%; height: calc(100% - 28px); min-height: 280px; border: 0; border-radius: 12px; background: var(--dsw-alias-bg-base); }
    #dwa-btn:focus-visible, #dwa-close:focus-visible, #dwa-tabs button:focus-visible, .dwa-save:focus-visible, .dwa-ghost:focus-visible {
      outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px;
    }
    @media (prefers-reduced-motion: reduce) {
      #dwa-btn, #dwa-panel, #dwa-tabs button, .dwa-save, .dwa-ghost { transition: none; }
    }
  \`;

  function mount() {
    if (document.getElementById('dsh-web-access-root')) return;
    const root = document.createElement('div');
    root.id = 'dsh-web-access-root';
    root.innerHTML = '<style>' + css + '</style>'
      + '<button id="dwa-btn" type="button" title="联网访问 (Ctrl+Shift+W)">联网</button>'
      + '<div id="dwa-mask"></div>'
      + '<div id="dwa-panel" role="dialog" aria-modal="true" aria-labelledby="dwa-title">'
      + '<div id="dwa-head"><h2 id="dwa-title">联网访问</h2><button id="dwa-close" type="button" aria-label="关闭">×</button></div>'
      + '<div id="dwa-tabs">'
      + '<button type="button" data-tab="activity" class="on">活动</button>'
      + '<button type="button" data-tab="curator">策展</button>'
      + '<button type="button" data-tab="config">配置</button>'
      + '<button type="button" data-tab="status">状态</button>'
      + '</div><div id="dwa-body"></div><div id="dwa-foot">Esc 关闭 · Ctrl+Shift+W 活动 · Ctrl+Shift+S 策展</div></div>';
    document.body.appendChild(root);

    const panel = root.querySelector('#dwa-panel');
    const mask = root.querySelector('#dwa-mask');
    const body = root.querySelector('#dwa-body');
    let tab = 'activity';
    let timer = 0;

    const setOpen = (open) => {
      panel.classList.toggle('open', open);
      mask.classList.toggle('open', open);
      if (open) { void render(); timer = timer || setInterval(() => { if (tab === 'activity') void render(); }, 1500); }
    };
    const openTab = (name) => { tab = name; root.querySelectorAll('#dwa-tabs button').forEach(btn => btn.classList.toggle('on', btn.dataset.tab === name)); setOpen(true); };
    const toggle = (name) => {
      if (panel.classList.contains('open') && tab === name) setOpen(false);
      else openTab(name);
    };

    root.querySelector('#dwa-btn').addEventListener('click', () => toggle(tab));
    root.querySelector('#dwa-close').addEventListener('click', () => setOpen(false));
    mask.addEventListener('click', () => setOpen(false));
    root.querySelectorAll('#dwa-tabs button').forEach(btn => btn.addEventListener('click', () => openTab(btn.dataset.tab)));
    window.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && panel.classList.contains('open')) { ev.preventDefault(); setOpen(false); return; }
      if (!(ev.ctrlKey && ev.shiftKey)) return;
      if (ev.key === 'W' || ev.key === 'w') { ev.preventDefault(); toggle('activity'); }
      if (ev.key === 'S' || ev.key === 's') { ev.preventDefault(); toggle('curator'); }
    });

    async function j(url, opt) { const res = await fetch(url, opt); return res.json(); }
    function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[c])); }
    function dur(ms) { return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms'; }

    async function render() {
      if (tab === 'activity') {
        const data = await j('/dsh-web-access/api/activity');
        if (!data.entries.length) { body.innerHTML = '<div class="dwa-empty">还没有联网请求</div>'; return; }
        body.innerHTML = data.entries.map(e => {
          const cls = e.error ? 'bad' : e.status ? 'ok' : 'pend';
          const kind = e.type === 'api' ? '搜索' : '抓取';
          return '<div class="dwa-row"><span class="dwa-dot ' + cls + '"></span><span style="flex:1;min-width:0"><span class="dwa-k">' + kind + '</span> ' + esc(e.query || e.url || '') + '</span><span class="dwa-meta ' + cls + '">' + esc(e.error || e.status || '进行中') + ' · ' + dur(e.durationMs) + '</span></div>';
        }).join('');
      } else if (tab === 'curator') {
        const data = await j('/dsh-web-access/api/status');
        if (!data.curatorUrl) { body.innerHTML = '<div class="dwa-empty">还没有策展会话<br>让模型使用「策展审阅」工作流，或运行 /websearch</div>'; return; }
        body.innerHTML = '<div class="dwa-toolbar"><span>策展会话进行中</span><a href="' + esc(data.curatorUrl) + '" target="_blank" rel="noreferrer">新窗口打开</a></div><iframe src="' + esc(data.curatorUrl) + '"></iframe>';
      } else if (tab === 'status') {
        const data = await j('/dsh-web-access/api/status');
        const rows = String(data.text || '').split('\\n').filter(Boolean).map(line => {
          const i = line.indexOf(':');
          if (i < 0) return '<div class="dwa-row"><span class="dwa-v">' + esc(line) + '</span></div>';
          return '<div class="dwa-row"><span class="dwa-k">' + esc(line.slice(0, i)) + '</span><span class="dwa-v">' + esc(line.slice(i + 1).trim()) + '</span></div>';
        }).join('');
        body.innerHTML = '<div class="dwa-card">' + (rows || '<div class="dwa-empty">暂无状态</div>') + '</div>';
      } else {
        const cfg = await j('/dsh-web-access/api/config');
        const ph = (on) => on ? '已配置' : '未设置';
        body.innerHTML = '<div class="dwa-card"><h3>搜索</h3>'
          + '<div class="field"><label>工作流</label><select id="dwa-workflow"><option value="auto-summary">自动摘要</option><option value="summary-review">策展审阅</option><option value="none">仅原始结果</option></select></div>'
          + '<div class="field"><label>搜索提供方</label><input id="dwa-provider" placeholder="auto / brave / exa / all"></div>'
          + '<div class="field"><label>允许浏览器 Cookie</label><select id="dwa-cookies"><option value="">未设置</option><option value="true">是</option><option value="false">否</option></select></div></div>'
          + '<div class="dwa-card"><h3>摘要</h3><div class="field"><label>摘要模型</label><input id="dwa-summary" placeholder="deepseek/... 或 google/gemini-..."></div></div>'
          + '<div class="dwa-card"><h3>密钥</h3>'
          + ['openai','brave','exa','tavily','jina','gemini'].map(k => '<div class="field"><label>' + k + 'ApiKey</label><input id="dwa-' + k + '" type="password" placeholder="' + ph(cfg.keys && cfg.keys[k + 'ApiKey']) + '"></div>').join('')
          + '</div><div class="dwa-actions"><button type="button" class="dwa-ghost" id="dwa-reset">放弃</button><button type="button" class="dwa-save" id="dwa-save">保存</button></div>';
        body.querySelector('#dwa-workflow').value = cfg.workflow || 'auto-summary';
        body.querySelector('#dwa-provider').value = cfg.provider || cfg.searchProvider || '';
        body.querySelector('#dwa-summary').value = cfg.summaryModel || '';
        body.querySelector('#dwa-cookies').value = cfg.allowBrowserCookies === true ? 'true' : cfg.allowBrowserCookies === false ? 'false' : '';
        body.querySelector('#dwa-reset').onclick = () => void render();
        body.querySelector('#dwa-save').onclick = async () => {
          const cookies = body.querySelector('#dwa-cookies').value;
          const payload = {
            workflow: body.querySelector('#dwa-workflow').value,
            provider: body.querySelector('#dwa-provider').value || undefined,
            summaryModel: body.querySelector('#dwa-summary').value || undefined,
            allowBrowserCookies: cookies === '' ? undefined : cookies === 'true',
          };
          for (const k of ['openai','brave','exa','tavily','jina','gemini']) payload[k + 'ApiKey'] = body.querySelector('#dwa-' + k).value;
          await j('/dsh-web-access/api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
          void render();
        };
      }
    }
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();`
}
