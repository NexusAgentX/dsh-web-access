export const OVERLAY_CSS = `
#dsh-web-access-root {
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif);
  color: var(--dsw-alias-label-primary);
  pointer-events: none;
}
#dsh-web-access-root * { box-sizing: border-box; }
#dwa-btn, #dwa-mask, #dwa-panel { pointer-events: auto; }
#dwa-btn {
  position: fixed; right: 20px; bottom: 20px; z-index: 20;
  height: 36px; padding: 0 14px;
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
  display: none; position: fixed; inset: 0; z-index: 19;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
}
#dwa-mask.open { display: block; }
#dwa-panel {
  display: none; position: fixed; z-index: 20;
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
}
#dwa-foot {
  flex: none; padding: 8px 24px 16px;
  font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-caption);
}
.dwa-empty { margin: 32px 0; text-align: center; color: var(--dsw-alias-label-tertiary); font-size: 13px; }
.dwa-card {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3);
  padding: 14px 16px; margin-bottom: 12px;
}
.dwa-card h3 { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dwa-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dwa-row:last-child { border-bottom: 0; }
.dwa-k { color: var(--dsw-alias-label-tertiary); font-size: 13px; flex: none; }
.dwa-v { color: var(--dsw-alias-label-primary); text-align: right; word-break: break-all; }
.dwa-meta { color: var(--dsw-alias-label-caption); font-size: 12px; flex: none; }
.ok { color: var(--dsw-alias-state-success-primary); }
.bad { color: var(--dsw-alias-state-error-primary); }
.pend { color: var(--dsw-alias-state-warn-label); }
.dwa-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; margin-top: 6px; background: var(--dsw-alias-state-warn-primary); }
.dwa-dot.ok { background: var(--dsw-alias-state-success-primary); }
.dwa-dot.bad { background: var(--dsw-alias-state-error-primary); }
#dwa-body label { display: block; margin: 0 0 6px; font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-tertiary); }
#dwa-body .field { margin-bottom: 12px; }
#dwa-body input, #dwa-body select {
  width: 100%; height: 32px; padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 14px; line-height: 22px;
}
#dwa-body input:focus, #dwa-body select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.dwa-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
.dwa-ghost, .dwa-save { height: 28px; padding: 0 14px; border-radius: 14px; cursor: pointer; font-size: 13px; }
.dwa-ghost { border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); }
.dwa-save { border: 0; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.dwa-toolbar { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dwa-toolbar a { color: var(--dsw-alias-state-business-primary); text-decoration: none; }
iframe { width: 100%; height: calc(100% - 28px); min-height: 280px; border: 0; border-radius: 12px; background: var(--dsw-alias-bg-base); }
`
