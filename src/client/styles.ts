/**
 * 面板样式（一次注入，随插件卸载移除；类名前缀 obx-）。
 * 逐行逐字保留：界面在 F2 才重写，本文件只做产物 → 源码的还原。
 */
export const CSS = [
  '.obx-panel{display:flex;flex-direction:column;gap:16px;font-size:14px;line-height:1.5}',
  '.obx-title{font-size:16px;font-weight:600;margin:0}',
  '.obx-desc{opacity:.72;margin:4px 0 0}',
  '.obx-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
  '.obx-spacer{flex:1}',
  '.obx-meta{opacity:.72;font-size:12px}',
  '.obx-error{border:1px solid #e5484d;background:rgba(229,72,77,.08);color:#e5484d;border-radius:8px;padding:8px 12px}',
  '.obx-alert[role=alert]{white-space:pre-wrap}',
  '.obx-notice{opacity:.85;min-height:1em}',
  '.obx-effect{border:1px dashed rgba(128,128,128,.45);border-radius:8px;padding:8px 12px;opacity:.85}',
  '.obx-warn{color:#d97706}',
  '.obx-group{display:flex;flex-direction:column;gap:10px;border-top:1px solid rgba(128,128,128,.2);padding-top:12px}',
  '.obx-group-title{font-weight:600;margin:0}',
  '.obx-field{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}',
  '.obx-label{font-size:12px;opacity:.8;min-width:180px}',
  '.obx-control{display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex:1;min-width:240px}',
  '.obx-input,.obx-select,.obx-textarea{flex:1;min-width:160px;max-width:420px;box-sizing:border-box;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent;color:inherit;padding:6px 8px;font:inherit}',
  '.obx-textarea{max-width:520px;min-height:56px;resize:vertical}',
  '.obx-toggle{display:inline-flex;align-items:center;gap:6px}',
  '.obx-hint{opacity:.65;font-size:12px;flex-basis:100%}',
  '.obx-secret-badge{font-size:11px;border:1px solid rgba(128,128,128,.4);border-radius:999px;padding:0 8px;opacity:.8}',
  '.obx-badge{font-size:11px;border:1px solid rgba(128,128,128,.4);border-radius:999px;padding:0 8px;opacity:.8}',
  '.obx-btn{cursor:pointer;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent;color:inherit;padding:4px 10px}',
  '.obx-btn:hover:not(:disabled){border-color:currentColor}',
  '.obx-btn:disabled{opacity:.45;cursor:not-allowed}',
  '.obx-btn.primary{border-color:currentColor;font-weight:600}',
].join('\n')