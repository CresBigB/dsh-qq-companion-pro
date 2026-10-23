/**
 * dsh-qq-companion-pro — 设置页 client bundle（QQ Bot 设置面板）。
 *
 * 本文件由 scripts/build-client.mjs 构建生成，源码在 src/client/，不要手改；
 * 改完源码跑 `npm run build`（或 `npm run build:client`）重新生成。
 * 外层包裹 = 宿主 window.__ModuleLoader__ 的 CJS 装载形态，外部模块表只有 react。
 */

window.__ModuleLoader__.load({
	id: "dsh-qq-companion-pro",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		"use strict";
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.ts
		var index_exports = {};
		__export(index_exports, {
		  ALL_FIELDS: () => ALL_FIELDS,
		  CSS: () => CSS,
		  DEFAULTS: () => DEFAULTS,
		  GROUPS: () => GROUPS,
		  GROUP_KEYS: () => GROUP_KEYS,
		  ONEBOT_SETTINGS_DESCRIPTORS: () => ONEBOT_SETTINGS_DESCRIPTORS,
		  ONEBOT_SETTINGS_REMOTE: () => ONEBOT_SETTINGS_REMOTE,
		  OnebotSettingsPanel: () => OnebotSettingsPanel,
		  SECOND_ENTRY_KEY: () => SECOND_ENTRY_KEY,
		  SECOND_ENTRY_SLOT: () => SECOND_ENTRY_SLOT,
		  SLOT_ID: () => SLOT_ID,
		  SLOT_ORDER: () => SLOT_ORDER,
		  SettingsView: () => SettingsView,
		  appendTags: () => appendTags,
		  apply: () => apply,
		  changeKeys: () => changeKeys,
		  coerceValue: () => coerceValue,
		  computePatch: () => computePatch,
		  configSchema: () => configSchema,
		  draftFromDefaults: () => draftFromDefaults,
		  draftFromSnapshot: () => draftFromSnapshot,
		  en: () => en,
		  fillWorkspacePath: () => fillWorkspacePath,
		  formatDefaultValue: () => formatDefaultValue,
		  groupCards: () => groupCards,
		  groupMatches: () => groupMatches,
		  highlightSegments: () => highlightSegments,
		  inject: () => inject,
		  isConflictError: () => isConflictError,
		  matchField: () => matchField,
		  normalizeQuery: () => normalizeQuery,
		  parseTagInput: () => parseTagInput,
		  patchSchema: () => patchSchema,
		  removeTagAt: () => removeTagAt,
		  renderFieldRow: () => renderFieldRow,
		  renderGroup: () => renderGroup,
		  renderSearchResults: () => renderSearchResults,
		  renderWorkspacePicker: () => renderWorkspacePicker,
		  searchFields: () => searchFields,
		  snapshotValueToDraft: () => snapshotValueToDraft,
		  tagsOf: () => tagsOf,
		  unitConversion: () => unitConversion,
		  unitLabel: () => unitLabel,
		  unitText: () => unitText,
		  unwrap: () => unwrap,
		  valueEquals: () => valueEquals,
		  zh: () => zh
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/react-runtime.ts
		var reactModule = require("react");
		var ReactImpl = reactModule != null && typeof reactModule.createElement === "function" ? reactModule : reactModule == null ? void 0 : reactModule.default;
		if (ReactImpl == null || typeof ReactImpl.createElement !== "function") {
		  throw new Error("dsh-qq-companion-pro client: react 不可用");
		}
		var React = ReactImpl;

		// src/client/constants.ts
		var PLUGIN_ID = "dsh-qq-companion-pro";
		var REMOTE_NS = "onebotSettings";
		var NS = "qq-companion";
		var SLOT_ID = "onebot-settings";
		var SLOT_ORDER = 18;
		var SECOND_ENTRY_SLOT = "plugins.row.config";
		var SECOND_ENTRY_ROW_ID = "dsh-onebot";
		var SECOND_ENTRY_KEY = PLUGIN_ID + "#" + SECOND_ENTRY_ROW_ID;

		// src/client/styles.ts
		var CSS_LINES = [
		  ".qqc-root{--qqc-ring:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent);container:qqc/inline-size;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}",
		  ".qqc-root *,.qqc-root *::before,.qqc-root *::after{box-sizing:border-box}",
		  "",
		  "/* 页头 */",
		  ".qqc-header{display:flex;align-items:flex-start;gap:16px;padding:4px 0 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
		  ".qqc-header-text{flex:1;min-width:0}",
		  ".qqc-title{margin:0;font-size:20px;font-weight:600;line-height:1.3}",
		  ".qqc-subtitle{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}",
		  ".qqc-conn{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);font-size:12px;white-space:nowrap}",
		  ".qqc-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}",
		  ".qqc-dot[data-state=ok]{background:var(--dsw-alias-state-success-primary)}",
		  ".qqc-dot[data-state=warn]{background:var(--dsw-alias-state-warn-primary)}",
		  ".qqc-dot[data-state=error]{background:var(--dsw-alias-state-error-primary)}",
		  "",
		  "/* 主体两栏 */",
		  ".qqc-body{display:grid;grid-template-columns:184px minmax(0,1fr);gap:24px;padding-top:16px}",
		  ".qqc-nav{position:sticky;top:0;align-self:start;display:flex;flex-direction:column;gap:8px}",
		  ".qqc-nav-tools{display:flex;flex-direction:column;gap:6px}",
		  ".qqc-search{width:100%;height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}",
		  ".qqc-search::placeholder{color:var(--dsw-alias-label-secondary)}",
		  ".qqc-filter{display:flex;align-items:center;gap:6px;padding:2px 2px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;user-select:none}",
		  ".qqc-nav-list{display:flex;flex-direction:column;gap:2px;margin:0;padding:8px 0 0;border-top:1px solid var(--dsw-alias-border-l1);list-style:none}",
		  ".qqc-nav-item{display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;cursor:pointer}",
		  ".qqc-nav-item:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}",
		  ".qqc-nav-item[aria-current=page]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}",
		  ".qqc-nav-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		  ".qqc-count{flex:none;min-width:18px;height:18px;padding:0 6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary);font-size:11px;font-weight:600;line-height:18px;text-align:center;font-variant-numeric:tabular-nums}",
		  ".qqc-count[data-tone=error]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent);color:var(--dsw-alias-state-error-primary)}",
		  "",
		  "/* 内容列 */",
		  ".qqc-main{display:flex;flex-direction:column;gap:16px;min-width:0;max-width:760px}",
		  ".qqc-page-head{display:flex;align-items:flex-end;gap:12px}",
		  ".qqc-page-head-text{flex:1;min-width:0}",
		  ".qqc-page-title{margin:0;font-size:16px;font-weight:600;line-height:1.4}",
		  ".qqc-page-desc{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}",
		  "",
		  "/* 卡片与行 */",
		  ".qqc-card{overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}",
		  ".qqc-card-head{padding:12px 16px 4px}",
		  ".qqc-card-title{margin:0;font-size:13px;font-weight:600}",
		  ".qqc-card-desc{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}",
		  ".qqc-card-foot{padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:12px}",
		  ".qqc-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,320px);align-items:start;gap:8px 24px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1)}",
		  ".qqc-card-head+.qqc-row,.qqc-card>.qqc-row:first-child{border-top:0}",
		  ".qqc-row--stack{grid-template-columns:minmax(0,1fr)}",
		  ".qqc-row[data-dirty]{box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}",
		  ".qqc-row[data-inactive] .qqc-row-meta,.qqc-row[data-inactive] .qqc-control{opacity:.55}",
		  ".qqc-row-meta{min-width:0}",
		  ".qqc-label{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);cursor:default}",
		  '.qqc-key{margin-top:1px;font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}',
		  ".qqc-hint{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}",
		  ".qqc-badge{display:inline-flex;align-items:center;height:18px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500;line-height:1;white-space:nowrap}",
		  ".qqc-badge[data-tone=brand]{border-color:transparent;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary)}",
		  ".qqc-badge[data-tone=warn]{border-color:transparent;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 16%,transparent);color:var(--dsw-alias-state-warn-primary)}",
		  "",
		  "/* 控件 */",
		  ".qqc-control{display:flex;flex-direction:column;gap:4px;min-width:0}",
		  ".qqc-control-line{display:flex;align-items:center;gap:8px;min-width:0}",
		  ".qqc-input,.qqc-select,.qqc-textarea{width:100%;min-width:0;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}",
		  '.qqc-input[data-kind=path],.qqc-textarea{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:12px}',
		  ".qqc-textarea{height:auto;min-height:72px;padding:8px 10px;resize:vertical}",
		  ".qqc-input::placeholder,.qqc-textarea::placeholder{color:var(--dsw-alias-label-secondary)}",
		  ".qqc-input:hover:not(:disabled),.qqc-select:hover:not(:disabled),.qqc-textarea:hover:not(:disabled){border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,var(--dsw-alias-border-l2))}",
		  ".qqc-input:disabled,.qqc-select:disabled,.qqc-textarea:disabled{opacity:.55;cursor:not-allowed}",
		  ".qqc-row[data-invalid] .qqc-input,.qqc-row[data-invalid] .qqc-select,.qqc-row[data-invalid] .qqc-tags{border-color:var(--dsw-alias-state-error-primary)}",
		  ".qqc-unit{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}",
		  ".qqc-error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px}",
		  "",
		  "/* 开关 */",
		  ".qqc-switch-line{display:flex;align-items:center;justify-content:flex-end;gap:8px;height:32px}",
		  ".qqc-switch-text{min-width:1.5em;color:var(--dsw-alias-label-secondary);font-size:12px}",
		  ".qqc-switch{position:relative;flex:none;width:32px;height:18px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l2);cursor:pointer;transition:background-color .15s ease}",
		  '.qqc-switch::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 30%,transparent);transition:transform .15s ease}',
		  ".qqc-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}",
		  ".qqc-switch[aria-checked=true]::after{transform:translateX(14px)}",
		  ".qqc-switch:disabled{opacity:.5;cursor:not-allowed}",
		  "",
		  "/* 标签列表 */",
		  ".qqc-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:32px;padding:4px 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);cursor:text}",
		  ".qqc-tags:focus-within{border-color:var(--dsw-alias-brand-primary);outline:2px solid var(--qqc-ring);outline-offset:1px}",
		  '.qqc-tag{display:inline-flex;align-items:center;gap:2px;max-width:100%;height:22px;padding:0 2px 0 8px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:12px}',
		  ".qqc-tag-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		  ".qqc-tag-x{display:inline-grid;place-items:center;flex:none;width:18px;height:18px;padding:0;border:0;border-radius:3px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;line-height:1;cursor:pointer}",
		  ".qqc-tag-x:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);color:var(--dsw-alias-label-primary)}",
		  ".qqc-tags-input{flex:1;min-width:96px;height:22px;padding:0 2px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;outline:none}",
		  "",
		  "/* 按钮 */",
		  ".qqc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-weight:500;white-space:nowrap;cursor:pointer;transition:background-color .12s ease,border-color .12s ease}",
		  ".qqc-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}",
		  ".qqc-btn:disabled{opacity:.5;cursor:not-allowed}",
		  ".qqc-btn[data-variant=primary]{border-color:transparent;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}",
		  ".qqc-btn[data-variant=primary]:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 86%,var(--dsw-alias-label-primary))}",
		  ".qqc-btn[data-variant=ghost]{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}",
		  ".qqc-btn[data-variant=ghost]:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}",
		  ".qqc-btn[data-variant=danger]{border-color:transparent;background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base)}",
		  ".qqc-btn--sm{height:24px;padding:0 8px;font-size:12px}",
		  ".qqc-btn--icon{width:28px;height:28px;padding:0;flex:none}",
		  "",
		  "/* 焦点环（统一） */",
		  ".qqc-root :is(button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--qqc-ring);outline-offset:1px}",
		  ".qqc-root .qqc-tags-input:focus-visible{outline:none}",
		  "",
		  "/* 横幅 */",
		  ".qqc-banner{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:12px}",
		  ".qqc-banner[data-tone=error]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}",
		  ".qqc-banner[data-tone=warn]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,transparent)}",
		  ".qqc-banner[data-tone=success]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 8%,transparent)}",
		  ".qqc-banner-body{flex:1;min-width:0}",
		  ".qqc-banner-title{margin:0;font-weight:600;color:var(--dsw-alias-label-primary)}",
		  ".qqc-banner-text{margin:2px 0 0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}",
		  ".qqc-banner-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}",
		  "",
		  "/* 保存条 */",
		  ".qqc-savebar{position:sticky;bottom:12px;z-index:2;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-overlay);box-shadow:0 6px 24px color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent)}",
		  ".qqc-savebar-text{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px}",
		  ".qqc-savebar-text strong{color:var(--dsw-alias-label-primary);font-weight:600}",
		  ".qqc-savebar[data-tone=error] .qqc-savebar-text{color:var(--dsw-alias-state-error-primary)}",
		  ".qqc-savebar[data-tone=success] .qqc-savebar-text{color:var(--dsw-alias-state-success-primary)}",
		  ".qqc-link{padding:0;border:0;background:none;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer}",
		  "",
		  "/* 对话框 */",
		  ".qqc-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 62%,transparent);backdrop-filter:blur(2px)}",
		  ".qqc-dialog{width:min(480px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:20px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 16px 48px color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}",
		  ".qqc-dialog-title{margin:0;font-size:15px;font-weight:600}",
		  ".qqc-dialog-text{margin:6px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}",
		  ".qqc-risk-list{display:flex;flex-direction:column;gap:8px;margin:14px 0 0;padding:0;list-style:none}",
		  ".qqc-risk{padding:8px 10px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);font-size:12px}",
		  ".qqc-risk-field{display:block;margin-bottom:2px;font-weight:600}",
		  ".qqc-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}",
		  "",
		  "/* 加载 / 空 */",
		  ".qqc-skeleton{border-radius:10px;background:linear-gradient(90deg,var(--dsw-alias-bg-layer-1) 25%,var(--dsw-alias-bg-layer-2) 50%,var(--dsw-alias-bg-layer-1) 75%);background-size:200% 100%;animation:qqc-shimmer 1.4s linear infinite}",
		  "@keyframes qqc-shimmer{to{background-position:-200% 0}}",
		  ".qqc-empty{padding:32px 16px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}",
		  ".qqc-mark{padding:0 1px;border-radius:2px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,transparent);color:inherit}",
		  ".qqc-result-group{display:flex;flex-direction:column;gap:8px}",
		  ".qqc-result-head{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}",
		  "",
		  "/* 概览 */",
		  ".qqc-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}",
		  ".qqc-stat{display:flex;flex-direction:column;gap:4px;min-width:0;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}",
		  ".qqc-stat-label{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px}",
		  ".qqc-stat-value{font-size:20px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums}",
		  ".qqc-stat-sub{overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:12px;text-overflow:ellipsis;white-space:nowrap}",
		  ".qqc-list{margin:0;padding:0;list-style:none}",
		  ".qqc-list-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 16px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px}",
		  ".qqc-list>.qqc-list-row:first-child{border-top:0}",
		  '.qqc-list-path{overflow:hidden;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:11px;text-overflow:ellipsis;white-space:nowrap}',
		  ".qqc-meter{grid-column:1/-1;height:6px;overflow:hidden;border-radius:999px;background:var(--dsw-alias-bg-layer-2)}",
		  ".qqc-meter-fill{height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary)}",
		  ".qqc-meter-fill[data-tone=warn]{background:var(--dsw-alias-state-warn-primary)}",
		  ".qqc-meter-fill[data-tone=error]{background:var(--dsw-alias-state-error-primary)}",
		  "",
		  "/* 窄屏 / embedded */",
		  "@container qqc (max-width:720px){",
		  "  .qqc-body{grid-template-columns:minmax(0,1fr);gap:12px}",
		  "  .qqc-nav{position:static;gap:8px}",
		  "  .qqc-nav-tools{flex-direction:row;align-items:center}",
		  "  .qqc-search{flex:1}",
		  "  .qqc-nav-list{flex-direction:row;gap:4px;overflow-x:auto;padding:0 0 4px;border-top:0;scrollbar-width:thin}",
		  "  .qqc-nav-item{width:auto;flex:none}",
		  "  .qqc-row{grid-template-columns:minmax(0,1fr)}",
		  "  .qqc-switch-line{justify-content:flex-start}",
		  "  .qqc-main{max-width:none}",
		  "}",
		  ".qqc-root[data-embedded] .qqc-header{display:none}",
		  ".qqc-root[data-embedded] .qqc-body{padding-top:0}",
		  "",
		  "@media (prefers-reduced-motion:reduce){",
		  "  .qqc-skeleton{animation:none}",
		  "  .qqc-switch,.qqc-switch::after,.qqc-btn{transition:none}",
		  "}"
		];
		var CSS = CSS_LINES.join("\n");

		// src/client/i18n.ts
		var zh = {
		  "settings.nav": "QQ 陪伴",
		  "settings.title": "QQ 陪伴",
		  "settings.desc": "配置写入当前 profile 的 cordis.patch.yml，保存后插件会原地重启",
		  // §7 的接口在 F3 由 getStatus() 提供；F2a 只有 idle 点 + 生效的 QQ 号。
		  "conn.qq": "QQ 号 {qq}",
		  "search.placeholder": "搜索设置…",
		  "search.results": "搜索结果",
		  "search.empty": "没有匹配“{q}”的设置",
		  "search.count": "{n} 项",
		  "filter.changed": "只看已改动",
		  "filter.empty": "这一页都是默认值",
		  "badge.dirty": "已改动",
		  "badge.nonDefault": "非默认",
		  "badge.inactive": "未生效",
		  "badge.willClear": "保存后将清空",
		  "field.resetDefault": "恢复默认值（{value}）",
		  "secret.set": "已设置",
		  "secret.unset": "未设置",
		  "secret.placeholder": "留空 = 不修改",
		  "secret.clear": "清空",
		  "secret.undoClear": "撤销清空",
		  "tags.placeholder": "输入后按回车添加",
		  "tags.remove": "删除 {item}",
		  "switch.on": "开",
		  "switch.off": "关",
		  "select.followDefault": "跟随默认",
		  "workspace.title": "快速填入 workspace",
		  "workspace.fill": "填入",
		  "workspace.choose": "选择已有工作区…",
		  "workspace.empty": "暂无 workspace 记录，可直接输入路径。",
		  "workspace.unavailable": "无法获取 workspace 列表（宿主未提供 workspace 注册表），可直接输入路径。",
		  "workspace.note": "选中后点「填入」仅写入上方输入框；保存后才对新会话生效（已用 /workspace 覆盖的会话不受影响）。",
		  "save.summary": "已修改 {n} 项",
		  "save.revert": "还原",
		  "save.submit": "保存",
		  "save.saving": "正在保存…",
		  "save.done": "已保存，插件正在原地重启…",
		  "save.noChanges": "没有需要保存的变更。",
		  "save.badNumber": "数字字段不合法：{keys}",
		  "load.error": "加载设置失败",
		  "load.retry": "重试",
		  "entry.inactive": "QQ 插件条目当前未激活，保存后可能不会生效",
		  "conflict.title": "这期间配置在别处被改过"
		};
		var en = {
		  "settings.nav": "QQ Companion",
		  "settings.title": "QQ Companion",
		  "settings.desc": "Saved to this profile's cordis.patch.yml; the plugin restarts in place on save",
		  "conn.qq": "QQ {qq}",
		  "search.placeholder": "Search settings…",
		  "search.results": "Search results",
		  "search.empty": "No settings match “{q}”",
		  "search.count": "{n} found",
		  "filter.changed": "Changed only",
		  "filter.empty": "Everything here is at its default",
		  "badge.dirty": "Edited",
		  "badge.nonDefault": "Customized",
		  "badge.inactive": "Inactive",
		  "badge.willClear": "Cleared on save",
		  "field.resetDefault": "Reset to default ({value})",
		  "secret.set": "Set",
		  "secret.unset": "Not set",
		  "secret.placeholder": "Leave empty to keep",
		  "secret.clear": "Clear",
		  "secret.undoClear": "Undo clear",
		  "tags.placeholder": "Type and press Enter",
		  "tags.remove": "Remove {item}",
		  "switch.on": "On",
		  "switch.off": "Off",
		  "select.followDefault": "Follow default",
		  "workspace.title": "Quick fill from a workspace",
		  "workspace.fill": "Fill in",
		  "workspace.choose": "Choose a workspace…",
		  "workspace.empty": "No workspace on record; type a path instead.",
		  "workspace.unavailable": "Workspace list unavailable (the host exposes no workspace registry); type a path instead.",
		  "workspace.note": "Fill in only writes the input above; it takes effect for new sessions after saving (sessions with their own /workspace keep it).",
		  "save.summary": "{n} changes",
		  "save.revert": "Revert",
		  "save.submit": "Save",
		  "save.saving": "Saving…",
		  "save.done": "Saved. The plugin is restarting…",
		  "save.noChanges": "Nothing to save.",
		  "save.badNumber": "Invalid number fields: {keys}",
		  "load.error": "Couldn't load settings",
		  "load.retry": "Retry",
		  "entry.inactive": "The QQ plugin entry is inactive; saving may have no effect",
		  "conflict.title": "Settings changed elsewhere"
		};
		function assertSameKeys(a, b) {
		  const missing = Object.keys(a).filter((key) => !(key in b));
		  const extra = Object.keys(b).filter((key) => !(key in a));
		  if (missing.length > 0 || extra.length > 0) {
		    console.warn("[qq-companion] 双语词条 key 不齐 zh缺:" + missing.join(",") + " en缺:" + extra.join(","));
		  }
		}
		assertSameKeys(zh, en);

		// src/client/schema.ts
		function vString(min, max) {
		  return {
		    parse(value) {
		      if (typeof value !== "string" || value.length < min || value.length > max) {
		        throw new TypeError("expected string(" + min + ".." + max + ")");
		      }
		      return value;
		    }
		  };
		}
		function vInt(min) {
		  return {
		    parse(value) {
		      if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
		        throw new TypeError("expected int>=" + min);
		      }
		      return value;
		    }
		  };
		}
		function vNumber(min, max) {
		  return {
		    parse(value) {
		      if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("expected finite number");
		      if (min !== void 0 && value < min) throw new TypeError("expected number >= " + min);
		      if (max !== void 0 && value > max) throw new TypeError("expected number <= " + max);
		      return value;
		    }
		  };
		}
		function vBoolean() {
		  return {
		    parse(value) {
		      if (typeof value !== "boolean") throw new TypeError("expected boolean");
		      return value;
		    }
		  };
		}
		function vArray(item) {
		  return {
		    parse(value) {
		      if (!Array.isArray(value)) throw new TypeError("expected array");
		      return value.map((entry) => item.parse(entry));
		    }
		  };
		}
		function vOptional(inner) {
		  return {
		    parse(value) {
		      if (value === void 0 || value === null) return void 0;
		      return inner.parse(value);
		    }
		  };
		}
		function vObject(shape) {
		  const keys = Object.keys(shape);
		  return {
		    keys,
		    parse(value) {
		      if (value === null || typeof value !== "object" || Array.isArray(value)) {
		        throw new TypeError("expected object");
		      }
		      const source = value;
		      const out = {};
		      for (const key of keys) out[key] = shape[key].parse(source[key]);
		      return out;
		    }
		  };
		}
		function vEnum(values) {
		  return {
		    parse(value) {
		      if (typeof value !== "string" || values.indexOf(value) < 0) {
		        throw new TypeError("expected one of " + values.join("|"));
		      }
		      return value;
		    }
		  };
		}
		var CONFIG_SHAPE = {
		  // connection（6）
		  host: vString(0, 256),
		  port: vNumber(1, 65535),
		  accessToken: vString(0, 256),
		  botQQ: vString(0, 64),
		  workspacePath: vString(0, 1024),
		  attachWorkspaceMode: vEnum(["existing", "auto", "off"]),
		  // access（10）
		  adminUsers: vArray(vString(0, 64)),
		  dmPolicy: vEnum(["open", "allowlist", "disabled"]),
		  allowFrom: vArray(vString(0, 64)),
		  allowAllUsers: vBoolean(),
		  groupPolicy: vEnum(["open", "allowlist", "disabled"]),
		  groupAllowFrom: vArray(vString(0, 64)),
		  requireMention: vBoolean(),
		  restrictedMemberPrefix: vBoolean(),
		  autoAcceptAdminRequests: vBoolean(),
		  autoAllowInvitedGroups: vBoolean(),
		  // persona（7）
		  ownerTitle: vString(0, 1024),
		  agentPreset: vString(0, 1024),
		  adminPreset: vString(0, 1024),
		  adminPermission: vString(0, 1024),
		  memberPermission: vString(0, 1024),
		  adminWorkspacePath: vString(0, 1024),
		  groupReasoningEffort: vEnum(["", "off", "low", "high", "max"]),
		  // messaging（15）
		  splitLines: vBoolean(),
		  splitMaxMessages: vNumber(0),
		  groupSplitLines: vBoolean(),
		  humanTypingPace: vBoolean(),
		  typingDelayPerCharMs: vNumber(0),
		  typingDelayMinMs: vNumber(0),
		  typingDelayMaxMs: vNumber(0),
		  textImageThreshold: vNumber(0),
		  cardFooter: vString(0, 1024),
		  fontFiles: vArray(vString(0, 1024)),
		  fontFamilies: vArray(vString(0, 1024)),
		  interimMessages: vBoolean(),
		  interimRecall: vBoolean(),
		  interimRecallMs: vNumber(0),
		  sendErrorNotice: vBoolean(),
		  // conversation（12）
		  newMessagePolicy: vEnum(["queue", "steer"]),
		  autoSteerPolicy: vEnum(["admin", "all"]),
		  deferredTimeoutMs: vNumber(0),
		  unknownCommand: vEnum(["intercept", "passthrough"]),
		  rateLimitPerMinute: vNumber(0),
		  idleResetHours: vNumber(0),
		  privateResetDays: vNumber(0),
		  groupResetDays: vNumber(0),
		  sessionTitleTemplate: vString(0, 1024),
		  privateSessionKeepDays: vNumber(0),
		  groupSessionKeepDays: vNumber(0),
		  chatIdleEvictDays: vNumber(0),
		  // group（10）
		  groupNameTriggers: vArray(vString(0, 1024)),
		  groupFollowupSeconds: vNumber(0),
		  groupContextLines: vNumber(0),
		  groupAutoQuote: vEnum(["off", "busy", "always"]),
		  groupPeekEnabled: vBoolean(),
		  groupPeekGapMinutes: vNumber(0),
		  groupPeekMinMessages: vNumber(0),
		  groupPeekQuietMinutes: vNumber(0),
		  groupPeekWindowStart: vString(0, 1024),
		  groupPeekWindowEnd: vString(0, 1024),
		  // memory（6）
		  publicMemoryFile: vString(0, 1024),
		  publicMemoryMaxBytes: vNumber(0),
		  groupMemoryDir: vString(0, 1024),
		  groupMemoryMaxBytes: vNumber(0),
		  privateMemoryMaxBytes: vNumber(0),
		  memoryNoteDenyWords: vArray(vString(0, 1024)),
		  // proactive（9）
		  proactiveEnabled: vBoolean(),
		  proactiveChatId: vString(0, 1024),
		  proactiveWindowStart: vString(0, 1024),
		  proactiveWindowEnd: vString(0, 1024),
		  proactiveMinPerDay: vNumber(0),
		  proactiveMaxPerDay: vNumber(0),
		  proactiveMinGapMinutes: vNumber(0),
		  proactiveSkipIfActiveMinutes: vNumber(0),
		  proactiveMaxUnanswered: vNumber(0),
		  // media（20）
		  stickerDir: vString(0, 1024),
		  stickerMaxCount: vNumber(0),
		  stickerMaxBytes: vNumber(0),
		  stickerDailyMax: vNumber(0),
		  sttEnabled: vBoolean(),
		  sttEngine: vEnum(["auto", "sherpa-onnx", "whisper-cpp", "command", "openai", "custom"]),
		  sttModel: vString(0, 1024),
		  sttCommand: vString(0, 1024),
		  sttArgs: vArray(vString(0, 1024)),
		  sttLanguage: vString(0, 1024),
		  sttMaxSeconds: vNumber(0),
		  sttTimeoutMs: vNumber(0),
		  inboundImageMaxPx: vNumber(0),
		  outboundImageMaxBytes: vNumber(0),
		  maxVoiceBytes: vNumber(0),
		  maxFileBytes: vNumber(0),
		  inboundFileMaxBytes: vNumber(0),
		  mediaDir: vString(0, 1024),
		  tempTtlHours: vNumber(0),
		  allowPrivateHosts: vBoolean(),
		  // diagnostics（7）
		  logLevel: vEnum(["debug", "info", "warn", "error"]),
		  actionAuditEnabled: vBoolean(),
		  traceEnabled: vBoolean(),
		  traceLevel: vEnum(["debug", "warn"]),
		  dedupWindowSeconds: vNumber(0),
		  ignoreSelf: vBoolean(),
		  sensitivePatterns: vArray(vString(0, 1024))
		};
		var configSchema = vObject(CONFIG_SHAPE);
		var snapshotSchema = vObject({
		  revision: vInt(0),
		  entryActive: vBoolean(),
		  config: configSchema,
		  secrets: vArray(vObject({ path: vArray(vString(1, 64)), set: vBoolean() })),
		  groups: vObject({
		    connection: vArray(vString(1, 64)),
		    access: vArray(vString(1, 64)),
		    persona: vArray(vString(1, 64)),
		    messaging: vArray(vString(1, 64)),
		    conversation: vArray(vString(1, 64)),
		    group: vArray(vString(1, 64)),
		    memory: vArray(vString(1, 64)),
		    proactive: vArray(vString(1, 64)),
		    media: vArray(vString(1, 64)),
		    diagnostics: vArray(vString(1, 64))
		  }),
		  effect: vEnum(["restart"])
		  // 102 键统一插件级热重启
		});
		var patchSchema = vObject(
		  Object.fromEntries(Object.entries(CONFIG_SHAPE).map(([key, schema]) => [key, vOptional(schema)]))
		);
		var workspaceListSchema = vObject({
		  available: vBoolean(),
		  workspaces: vArray(vObject({ id: vString(1, 256), path: vString(0, 1024), sessionCount: vInt(0) }))
		});
		function strictCodec(typeSymbol, schema) {
		  return { mode: "strict", typeSymbol, create: () => schema, schema };
		}
		function jsonParameter(name, typeSymbol, schema) {
		  return { name, wire: name, source: "json", codec: strictCodec(typeSymbol, schema) };
		}
		function onebotMethod(method, parameters, resultSchema, typeSymbol) {
		  return {
		    id: PLUGIN_ID + "#" + REMOTE_NS + "/" + method,
		    service: REMOTE_NS,
		    namespace: REMOTE_NS,
		    method,
		    invocation: { kind: "direct" },
		    parameters,
		    result: strictCodec(typeSymbol != null ? typeSymbol : "OnebotSettingsSnapshot", resultSchema || snapshotSchema)
		  };
		}
		var ONEBOT_SETTINGS_DESCRIPTORS = [
		  onebotMethod("getSettings", []),
		  onebotMethod("updateSettings", [
		    jsonParameter("patch", "OnebotSettingsPatch", patchSchema),
		    jsonParameter("expectedRevision", "number", vOptional(vInt(0)))
		  ]),
		  onebotMethod("listWorkspaces", [], workspaceListSchema, "WorkspaceListResult")
		];
		var ONEBOT_SETTINGS_REMOTE = { package: PLUGIN_ID, descriptors: ONEBOT_SETTINGS_DESCRIPTORS };

		// src/client/fields.ts
		function draftBool(draft, key) {
		  return draft != null && draft[key] === true;
		}
		function draftNumber(draft, key) {
		  if (draft == null) return NaN;
		  const raw = draft[key];
		  if (typeof raw === "number") return raw;
		  if (typeof raw === "string") {
		    const trimmed = raw.trim();
		    return trimmed === "" ? NaN : Number(trimmed);
		  }
		  return NaN;
		}
		function draftText(draft, key) {
		  if (draft == null) return "";
		  const raw = draft[key];
		  return raw === void 0 || raw === null ? "" : String(raw);
		}
		var GROUPS = [
		  {
		    id: "connection",
		    title: "连接",
		    desc: "NapCat 怎么连到这个插件，QQ 会话默认放在哪个工作区",
		    fields: [
		      { key: "host", label: "监听地址", type: "string", hint: "NapCat 反向 WebSocket 连接的地址，一般保持 127.0.0.1。", section: "NapCat 连接" },
		      { key: "port", label: "监听端口", type: "number", hint: "NapCat 反向 WebSocket 连接的端口。", section: "NapCat 连接", min: 1, max: 65535 },
		      { key: "accessToken", label: "访问令牌（AccessToken）", type: "secret", hint: "与 NapCat 侧一致的鉴权令牌；留空 = 不修改，点「清空」后保存 = 清空。", section: "NapCat 连接" },
		      { key: "botQQ", label: "机器人 QQ 号", type: "string", hint: "留空则连上后自动识别。", section: "NapCat 连接" },
		      // workspacePath 的语义（对齐 README「会话工作区选择」）：修改只对新会话生效；
		      // 已设 per-chat /workspace 覆盖的会话不受影响。
		      { key: "workspacePath", label: "会话默认工作区路径", type: "string", control: "path", hint: "QQ 会话的工作区目录；保存后仅对新会话生效，已用 /workspace 设置 per-chat 覆盖的会话不受影响。留空 = 宿主进程工作目录。管理员私聊优先用 adminWorkspacePath，开了群记忆（groupMemoryDir）的群聊用 <群记忆目录>/<群号>，这两类会话不受本项影响。", section: "工作区" },
		      { key: "attachWorkspaceMode", label: "会话归入工作区", type: "enum", options: ["existing", "auto", "off"], optionLabels: { existing: "只归入已有的", auto: "自动为每个聊天建", off: "不归入" }, hint: "QQ 会话怎么归入 DSH 工作区（网页会话列表按工作区分组）：只归入已有的 = 已有工作区的目录就归入（另外为 workspacePath 自动建一个）；自动为每个聊天建 = 群聊、私聊各自的工作目录也自动建工作区（每个群一个）；不归入 = 不碰工作区。已有会话在 QQ 里发 /workspace attach 可立即补挂。", section: "工作区" }
		    ]
		  },
		  {
		    id: "access",
		    title: "谁能找她",
		    desc: "谁能私聊、哪些群能用、群里的人能让她做什么",
		    fields: [
		      { key: "adminUsers", label: "管理员（主人）QQ", type: "stringArray", hint: "每行一个 QQ 号。", section: "私聊" },
		      { key: "dmPolicy", label: "私聊策略", type: "enum", options: ["open", "allowlist", "disabled"], optionLabels: { open: '仅管理员（开了"允许所有用户"则所有人）', allowlist: "白名单", disabled: "不接私聊" }, hint: "open = 仅管理员；allowlist = 仅私聊白名单；disabled = 拒绝所有私聊。", section: "私聊" },
		      { key: "allowFrom", label: "私聊白名单", type: "stringArray", hint: "每行一个 QQ 号，仅白名单策略生效。", section: "私聊", dependsOnText: "仅在私聊策略为白名单时生效", dependsOn: (draft) => draftText(draft, "dmPolicy") === "allowlist" },
		      { key: "allowAllUsers", label: "允许所有用户", type: "boolean", hint: "开发用。打开后任何人都能私聊她。", section: "私聊" },
		      { key: "groupPolicy", label: "群聊策略", type: "enum", options: ["open", "allowlist", "disabled"], optionLabels: { open: "所有群", allowlist: "白名单", disabled: "不接群聊" }, hint: "open = 所有群；allowlist = 仅群聊白名单；disabled = 拒绝所有群聊。", section: "群聊" },
		      { key: "groupAllowFrom", label: "群聊白名单", type: "stringArray", hint: "每行一个群号，仅白名单策略生效。", section: "群聊", dependsOnText: "仅在群聊策略为白名单时生效", dependsOn: (draft) => draftText(draft, "groupPolicy") === "allowlist" },
		      { key: "requireMention", label: "群聊必须 @ 机器人", type: "boolean", section: "群聊" },
		      { key: "restrictedMemberPrefix", label: '群友消息加"受限用户"标记', type: "boolean", hint: "群里非管理员的消息前加 [受限用户:仅问答]，提示她只回答问题、不做文件和终端操作。关掉后提示词里群友和主人没有区别。", section: "群聊" },
		      { key: "autoAcceptAdminRequests", label: "自动同意管理员的好友/拉群请求", type: "boolean", hint: "别人的请求不同意，会私聊告诉管理员。", section: "自动处理请求" },
		      { key: "autoAllowInvitedGroups", label: "管理员拉进的群自动加白名单", type: "boolean", hint: "管理员把机器人拉进的群自动加入群白名单，保存在 mediaDir/group-allowlist.json。", section: "自动处理请求" }
		    ]
		  },
		  {
		    id: "persona",
		    title: "她",
		    desc: "用哪个预设、怎么称呼主人、主人私聊给多大权限",
		    fields: [
		      { key: "ownerTitle", label: "对主人的称呼", type: "string", hint: "系统提示和通知里怎么称呼管理员，例如“主人”。", section: "称呼" },
		      { key: "agentPreset", label: "QQ 会话默认预设", type: "string", hint: "群聊和其他人用的 dsh 预设 id；留空 = 宿主默认预设。", section: "预设与权限" },
		      { key: "adminPreset", label: "管理员私聊预设", type: "string", hint: "管理员私聊的新会话用这个预设；留空 = 同上。", section: "预设与权限" },
		      { key: "adminPermission", label: "管理员私聊权限预设", type: "string", hint: "管理员私聊每个新会话自动切到的宿主权限预设，例如 danger-full-access；留空 = 不切。", section: "预设与权限" },
		      { key: "memberPermission", label: "其他会话的宿主权限", type: "string", hint: "非管理员私聊与所有群聊的新会话自动切换的权限预设，建议 read-only；留空 = 不切，会话继承宿主默认预设。", section: "预设与权限" },
		      { key: "adminWorkspacePath", label: "管理员私聊工作目录", type: "string", control: "path", hint: "管理员私聊的会话工作目录（私密记忆所在目录）；留空 = 会话默认工作区。设置后覆盖 workspacePath：管理员私聊会话用这个目录，不受「会话默认工作区路径」影响。", section: "预设与权限" },
		      { key: "groupReasoningEffort", label: "群聊思考强度", type: "enum", options: ["", "off", "low", "high", "max"], optionLabels: { "": "跟随部署默认", off: "关闭", low: "低", high: "高", max: "最高" }, hint: "群里消息多，调低能省额度；私聊不受影响。", section: "群聊" }
		    ]
		  },
		  {
		    id: "messaging",
		    title: "说话方式",
		    desc: "一句一条、打字节奏、长回复转图片、中间消息",
		    fields: [
		      { key: "splitLines", label: "一句一条", type: "boolean", hint: "最终回复按行拆成多条 QQ 消息发送。", section: "拆句" },
		      { key: "splitMaxMessages", label: "最多拆成几条", type: "number", hint: "超过就整段发。", section: "拆句", unit: "count", min: 0, dependsOnText: "仅在「一句一条」打开时生效", dependsOn: (draft) => draftBool(draft, "splitLines") },
		      { key: "groupSplitLines", label: "群里也一句一条", type: "boolean", hint: "关掉后群里每次回复只发一条，发送量少很多，降低 QQ 风控概率。", section: "拆句", dependsOnText: "仅在「一句一条」打开时生效", dependsOn: (draft) => draftBool(draft, "splitLines") },
		      { key: "humanTypingPace", label: "所有消息按真人打字速度发", type: "boolean", hint: "每条消息发出前按字数等“打字”时间，整个小号同一时间只打一条，几个会话同时回复时自然排队。", section: "打字节奏" },
		      { key: "typingDelayPerCharMs", label: "每个字的打字时间（毫秒）", type: "number", hint: "拆分发送时每个字的打字停顿。", section: "打字节奏", unit: "ms", min: 0, dependsOnText: "仅在「所有消息按真人打字速度发」或「一句一条」打开时生效", dependsOn: (draft) => draftBool(draft, "humanTypingPace") || draftBool(draft, "splitLines") },
		      { key: "typingDelayMinMs", label: "一条消息最短打字时间（毫秒）", type: "number", hint: "两条消息之间最短停顿。", section: "打字节奏", unit: "ms", min: 0, dependsOnText: "仅在「所有消息按真人打字速度发」或「一句一条」打开时生效", dependsOn: (draft) => draftBool(draft, "humanTypingPace") || draftBool(draft, "splitLines") },
		      { key: "typingDelayMaxMs", label: "一条消息最长打字时间（毫秒）", type: "number", hint: "太长的消息也不会等超过这个时间。", section: "打字节奏", unit: "ms", min: 0, dependsOnText: "仅在「所有消息按真人打字速度发」或「一句一条」打开时生效", dependsOn: (draft) => draftBool(draft, "humanTypingPace") || draftBool(draft, "splitLines") },
		      { key: "textImageThreshold", label: "长回复转图片的字数", type: "number", hint: "超过这个字数渲染成图片卡片；0 = 永远发文字。", section: "长回复卡片", unit: "char", min: 0, zeroMeans: "关闭" },
		      { key: "cardFooter", label: "卡片页脚", type: "string", hint: "长回复转成图片时卡片底部的署名文字", section: "长回复卡片", dependsOnText: "仅在「长回复转图片的字数」大于 0 时生效", dependsOn: (draft) => draftNumber(draft, "textImageThreshold") > 0 },
		      { key: "fontFiles", label: "卡片字体文件", type: "stringArray", hint: "每个一行，填字体文件路径；Windows 一般不用填", section: "长回复卡片", dependsOnText: "仅在「长回复转图片的字数」大于 0 时生效", dependsOn: (draft) => draftNumber(draft, "textImageThreshold") > 0 },
		      { key: "fontFamilies", label: "卡片优先字体", type: "stringArray", hint: "字体家族名，覆盖系统默认", section: "长回复卡片", dependsOnText: "仅在「长回复转图片的字数」大于 0 时生效", dependsOn: (draft) => draftNumber(draft, "textImageThreshold") > 0 },
		      { key: "interimMessages", label: "中间消息", type: "boolean", hint: "回合进行中发送流式中间消息。", section: "中间消息与报错" },
		      { key: "interimRecall", label: "自动撤回中间消息", type: "boolean", hint: "中间消息发送后按「中间消息保留时长」自动单独撤回。", section: "中间消息与报错", dependsOnText: "仅在「中间消息」打开时生效", dependsOn: (draft) => draftBool(draft, "interimMessages") },
		      { key: "interimRecallMs", label: "中间消息保留时长（毫秒）", type: "number", hint: "中间消息各自发送完成后多久自动单独撤回（QQ 撤回时限约 2 分钟，建议 ≤110000）。", section: "中间消息与报错", unit: "ms", min: 0, dependsOnText: "仅在「中间消息」与「自动撤回中间消息」都打开时生效", dependsOn: (draft) => draftBool(draft, "interimMessages") && draftBool(draft, "interimRecall") },
		      { key: "sendErrorNotice", label: "发送错误通知", type: "boolean", hint: "一轮运行出错时向聊天发一条 ⚠️ 错误提示。", section: "中间消息与报错" }
		    ]
		  },
		  {
		    id: "conversation",
		    title: "会话与任务",
		    desc: "忙的时候来新消息怎么办、多久换新会话、旧会话怎么清理",
		    fields: [
		      { key: "newMessagePolicy", label: "任务运行中的新消息", type: "enum", options: ["queue", "steer"], optionLabels: { queue: "排队", steer: "插话" }, hint: "任务运行中收到新普通消息：排队=当前任务结束后按序处理（每回合至多提示一次）；插话=作为补充指令加入当前任务。图片/文件/语音/引用消息与受限用户始终按排队处理。", section: "忙的时候" },
		      { key: "autoSteerPolicy", label: "自动插话资格", type: "enum", options: ["admin", "all"], optionLabels: { admin: "仅管理员", all: "所有成员" }, hint: "插话模式下运行中收到的新普通纯文字消息谁可自动插话：仅管理员（默认）或所有成员。不具备资格的消息按排队处理；/steer 命令始终仅管理员；受限用户任何档都不自动插话。", section: "忙的时候", dependsOnText: "仅在「任务运行中的新消息」为插话时生效", dependsOn: (draft) => draftText(draft, "newMessagePolicy") === "steer" },
		      { key: "deferredTimeoutMs", label: "等待模型回复超时（毫秒）", type: "number", hint: "回合超过该时长无任何模型输出时提示超时并登记补发跟踪，任务完成后自动补发最终文字（超时补发）；发送失败最多重试 3 次，结果不确定时停止自动重试；/stop 终止该聊天的补发跟踪。0=关闭。", section: "忙的时候", unit: "ms", min: 0, zeroMeans: "关闭" },
		      { key: "unknownCommand", label: "未知命令处理", type: "enum", options: ["intercept", "passthrough"], optionLabels: { intercept: "拦截", passthrough: "透传" }, hint: "未知斜杠命令：拦截 = 提示相近命令或 /help；透传 = 交给模型处理。", section: "命令与频控" },
		      { key: "rateLimitPerMinute", label: "每分钟消息频率上限", type: "number", hint: "每 chat 每分钟普通消息条数上限；命令消息不计入；0 = 不限。", section: "命令与频控", unit: "perMin", min: 0, zeroMeans: "不限" },
		      { key: "idleResetHours", label: "空闲多久换新会话（小时）", type: "number", hint: "超过这么久没说话，下一条消息开新会话并附最近几句交接；0 = 关。", section: "换新会话", unit: "h", min: 0, zeroMeans: "关闭" },
		      { key: "privateResetDays", label: "私聊几天换一次会话", type: "number", hint: "按凌晨 4 点算天；0 = 关。", section: "换新会话", unit: "day", min: 0, zeroMeans: "关闭" },
		      { key: "groupResetDays", label: "群聊几天换一次会话", type: "number", hint: "按凌晨 4 点算天；0 = 关。", section: "换新会话", unit: "day", min: 0, zeroMeans: "关闭" },
		      { key: "sessionTitleTemplate", label: "会话标题模板", type: "string", hint: "新建 QQ 会话（以及恢复时还没有标题的旧会话）的网页标题，可用 {kind} {target} {nickname} {date} {time}；已有标题（比如在网页上手动改过）的不会被覆盖，留空 = 不自动命名。", section: "换新会话" },
		      { key: "privateSessionKeepDays", label: "私聊旧会话保留", type: "number", hint: "换下来的私聊旧会话超过这么多天没写入就删除；0 = 永不删。正在用的会话不会删", section: "旧会话清理", unit: "day", min: 0, zeroMeans: "关闭" },
		      { key: "groupSessionKeepDays", label: "群聊旧会话保留", type: "number", hint: "同上，作用于群聊", section: "旧会话清理", unit: "day", min: 0, zeroMeans: "关闭" },
		      { key: "chatIdleEvictDays", label: "空闲会话释放", type: "number", hint: "超过这么多天没动静的聊天先释放内存（会话已落盘，下次来消息自动恢复）；0 = 不释放", section: "旧会话清理", unit: "day", min: 0, zeroMeans: "关闭" }
		    ]
		  },
		  {
		    id: "group",
		    title: "群聊",
		    desc: "群里怎么叫她、给她看多少上下文、热闹时要不要看一眼",
		    fields: [
		      { key: "groupNameTriggers", label: "点名关键词", type: "stringArray", hint: "群里说出这些名字也算在叫她，不用 @", section: "怎么叫她" },
		      { key: "groupFollowupSeconds", label: "接话窗口", type: "number", hint: "她回了某人之后这段时间内，那人接着说不用 @ 也算在跟她聊；0 = 关", section: "怎么叫她", unit: "s", min: 0, zeroMeans: "关闭" },
		      { key: "groupContextLines", label: "附带的群聊条数", type: "number", hint: "叫到她时，把她没看到的最近几条群聊一并给她看；0 = 不附", section: "怎么叫她", unit: "count", min: 0, zeroMeans: "关闭" },
		      { key: "groupAutoQuote", label: "群聊自动引用", type: "enum", options: ["off", "busy", "always"], optionLabels: { off: "关闭", busy: "有人插话时", always: "总是" }, hint: "群里回复时是否自动引用叫她的那条消息：关闭 = 不自动（她仍可以自己决定引用）；有人插话时 = 从叫她那句到她回复之间群里又有人说话才引用；总是 = 每次都引用。她自己在回复开头写 [引用:消息 id] 时以她为准；私聊不自动引用。", section: "回复方式" },
		      { key: "groupPeekEnabled", label: "热闹时看一眼", type: "boolean", hint: "群里聊得热闹时隔一段时间让她看看，自己决定插不插话", section: "热闹时看一眼" },
		      { key: "groupPeekGapMinutes", label: "两次之间至少隔", type: "number", section: "热闹时看一眼", unit: "min", min: 0, dependsOnText: "仅在「热闹时看一眼」打开时生效", dependsOn: (draft) => draftBool(draft, "groupPeekEnabled") },
		      { key: "groupPeekMinMessages", label: "至少攒够多少条新消息", type: "number", section: "热闹时看一眼", unit: "count", min: 0, dependsOnText: "仅在「热闹时看一眼」打开时生效", dependsOn: (draft) => draftBool(draft, "groupPeekEnabled") },
		      { key: "groupPeekQuietMinutes", label: "她刚说过话的冷却", type: "number", hint: "她在群里说话后这段时间内不看", section: "热闹时看一眼", unit: "min", min: 0, dependsOnText: "仅在「热闹时看一眼」打开时生效", dependsOn: (draft) => draftBool(draft, "groupPeekEnabled") },
		      { key: "groupPeekWindowStart", label: "每天从几点开始", type: "string", control: "time", section: "热闹时看一眼", dependsOnText: "仅在「热闹时看一眼」打开时生效", dependsOn: (draft) => draftBool(draft, "groupPeekEnabled") },
		      { key: "groupPeekWindowEnd", label: "到几点结束", type: "string", control: "time24", hint: "可以写 24:00", section: "热闹时看一眼", dependsOnText: "仅在「热闹时看一眼」打开时生效", dependsOn: (draft) => draftBool(draft, "groupPeekEnabled") }
		    ]
		  },
		  {
		    id: "memory",
		    title: "记忆",
		    desc: "记忆文件放哪、多大会满、群友让记的内容哪些词不能出现",
		    fields: [
		      { key: "publicMemoryFile", label: "公开记忆文件", type: "string", control: "path", hint: "所有会话都读的记忆文件路径（AGENTS.md）。", section: "记忆文件" },
		      { key: "publicMemoryMaxBytes", label: "公开记忆上限（字节）", type: "number", hint: "满了群里就不再追加。", section: "记忆文件", unit: "byte", min: 0, dependsOnText: "仅在填了公开记忆文件时生效", dependsOn: (draft) => draftText(draft, "publicMemoryFile") !== "" },
		      { key: "groupMemoryDir", label: "每群一份记忆的目录", type: "string", control: "path", hint: "<目录>/<群号>/AGENTS.md，群会话以此为工作目录；留空 = 所有群共用公开记忆。设置后覆盖 workspacePath：群会话用 <目录>/<群号>，不受「会话默认工作区路径」影响。", section: "记忆文件" },
		      { key: "groupMemoryMaxBytes", label: "每群记忆上限（字节）", type: "number", hint: "每个群的记忆文件达到这个大小后就不再追加。", section: "记忆文件", unit: "byte", min: 0, dependsOnText: "仅在填了每群记忆目录时生效", dependsOn: (draft) => draftText(draft, "groupMemoryDir") !== "" },
		      { key: "privateMemoryMaxBytes", label: "私密记忆建议上限", type: "number", hint: "主人私聊工作目录里 AGENTS.md 的上限，会写进她的功能说明，由她自己整理", section: "记忆文件", unit: "byte", min: 0 },
		      { key: "memoryNoteDenyWords", label: "群记忆禁词", type: "stringArray", hint: "群友让她记的内容里出现这些词就拒绝（微信号、真名、住址等）；主人 QQ 号自动包含", section: "群记忆过滤" }
		    ]
		  },
		  {
		    id: "proactive",
		    title: "主动聊天",
		    desc: "每天什么时间、几次主动找主人；定时任务在这里查看",
		    fields: [
		      { key: "proactiveEnabled", label: "开启主动聊天", type: "boolean", hint: "每天在时间窗内随机叫醒几次，她自己决定发不发。", section: "主动聊天" },
		      { key: "proactiveChatId", label: "主动找谁", type: "string", hint: "会话 id，例如 private:QQ号。", section: "主动聊天", placeholder: "private:QQ号", dependsOnText: "仅在「开启主动聊天」打开时生效", dependsOn: (draft) => draftBool(draft, "proactiveEnabled") },
		      { key: "proactiveWindowStart", label: "时间窗开始", type: "string", control: "time", hint: "HH:MM。", section: "时间窗", dependsOnText: "仅在「开启主动聊天」打开时生效", dependsOn: (draft) => draftBool(draft, "proactiveEnabled") },
		      { key: "proactiveWindowEnd", label: "时间窗结束", type: "string", control: "time", hint: "HH:MM。", section: "时间窗", dependsOnText: "仅在「开启主动聊天」打开时生效", dependsOn: (draft) => draftBool(draft, "proactiveEnabled") },
		      { key: "proactiveMinPerDay", label: "每天至少几次", type: "number", section: "频率", unit: "perDay", min: 0, dependsOnText: "仅在「开启主动聊天」打开时生效", dependsOn: (draft) => draftBool(draft, "proactiveEnabled") },
		      { key: "proactiveMaxPerDay", label: "每天最多几次", type: "number", section: "频率", unit: "perDay", min: 0, dependsOnText: "仅在「开启主动聊天」打开时生效", dependsOn: (draft) => draftBool(draft, "proactiveEnabled") },
		      { key: "proactiveMinGapMinutes", label: "两次之间至少隔几分钟", type: "number", section: "频率", unit: "min", min: 0, dependsOnText: "仅在「开启主动聊天」打开时生效", dependsOn: (draft) => draftBool(draft, "proactiveEnabled") },
		      { key: "proactiveSkipIfActiveMinutes", label: "刚聊过几分钟内跳过", type: "number", section: "频率", unit: "min", min: 0, dependsOnText: "仅在「开启主动聊天」打开时生效", dependsOn: (draft) => draftBool(draft, "proactiveEnabled") },
		      { key: "proactiveMaxUnanswered", label: "几条没回就当天停止", type: "number", section: "频率", unit: "count", min: 0, dependsOnText: "仅在「开启主动聊天」打开时生效", dependsOn: (draft) => draftBool(draft, "proactiveEnabled") }
		    ]
		  },
		  {
		    id: "media",
		    title: "媒体与语音",
		    desc: "表情包库、语音转写、收发图片与文件的大小上限",
		    fields: [
		      { key: "stickerDir", label: "表情包库目录", type: "string", control: "path", hint: "留空 = 关闭表情包（她没有存、找、发表情包的工具）。填一个目录即开启，例如 E:\\To DeepSeek\\companion\\stickers", section: "表情包库" },
		      { key: "stickerMaxCount", label: "最多存多少张", type: "number", section: "表情包库", unit: "count", min: 0, dependsOnText: "仅在填了表情包库目录时生效", dependsOn: (draft) => draftText(draft, "stickerDir") !== "" },
		      { key: "stickerMaxBytes", label: "单张最大", type: "number", section: "表情包库", unit: "byte", min: 0, dependsOnText: "仅在填了表情包库目录时生效", dependsOn: (draft) => draftText(draft, "stickerDir") !== "" },
		      { key: "stickerDailyMax", label: "每天最多新存几张", type: "number", hint: "控制她看图打标签的花费；合并到已有表情不算", section: "表情包库", unit: "perDay", min: 0, dependsOnText: "仅在填了表情包库目录时生效", dependsOn: (draft) => draftText(draft, "stickerDir") !== "" },
		      { key: "sttEnabled", label: "收到语音转成文字", type: "boolean", hint: "本机离线识别，需要 ffmpeg 和识别引擎；没装好时她只会看到 [语音]", section: "语音转写" },
		      { key: "sttEngine", label: "识别引擎", type: "enum", options: ["auto", "sherpa-onnx", "whisper-cpp", "command", "openai", "custom"], optionLabels: { auto: "自动", "sherpa-onnx": "SenseVoice（推荐）", "whisper-cpp": "whisper.cpp", command: "自定义命令", openai: "openai（旧名，等同自动）", custom: "custom（旧名，等同自定义命令）" }, section: "语音转写", dependsOnText: "仅在「收到语音转成文字」打开时生效", dependsOn: (draft) => draftBool(draft, "sttEnabled") },
		      { key: "sttModel", label: "模型", type: "string", control: "path", hint: "sherpa-onnx 填 SenseVoice 模型目录；whisper.cpp 填模型名或 .bin 路径；留空用默认位置", section: "语音转写", dependsOnText: "仅在「收到语音转成文字」打开时生效", dependsOn: (draft) => draftBool(draft, "sttEnabled") },
		      { key: "sttCommand", label: "自定义命令程序", type: "string", control: "path", section: "语音转写", dependsOnText: "仅在「收到语音转成文字」打开，且识别引擎为自定义命令时生效", dependsOn: (draft) => draftBool(draft, "sttEnabled") && (draftText(draft, "sttEngine") === "command" || draftText(draft, "sttEngine") === "custom") },
		      { key: "sttArgs", label: "自定义命令参数", type: "stringArray", hint: "每个一行，可用 {wav} {input} {model} {lang} 占位", section: "语音转写", dependsOnText: "仅在「收到语音转成文字」打开，且识别引擎为自定义命令时生效", dependsOn: (draft) => draftBool(draft, "sttEnabled") && (draftText(draft, "sttEngine") === "command" || draftText(draft, "sttEngine") === "custom") },
		      { key: "sttLanguage", label: "语言", type: "string", hint: "auto 自动判断，或 zh / en / ja…", section: "语音转写", dependsOnText: "仅在「收到语音转成文字」打开时生效", dependsOn: (draft) => draftBool(draft, "sttEnabled") },
		      { key: "sttMaxSeconds", label: "每条只转前多少秒", type: "number", section: "语音转写", unit: "s", min: 0, dependsOnText: "仅在「收到语音转成文字」打开时生效", dependsOn: (draft) => draftBool(draft, "sttEnabled") },
		      { key: "sttTimeoutMs", label: "单次转写超时", type: "number", section: "语音转写", unit: "ms", min: 0, dependsOnText: "仅在「收到语音转成文字」打开时生效", dependsOn: (draft) => draftBool(draft, "sttEnabled") },
		      { key: "inboundImageMaxPx", label: "收到的图片压到多大（像素）", type: "number", hint: "长边超过就缩小再给模型看，省 token。", section: "图片与文件", unit: "px", min: 0 },
		      { key: "outboundImageMaxBytes", label: "发出图片上限", type: "number", section: "图片与文件", unit: "byte", min: 0 },
		      { key: "maxVoiceBytes", label: "发出语音上限", type: "number", section: "图片与文件", unit: "byte", min: 0 },
		      { key: "maxFileBytes", label: "发出视频/文件上限", type: "number", section: "图片与文件", unit: "byte", min: 0 },
		      { key: "inboundFileMaxBytes", label: "接收文件上限", type: "number", hint: "0 = 不限制", section: "图片与文件", unit: "byte", min: 0, zeroMeans: "不限" },
		      { key: "mediaDir", label: "媒体与状态目录", type: "string", control: "path", hint: "留空 = <DSH 目录>/media/onebot。改了之后会话映射等状态文件也换位置，旧文件不会自动搬", section: "存储与网络" },
		      { key: "tempTtlHours", label: "临时媒体保留", type: "number", section: "存储与网络", unit: "h", min: 0 },
		      { key: "allowPrivateHosts", label: "允许从内网地址下载", type: "boolean", hint: "默认拒绝下载内网/本机地址（防 SSRF）；NapCat 文件服务在本机时才需要打开", section: "存储与网络" }
		    ]
		  },
		  {
		    id: "diagnostics",
		    title: "诊断",
		    desc: "日志级别、发送审计、决策追踪、消息去重",
		    fields: [
		      { key: "logLevel", label: "控制台日志级别", type: "enum", options: ["debug", "info", "warn", "error"], optionLabels: { debug: "全部", info: "常规（默认）", warn: "只看警告和错误", error: "只看错误" }, section: "日志" },
		      { key: "actionAuditEnabled", label: "工具发送审计", type: "boolean", hint: "她用工具主动发出的图片、语音、文件、合并转发，每条都记一行到 qq-actions.log；关闭后不再留这份记录，发送本身不受影响。", section: "审计与追踪" },
		      { key: "traceEnabled", label: "决策追踪（trace）", type: "boolean", hint: "把每个入站/出站决策事件写入 qq-trace.jsonl 便于排查；关闭后零文件、行为与关闭时完全一致。", section: "审计与追踪" },
		      { key: "traceLevel", label: "追踪级别", type: "enum", options: ["debug", "warn"], optionLabels: { debug: "全部事件", warn: "只记被拒或失败" }, section: "审计与追踪", dependsOnText: "仅在「决策追踪」打开时生效", dependsOn: (draft) => draftBool(draft, "traceEnabled") },
		      { key: "dedupWindowSeconds", label: "消息去重窗口", type: "number", hint: "断线重连时同一条消息重投只处理一次；0 = 关", section: "入站", unit: "s", min: 0, zeroMeans: "关闭" },
		      { key: "ignoreSelf", label: "忽略自己发出的消息", type: "boolean", hint: "防止她回复自己形成循环，一般不要关", section: "入站" },
		      { key: "sensitivePatterns", label: "出站敏感内容正则", type: "stringArray", hint: "每个一行，只记录不拦截；留空用内置规则", section: "出站审计" }
		    ]
		  }
		];
		var ALL_FIELDS = [];
		for (const group of GROUPS) {
		  for (const field of group.fields) ALL_FIELDS.push(field);
		}
		var DEFAULTS = {
		  host: "127.0.0.1",
		  port: 8643,
		  accessToken: "",
		  botQQ: "",
		  workspacePath: "",
		  attachWorkspaceMode: "existing",
		  adminUsers: [],
		  dmPolicy: "open",
		  allowFrom: [],
		  allowAllUsers: false,
		  groupPolicy: "open",
		  groupAllowFrom: [],
		  requireMention: true,
		  restrictedMemberPrefix: true,
		  autoAcceptAdminRequests: false,
		  autoAllowInvitedGroups: false,
		  ownerTitle: "管理员",
		  agentPreset: "",
		  adminPreset: "",
		  adminPermission: "",
		  memberPermission: "",
		  adminWorkspacePath: "",
		  groupReasoningEffort: "",
		  splitLines: false,
		  splitMaxMessages: 6,
		  groupSplitLines: true,
		  humanTypingPace: false,
		  typingDelayPerCharMs: 80,
		  typingDelayMinMs: 500,
		  typingDelayMaxMs: 2500,
		  textImageThreshold: 150,
		  cardFooter: "dsh",
		  fontFiles: [],
		  fontFamilies: [],
		  interimMessages: true,
		  interimRecall: true,
		  interimRecallMs: 9e4,
		  sendErrorNotice: true,
		  newMessagePolicy: "queue",
		  autoSteerPolicy: "admin",
		  deferredTimeoutMs: 6e5,
		  unknownCommand: "intercept",
		  rateLimitPerMinute: 30,
		  idleResetHours: 0,
		  privateResetDays: 0,
		  groupResetDays: 0,
		  sessionTitleTemplate: "{kind} {target} · {date}",
		  privateSessionKeepDays: 0,
		  groupSessionKeepDays: 0,
		  chatIdleEvictDays: 7,
		  groupNameTriggers: [],
		  groupFollowupSeconds: 0,
		  groupContextLines: 0,
		  groupAutoQuote: "off",
		  groupPeekEnabled: false,
		  groupPeekGapMinutes: 30,
		  groupPeekMinMessages: 10,
		  groupPeekQuietMinutes: 10,
		  groupPeekWindowStart: "09:00",
		  groupPeekWindowEnd: "24:00",
		  publicMemoryFile: "",
		  publicMemoryMaxBytes: 6144,
		  groupMemoryDir: "",
		  groupMemoryMaxBytes: 8192,
		  privateMemoryMaxBytes: 24576,
		  memoryNoteDenyWords: [],
		  proactiveEnabled: false,
		  proactiveChatId: "",
		  proactiveWindowStart: "09:00",
		  proactiveWindowEnd: "22:00",
		  proactiveMinPerDay: 4,
		  proactiveMaxPerDay: 6,
		  proactiveMinGapMinutes: 90,
		  proactiveSkipIfActiveMinutes: 30,
		  proactiveMaxUnanswered: 2,
		  stickerDir: "",
		  stickerMaxCount: 300,
		  stickerMaxBytes: 4194304,
		  stickerDailyMax: 20,
		  sttEnabled: false,
		  sttEngine: "auto",
		  sttModel: "",
		  sttCommand: "",
		  sttArgs: [],
		  sttLanguage: "auto",
		  sttMaxSeconds: 60,
		  sttTimeoutMs: 6e4,
		  inboundImageMaxPx: 2048,
		  outboundImageMaxBytes: 8388608,
		  maxVoiceBytes: 15728640,
		  maxFileBytes: 20971520,
		  inboundFileMaxBytes: 20971520,
		  mediaDir: "",
		  tempTtlHours: 6,
		  allowPrivateHosts: false,
		  logLevel: "info",
		  actionAuditEnabled: true,
		  traceEnabled: false,
		  traceLevel: "debug",
		  dedupWindowSeconds: 300,
		  ignoreSelf: true,
		  sensitivePatterns: []
		};
		var GROUP_KEYS = {};
		for (const group of GROUPS) GROUP_KEYS[group.id] = group.fields.map((field) => field.key);
		var CARD_NOTES = {
		  media: [
		    { section: "语音转写", mode: "foot", text: "纠错表（sttReplacements）请在 cordis.patch.yml 里编辑" }
		  ],
		  proactive: [
		    { section: "定时任务", mode: "card", text: "定时任务请在 cordis.patch.yml 的 scheduledPrompts 里编辑（F3 起这里显示只读列表）。" }
		  ]
		};

		// src/client/logic.ts
		function format(template, params) {
		  return String(template).replace(/\{(\w+)\}/g, (match, key) => Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match);
		}
		function messageOf(cause) {
		  return cause instanceof Error ? cause.message : String(cause);
		}
		function unwrap(result) {
		  if (result != null && result.ok === true) return result.value;
		  const detail = result != null && result.error != null ? result.error.message : "unknown remote error";
		  const error = new Error(detail);
		  if (result != null && result.error != null && result.error.code != null) {
		    ;
		    error.code = result.error.code;
		  }
		  throw error;
		}
		var CONFLICT_RE = /onebot-settings\/conflict/i;
		function isConflictError(cause) {
		  if (cause == null) return false;
		  const error = cause;
		  return error.code === "onebot-settings/conflict" || CONFLICT_RE.test(String(error.message || ""));
		}
		function parseTagInput(text) {
		  const raw = String(text == null ? "" : text);
		  const out = [];
		  for (const piece of raw.split(/[\r\n,，]+/)) {
		    const item = piece.trim();
		    if (item === "") continue;
		    if (out.indexOf(item) >= 0) continue;
		    out.push(item);
		  }
		  return out;
		}
		function tagsOf(raw) {
		  if (Array.isArray(raw)) {
		    const out = [];
		    for (const entry of raw) {
		      const item = String(entry == null ? "" : entry).trim();
		      if (item === "" || out.indexOf(item) >= 0) continue;
		      out.push(item);
		    }
		    return out;
		  }
		  return parseTagInput(raw);
		}
		function appendTags(list, text) {
		  const out = tagsOf(list);
		  for (const item of parseTagInput(text)) {
		    if (out.indexOf(item) < 0) out.push(item);
		  }
		  return out;
		}
		function removeTagAt(list, index) {
		  const out = tagsOf(list);
		  if (Number.isInteger(index) && index >= 0 && index < out.length) out.splice(index, 1);
		  return out;
		}
		var UNIT_LABELS = {
		  ms: "毫秒",
		  s: "秒",
		  min: "分钟",
		  h: "小时",
		  day: "天",
		  byte: "字节",
		  px: "像素",
		  char: "字",
		  count: "条",
		  perDay: "次/天",
		  perMin: "条/分钟"
		};
		function unitLabel(unit) {
		  if (unit == null) return "";
		  return UNIT_LABELS[unit] != null ? UNIT_LABELS[unit] : unit;
		}
		function oneDecimal(value) {
		  const text = value.toFixed(1);
		  return text.endsWith(".0") ? text.slice(0, -2) : text;
		}
		function unitConversion(field, raw) {
		  const text = typeof raw === "number" ? String(raw) : String(raw == null ? "" : raw).trim();
		  if (text === "") return "";
		  const value = Number(text);
		  if (!Number.isFinite(value)) return "";
		  if (value === 0 && field.zeroMeans != null) return "= " + field.zeroMeans;
		  switch (field.unit) {
		    case "ms":
		      if (value >= 6e4) return "= " + oneDecimal(value / 6e4) + " 分钟";
		      if (value >= 1e3) return "= " + oneDecimal(value / 1e3) + " 秒";
		      return "";
		    case "s":
		      if (value >= 60) return "= " + oneDecimal(value / 60) + " 分钟";
		      return "";
		    case "min":
		      if (value >= 60) return "= " + oneDecimal(value / 60) + " 小时";
		      return "";
		    case "h":
		      if (value >= 24) return "= " + oneDecimal(value / 24) + " 天";
		      return "";
		    case "byte":
		      if (value >= 1024 * 1024) return "= " + oneDecimal(value / (1024 * 1024)) + " MB";
		      if (value >= 1024) return "= " + oneDecimal(value / 1024) + " KB";
		      return "";
		    default:
		      return "";
		  }
		}
		function unitText(field, raw) {
		  const conversion = unitConversion(field, raw);
		  const label = unitLabel(field.unit);
		  if (conversion !== "") {
		    if (String(raw == null ? "" : raw).trim() === "0") return conversion;
		    return label === "" ? conversion : label + " " + conversion;
		  }
		  return label;
		}
		function formatDefaultValue(field, value) {
		  if (field.type === "boolean") return value === true ? "开" : "关";
		  if (field.type === "stringArray") {
		    const list = tagsOf(value);
		    return list.length === 0 ? "空" : list.join("、");
		  }
		  if (value === void 0 || value === null || value === "") return "空";
		  return String(value);
		}
		function snapshotValueToDraft(field, value) {
		  if (field.type === "secret") return "";
		  if (field.type === "stringArray") return tagsOf(value);
		  if (field.type === "number") return value === void 0 || value === null ? "" : String(value);
		  if (field.type === "boolean") return value === true;
		  return value === void 0 || value === null ? "" : String(value);
		}
		function draftFromSnapshot(snapshot) {
		  const config = snapshot != null && snapshot.config != null ? snapshot.config : {};
		  const draft = {};
		  for (const field of ALL_FIELDS) draft[field.key] = snapshotValueToDraft(field, config[field.key]);
		  return draft;
		}
		function draftFromDefaults() {
		  return draftFromSnapshot({ config: DEFAULTS });
		}
		function coerceValue(field, raw) {
		  if (field.type === "number") {
		    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
		    return Number.isFinite(n) ? n : NaN;
		  }
		  if (field.type === "boolean") return raw === true;
		  if (field.type === "stringArray") return tagsOf(raw);
		  return String(raw == null ? "" : raw);
		}
		function valueEquals(a, b) {
		  return JSON.stringify(a === void 0 ? null : a) === JSON.stringify(b === void 0 ? null : b);
		}
		function computePatch(draft, config, opts) {
		  const options = opts == null ? {} : opts;
		  const config_ = config == null ? {} : config;
		  const patch = {};
		  const invalidKeys = [];
		  for (const field of ALL_FIELDS) {
		    if (field.type === "secret") continue;
		    const next = coerceValue(field, draft[field.key]);
		    if (field.type === "number" && Number.isNaN(next)) {
		      invalidKeys.push(field.key);
		      continue;
		    }
		    if (!valueEquals(next, config_[field.key])) patch[field.key] = next;
		  }
		  const secretDraft = options.secretDraft;
		  if (options.clearSecret === true) patch.accessToken = "";
		  else if (typeof secretDraft === "string" && secretDraft !== "") patch.accessToken = secretDraft;
		  return { patch, invalidKeys };
		}
		function fillWorkspacePath(draft, path) {
		  const next = Object.assign({}, draft == null ? {} : draft);
		  next.workspacePath = String(path == null ? "" : path);
		  return next;
		}

		// src/client/search.ts
		function normalizeQuery(query) {
		  return String(query == null ? "" : query).trim().toLowerCase();
		}
		function includesNeedle(text, needle) {
		  if (needle === "") return false;
		  return text.toLowerCase().indexOf(needle) >= 0;
		}
		function matchField(field, group, query) {
		  const needle = normalizeQuery(query);
		  if (needle === "") return [];
		  const hits = [];
		  if (includesNeedle(field.label, needle)) hits.push("label");
		  if (includesNeedle(field.key, needle)) hits.push("key");
		  if (field.hint != null && includesNeedle(field.hint, needle)) hits.push("hint");
		  if (includesNeedle(group.title, needle)) hits.push("group");
		  if (includesNeedle(field.section, needle)) hits.push("section");
		  return hits;
		}
		function searchFields(query, groups) {
		  const source = Array.isArray(groups) ? groups : GROUPS;
		  const out = [];
		  for (const group of source) {
		    for (const field of group.fields) {
		      const hits = matchField(field, group, query);
		      if (hits.length === 0) continue;
		      out.push({ groupId: group.id, groupTitle: group.title, field, hits });
		    }
		  }
		  return out;
		}
		function groupMatches(matches) {
		  const order = [];
		  const buckets = {};
		  for (const match of matches) {
		    if (buckets[match.groupId] === void 0) {
		      buckets[match.groupId] = [];
		      order.push(match.groupId);
		    }
		    buckets[match.groupId].push(match);
		  }
		  return order.map((groupId) => ({
		    groupId,
		    groupTitle: buckets[groupId][0].groupTitle,
		    matches: buckets[groupId]
		  }));
		}
		function highlightSegments(text, query) {
		  const source = String(text == null ? "" : text);
		  const needle = normalizeQuery(query);
		  if (source === "") return [];
		  if (needle === "") return [{ text: source, hit: false }];
		  const lowerSource = source.toLowerCase();
		  const segments = [];
		  let cursor = 0;
		  while (cursor < source.length) {
		    const found = lowerSource.indexOf(needle, cursor);
		    if (found < 0) {
		      segments.push({ text: source.slice(cursor), hit: false });
		      break;
		    }
		    if (found > cursor) segments.push({ text: source.slice(cursor, found), hit: false });
		    segments.push({ text: source.slice(found, found + needle.length), hit: true });
		    cursor = found + needle.length;
		  }
		  return segments;
		}

		// src/client/render.ts
		function h(ReactImpl2, tag, props, ...children) {
		  return ReactImpl2.createElement(tag, props, ...children);
		}
		function fallbackTranslate(key) {
		  return zh[key] != null ? zh[key] : key;
		}
		function fieldControlId(key) {
		  return "qqc-f-" + key;
		}
		function fieldHintId(key) {
		  return "qqc-h-" + key;
		}
		function draftOf(options, field) {
		  const draft = options.draft == null ? {} : options.draft;
		  return draft[field.key];
		}
		function isFieldDirty(field, options) {
		  if (field.type === "secret") {
		    if (options.clearSecret === true) return true;
		    return String(draftOf(options, field) == null ? "" : draftOf(options, field)) !== "";
		  }
		  if (options.config == null) return false;
		  const next = coerceValue(field, draftOf(options, field));
		  if (field.type === "number" && Number.isNaN(next)) {
		    const raw = String(draftOf(options, field) == null ? "" : draftOf(options, field)).trim();
		    return raw !== String(options.config[field.key] == null ? "" : options.config[field.key]);
		  }
		  return !valueEquals(next, options.config[field.key]);
		}
		function isFieldNonDefault(field, options) {
		  if (options.config == null || options.defaults == null) return false;
		  return !valueEquals(options.config[field.key], options.defaults[field.key]);
		}
		function isFieldInactive(field, options) {
		  if (typeof field.dependsOn !== "function") return false;
		  const draft = options.draft == null ? {} : options.draft;
		  return field.dependsOn(draft) === false;
		}
		function canResetField(field, options) {
		  if (options.defaults == null || field.type === "secret") return false;
		  const defaultValue = options.defaults[field.key];
		  const next = coerceValue(field, draftOf(options, field));
		  if (field.type === "number" && Number.isNaN(next)) {
		    return String(draftOf(options, field) == null ? "" : draftOf(options, field)).trim() !== String(defaultValue);
		  }
		  const draftDiffers = !valueEquals(next, defaultValue);
		  const configDiffers = options.config != null && !valueEquals(options.config[field.key], defaultValue);
		  return draftDiffers || configDiffers;
		}
		function richText(ReactImpl2, text, query) {
		  const segments = highlightSegments(text, query == null ? "" : query);
		  return segments.map((segment, index) => segment.hit ? h(ReactImpl2, "mark", { className: "qqc-mark", key: "mark-" + index }, segment.text) : segment.text);
		}
		function controlOf(ReactImpl2, field, options, t, describedBy) {
		  const value = draftOf(options, field);
		  const disabled = options.disabled === true;
		  const id = fieldControlId(field.key);
		  const onChange = typeof options.onChange === "function" ? options.onChange : () => {
		  };
		  if (field.type === "boolean") {
		    const on = value === true;
		    return h(ReactImpl2, "button", {
		      className: "qqc-switch",
		      type: "button",
		      role: "switch",
		      id,
		      "aria-checked": on,
		      "aria-describedby": describedBy,
		      disabled,
		      onClick: () => {
		        onChange(field, !on);
		      }
		    });
		  }
		  if (field.type === "enum") {
		    const enumOptions = Array.isArray(field.options) ? field.options : [];
		    const optionLabels = field.optionLabels == null ? {} : field.optionLabels;
		    return h(ReactImpl2, "select", {
		      className: "qqc-select",
		      id,
		      value: String(value == null ? "" : value),
		      disabled,
		      "aria-describedby": describedBy,
		      onChange: (event) => {
		        onChange(field, event.target.value);
		      }
		    }, enumOptions.map((option) => {
		      const label = optionLabels[option] != null ? optionLabels[option] : option === "" ? t("select.followDefault") : option;
		      return h(ReactImpl2, "option", { key: option, value: option }, label);
		    }));
		  }
		  if (field.type === "stringArray") {
		    const tags = tagsOf(value);
		    const buffer = options.tagInputs != null && options.tagInputs[field.key] != null ? options.tagInputs[field.key] : "";
		    const onTagInput = typeof options.onTagInput === "function" ? options.onTagInput : () => {
		    };
		    const onTagCommit = typeof options.onTagCommit === "function" ? options.onTagCommit : () => {
		    };
		    const onTagRemove = typeof options.onTagRemove === "function" ? options.onTagRemove : () => {
		    };
		    const onTagBackspace = typeof options.onTagBackspace === "function" ? options.onTagBackspace : () => {
		    };
		    return h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-tags" },
		      tags.map((tag, index) => h(
		        ReactImpl2,
		        "span",
		        { className: "qqc-tag", key: tag },
		        h(ReactImpl2, "span", { className: "qqc-tag-text" }, tag),
		        h(ReactImpl2, "button", {
		          className: "qqc-tag-x",
		          type: "button",
		          "aria-label": format(t("tags.remove"), { item: tag }),
		          disabled,
		          onClick: () => {
		            onTagRemove(field, index);
		          }
		        }, "×")
		      )),
		      h(ReactImpl2, "input", {
		        className: "qqc-tags-input",
		        type: "text",
		        id,
		        value: buffer,
		        disabled,
		        placeholder: tags.length === 0 ? t("tags.placeholder") : "",
		        "aria-label": field.label,
		        "aria-describedby": describedBy,
		        spellCheck: false,
		        onChange: (event) => {
		          onTagInput(field, event.target.value);
		        },
		        onKeyDown: (event) => {
		          if (event.key === "Enter" || event.key === "," || event.key === "，") {
		            event.preventDefault();
		            const text = String(event.currentTarget.value == null ? "" : event.currentTarget.value);
		            if (text.trim() !== "") onTagCommit(field, text);
		            return;
		          }
		          if (event.key === "Backspace" && String(event.currentTarget.value == null ? "" : event.currentTarget.value) === "") {
		            event.preventDefault();
		            onTagBackspace(field);
		          }
		        },
		        onPaste: (event) => {
		          const text = event.clipboardData != null ? String(event.clipboardData.getData("text")) : "";
		          if (/[\r\n,，]/.test(text)) {
		            event.preventDefault();
		            onTagCommit(field, text);
		          }
		        }
		      })
		    );
		  }
		  if (field.type === "secret") {
		    const text = String(value == null ? "" : value);
		    const onSecretChange = typeof options.onSecretChange === "function" ? options.onSecretChange : () => {
		    };
		    const onClearSecretChange = typeof options.onClearSecretChange === "function" ? options.onClearSecretChange : () => {
		    };
		    const set = options.secretSet === true && options.clearSecret !== true;
		    return h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-control-line" },
		      h(ReactImpl2, "span", { className: "qqc-dot", "data-state": set ? "ok" : "idle", "aria-hidden": "true" }),
		      h(ReactImpl2, "span", { className: "qqc-secret-state" }, set ? t("secret.set") : t("secret.unset")),
		      h(ReactImpl2, "input", {
		        className: "qqc-input",
		        type: "password",
		        id,
		        value: text,
		        disabled: disabled || options.clearSecret === true,
		        placeholder: t("secret.placeholder"),
		        autoComplete: "new-password",
		        "aria-describedby": describedBy,
		        onChange: (event) => {
		          onSecretChange(event.target.value);
		        }
		      }),
		      h(ReactImpl2, "button", {
		        className: "qqc-btn qqc-btn--sm",
		        type: "button",
		        "data-variant": "ghost",
		        disabled,
		        onClick: () => {
		          onClearSecretChange(options.clearSecret !== true);
		        }
		      }, options.clearSecret === true ? t("secret.undoClear") : t("secret.clear"))
		    );
		  }
		  const kind = field.control != null ? field.control : field.type === "number" ? "number" : "text";
		  return h(ReactImpl2, "input", {
		    className: "qqc-input",
		    "data-kind": kind,
		    type: "text",
		    inputMode: field.type === "number" ? "numeric" : void 0,
		    id,
		    value: String(value == null ? "" : value),
		    disabled,
		    placeholder: field.placeholder != null ? field.placeholder : kind === "time" || kind === "time24" ? "HH:MM" : void 0,
		    spellCheck: field.control === "path" ? false : void 0,
		    autoComplete: field.control === "path" ? "off" : void 0,
		    "aria-describedby": describedBy,
		    onChange: (event) => {
		      onChange(field, event.target.value);
		    }
		  });
		}
		function renderFieldRow(ReactImpl2, field, opts) {
		  const options = opts == null ? {} : opts;
		  const t = typeof options.t === "function" ? options.t : fallbackTranslate;
		  const dirty = isFieldDirty(field, options);
		  const nonDefault = isFieldNonDefault(field, options);
		  const inactive = isFieldInactive(field, options);
		  const willClear = field.type === "secret" && options.clearSecret === true;
		  const stack = field.type === "stringArray";
		  const badges = [];
		  if (dirty) badges.push(h(ReactImpl2, "span", { className: "qqc-badge", "data-tone": "brand", key: "badge-dirty" }, t("badge.dirty")));
		  if (nonDefault) badges.push(h(ReactImpl2, "span", { className: "qqc-badge", key: "badge-non-default" }, t("badge.nonDefault")));
		  if (inactive) badges.push(h(ReactImpl2, "span", { className: "qqc-badge", key: "badge-inactive" }, t("badge.inactive")));
		  if (willClear) badges.push(h(ReactImpl2, "span", { className: "qqc-badge", "data-tone": "warn", key: "badge-will-clear" }, t("badge.willClear")));
		  const hintNodes = [];
		  const hasHint = field.hint != null && field.hint !== "";
		  if (hasHint) {
		    hintNodes.push(h(
		      ReactImpl2,
		      "p",
		      { className: "qqc-hint", id: fieldHintId(field.key) },
		      ...richText(ReactImpl2, field.hint == null ? "" : field.hint, options.highlight)
		    ));
		  }
		  const hasInactiveNote = inactive && field.dependsOnText != null;
		  if (hasInactiveNote) {
		    hintNodes.push(h(ReactImpl2, "p", {
		      className: "qqc-hint",
		      id: hasHint ? void 0 : fieldHintId(field.key)
		    }, field.dependsOnText));
		  }
		  const describedBy = hasHint || hasInactiveNote ? fieldHintId(field.key) : void 0;
		  const control = controlOf(ReactImpl2, field, options, t, describedBy);
		  const unitTextValue = field.type === "number" ? unitText(field, draftOf(options, field)) : "";
		  const unit = unitTextValue === "" ? null : h(ReactImpl2, "span", { className: "qqc-unit" }, unitTextValue);
		  const resetButton = canResetField(field, options) && typeof options.onResetField === "function" ? h(ReactImpl2, "button", {
		    className: "qqc-btn qqc-btn--icon",
		    type: "button",
		    "data-variant": "ghost",
		    "aria-label": format(t("field.resetDefault"), { value: formatDefaultValue(field, options.defaults == null ? "" : options.defaults[field.key]) }),
		    title: format(t("field.resetDefault"), { value: formatDefaultValue(field, options.defaults == null ? "" : options.defaults[field.key]) }),
		    disabled: options.disabled === true,
		    onClick: () => {
		      if (typeof options.onResetField === "function") options.onResetField(field);
		    }
		  }, "↺") : null;
		  let controlNode;
		  if (field.type === "boolean") {
		    const on = draftOf(options, field) === true;
		    controlNode = h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-control" },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-switch-line" },
		        control,
		        h(ReactImpl2, "span", { className: "qqc-switch-text" }, on ? t("switch.on") : t("switch.off")),
		        resetButton
		      )
		    );
		  } else if (field.type === "stringArray") {
		    controlNode = h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-control" },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-control-line" },
		        h(ReactImpl2, "div", { style: { flex: "1 1 auto", minWidth: 0 } }, control),
		        resetButton
		      )
		    );
		  } else if (field.type === "secret") {
		    controlNode = h(ReactImpl2, "div", { className: "qqc-control" }, control);
		  } else {
		    controlNode = h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-control" },
		      h(ReactImpl2, "div", { className: "qqc-control-line" }, control, unit, resetButton)
		    );
		  }
		  const props = {
		    className: stack ? "qqc-row qqc-row--stack" : "qqc-row",
		    "data-key": field.key,
		    key: field.key
		  };
		  if (dirty) props["data-dirty"] = "true";
		  if (inactive) props["data-inactive"] = "true";
		  return h(
		    ReactImpl2,
		    "div",
		    props,
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-row-meta" },
		      h(
		        ReactImpl2,
		        "label",
		        { className: "qqc-label", htmlFor: fieldControlId(field.key) },
		        ...richText(ReactImpl2, field.label, options.highlight),
		        ...badges
		      ),
		      h(ReactImpl2, "div", { className: "qqc-key" }, ...richText(ReactImpl2, field.key, options.highlight)),
		      ...hintNodes
		    ),
		    controlNode
		  );
		}
		function groupCards(group) {
		  const cards = [];
		  for (const field of group.fields) {
		    const last = cards.length === 0 ? void 0 : cards[cards.length - 1];
		    if (last != null && last.section === field.section) last.fields.push(field);
		    else cards.push({ section: field.section, fields: [field] });
		  }
		  return cards;
		}
		function rowVisible(field, options) {
		  if (options.onlyChanged !== true) return true;
		  return isFieldDirty(field, options) || isFieldNonDefault(field, options);
		}
		function renderGroup(ReactImpl2, group, opts) {
		  const options = opts == null ? {} : opts;
		  const t = typeof options.t === "function" ? options.t : fallbackTranslate;
		  const notes = options.onlyChanged === true ? [] : CARD_NOTES[group.id] == null ? [] : CARD_NOTES[group.id];
		  const cards = [];
		  for (const card of groupCards(group)) {
		    const rows = [];
		    for (const field of card.fields) {
		      if (!rowVisible(field, options)) continue;
		      rows.push(renderFieldRow(ReactImpl2, field, options));
		      if (typeof options.renderExtraRow === "function") {
		        const extra = options.renderExtraRow(field);
		        if (extra != null) rows.push(extra);
		      }
		    }
		    if (rows.length === 0) continue;
		    const children = [
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-card-head", key: "head-" + card.section },
		        h(ReactImpl2, "h3", { className: "qqc-card-title" }, ...richText(ReactImpl2, card.section, options.highlight))
		      ),
		      rows
		    ];
		    for (const note of notes) {
		      if (note.mode !== "foot" || note.section !== card.section) continue;
		      children.push(h(ReactImpl2, "div", { className: "qqc-card-foot", key: "foot-" + note.section }, note.text));
		    }
		    cards.push(h(ReactImpl2, "section", {
		      className: "qqc-card",
		      "data-section": card.section,
		      key: card.section
		    }, children));
		  }
		  for (const note of notes) {
		    if (note.mode !== "card") continue;
		    cards.push(h(
		      ReactImpl2,
		      "section",
		      {
		        className: "qqc-card",
		        "data-section": note.section,
		        key: "note-" + note.section
		      },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-card-head" },
		        h(ReactImpl2, "h3", { className: "qqc-card-title" }, note.section),
		        h(ReactImpl2, "p", { className: "qqc-card-desc" }, note.text)
		      )
		    ));
		  }
		  if (cards.length === 0) return [];
		  return cards;
		}
		function renderSearchResults(ReactImpl2, matches, opts) {
		  const options = opts == null ? {} : opts;
		  const t = typeof options.t === "function" ? options.t : fallbackTranslate;
		  const groups = [];
		  const buckets = {};
		  for (const match of matches) {
		    if (buckets[match.groupId] === void 0) {
		      buckets[match.groupId] = [];
		      groups.push(match.groupId);
		    }
		    buckets[match.groupId].push(match);
		  }
		  const onOpenGroup = typeof options.onOpenGroup === "function" ? options.onOpenGroup : () => {
		  };
		  return groups.map((groupId) => {
		    const bucket = buckets[groupId];
		    return h(
		      ReactImpl2,
		      "section",
		      { className: "qqc-result-group", key: groupId, "data-group": groupId },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-result-head" },
		        h(ReactImpl2, "button", {
		          className: "qqc-link",
		          type: "button",
		          onClick: () => {
		            onOpenGroup(groupId);
		          }
		        }, ...richText(ReactImpl2, bucket[0].groupTitle, options.highlight)),
		        h(ReactImpl2, "span", null, format(t("search.count"), { n: bucket.length }))
		      ),
		      bucket.map((match) => renderFieldRow(ReactImpl2, match.field, options))
		    );
		  });
		}
		function renderWorkspacePicker(ReactImpl2, opts) {
		  const options = opts == null ? {} : opts;
		  const t = typeof options.t === "function" ? options.t : fallbackTranslate;
		  if (options.loaded !== true) return null;
		  const workspaces = Array.isArray(options.workspaces) ? options.workspaces : [];
		  if (options.available !== true || workspaces.length === 0) {
		    return h(
		      ReactImpl2,
		      "p",
		      { className: "qqc-hint", "data-role": "workspace-picker-empty" },
		      options.available === true ? t("workspace.empty") : t("workspace.unavailable")
		    );
		  }
		  const selectedId = typeof options.selectedId === "string" ? options.selectedId : "";
		  let selected = null;
		  for (const workspace of workspaces) {
		    if (workspace != null && String(workspace.id) === selectedId) selected = workspace;
		  }
		  const disabled = options.disabled === true;
		  return h(
		    ReactImpl2,
		    "div",
		    {
		      className: "qqc-row qqc-row--stack",
		      "data-role": "workspace-picker",
		      key: "workspace-picker"
		    },
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-row-meta" },
		      h(ReactImpl2, "p", { className: "qqc-label" }, t("workspace.title"))
		    ),
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-control" },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-control-line" },
		        h(
		          ReactImpl2,
		          "select",
		          {
		            className: "qqc-select",
		            value: selectedId,
		            disabled,
		            "aria-label": t("workspace.title"),
		            onChange: (event) => {
		              const onSelectedChange = options.onSelectedChange;
		              if (typeof onSelectedChange === "function") onSelectedChange(event.target.value);
		            }
		          },
		          h(ReactImpl2, "option", { key: "", value: "" }, t("workspace.choose")),
		          workspaces.map((workspace) => {
		            const label = String(workspace.path == null ? "" : workspace.path) + "（" + String(workspace.sessionCount == null ? 0 : workspace.sessionCount) + " 会话）";
		            return h(ReactImpl2, "option", { key: String(workspace.id), value: String(workspace.id) }, label);
		          })
		        ),
		        h(ReactImpl2, "button", {
		          className: "qqc-btn",
		          type: "button",
		          disabled: disabled || selected == null,
		          onClick: () => {
		            const onApply = options.onApply;
		            if (selected != null && typeof onApply === "function") onApply(selected.path);
		          }
		        }, t("workspace.fill"))
		      ),
		      h(ReactImpl2, "p", { className: "qqc-hint" }, t("workspace.note"))
		    )
		  );
		}

		// src/client/view.ts
		function withStrong(template, n) {
		  const marker = "{n}";
		  const index = template.indexOf(marker);
		  if (index < 0) return [template];
		  return [
		    template.slice(0, index),
		    h(React, "strong", { key: "count" }, String(n)),
		    template.slice(index + marker.length)
		  ];
		}
		function renderNav(props, dirtyKeys) {
		  const t = props.t;
		  const onPageChange = typeof props.onPageChange === "function" ? props.onPageChange : () => {
		  };
		  const onQueryChange = typeof props.onQueryChange === "function" ? props.onQueryChange : () => {
		  };
		  const onChangedOnlyChange = typeof props.onChangedOnlyChange === "function" ? props.onChangedOnlyChange : () => {
		  };
		  const countOf = (groupId) => {
		    const group = GROUPS.find((item) => item.id === groupId);
		    if (group == null) return 0;
		    let count = 0;
		    for (const field of group.fields) if (dirtyKeys.indexOf(field.key) >= 0) count += 1;
		    return count;
		  };
		  return h(
		    React,
		    "aside",
		    { className: "qqc-nav" },
		    h(
		      React,
		      "div",
		      { className: "qqc-nav-tools" },
		      h(React, "input", {
		        className: "qqc-search",
		        type: "search",
		        value: props.query,
		        placeholder: t("search.placeholder"),
		        "aria-label": t("search.placeholder"),
		        onChange: (event) => {
		          onQueryChange(event.target.value);
		        }
		      }),
		      h(
		        React,
		        "label",
		        { className: "qqc-filter" },
		        h(React, "input", {
		          type: "checkbox",
		          checked: props.changedOnly === true,
		          onChange: (event) => {
		            onChangedOnlyChange(event.target.checked);
		          }
		        }),
		        t("filter.changed")
		      )
		    ),
		    h(React, "div", {
		      className: "qqc-nav-list",
		      role: "list",
		      onKeyDown: (event) => {
		        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		        const list = event.currentTarget;
		        if (list == null || typeof list.querySelectorAll !== "function") return;
		        const items = Array.prototype.slice.call(list.querySelectorAll(".qqc-nav-item"));
		        if (items.length === 0) return;
		        let index = -1;
		        for (let i = 0; i < items.length; i += 1) {
		          if (items[i] === event.target) index = i;
		        }
		        if (index < 0) index = 0;
		        event.preventDefault();
		        const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
		        items[next].focus();
		      }
		    }, GROUPS.map((group) => {
		      const count = countOf(group.id);
		      return h(
		        React,
		        "button",
		        {
		          className: "qqc-nav-item",
		          type: "button",
		          key: group.id,
		          "data-page": group.id,
		          "aria-current": props.page === group.id ? "page" : void 0,
		          onClick: () => {
		            onPageChange(group.id);
		          }
		        },
		        h(React, "span", { className: "qqc-nav-label" }, group.title),
		        count > 0 ? h(React, "span", { className: "qqc-count" }, String(count)) : null
		      );
		    }))
		  );
		}
		function renderHeader(props) {
		  const t = props.t;
		  const botQQ = props.botQQ == null ? "" : String(props.botQQ);
		  return h(
		    React,
		    "header",
		    { className: "qqc-header" },
		    h(
		      React,
		      "div",
		      { className: "qqc-header-text" },
		      h(React, "h2", { className: "qqc-title" }, t("settings.title")),
		      h(React, "p", { className: "qqc-subtitle" }, t("settings.desc"))
		    ),
		    botQQ === "" ? null : h(
		      React,
		      "span",
		      { className: "qqc-conn" },
		      h(React, "span", { className: "qqc-dot", "data-state": "idle", "aria-hidden": "true" }),
		      format(t("conn.qq"), { qq: botQQ })
		    )
		  );
		}
		function banner(tone, key, title, text, actions) {
		  return h(
		    React,
		    "div",
		    { className: "qqc-banner", "data-tone": tone, key },
		    h(
		      React,
		      "div",
		      { className: "qqc-banner-body" },
		      title == null ? null : h(React, "p", { className: "qqc-banner-title" }, title),
		      text == null ? null : h(React, "p", { className: "qqc-banner-text" }, text)
		    ),
		    actions.length === 0 ? null : h(React, "div", { className: "qqc-banner-actions" }, actions)
		  );
		}
		function renderSkeletons() {
		  return h(
		    React,
		    "div",
		    { className: "qqc-main" },
		    [120, 88, 152].map((height) => h(React, "div", {
		      className: "qqc-skeleton",
		      key: "skeleton-" + height,
		      style: { height: height + "px" }
		    }))
		  );
		}
		function renderSavebar(props, changeCount) {
		  if (changeCount === 0) return null;
		  const t = props.t;
		  const busy = props.busy === true;
		  const onSave = typeof props.onSave === "function" ? props.onSave : () => {
		  };
		  const onRevert = typeof props.onRevert === "function" ? props.onRevert : () => {
		  };
		  return h(
		    React,
		    "div",
		    { className: "qqc-savebar", "data-role": "savebar", key: "savebar" },
		    h(React, "div", { className: "qqc-savebar-text" }, ...withStrong(t("save.summary"), changeCount)),
		    h(React, "button", {
		      className: "qqc-btn",
		      type: "button",
		      "data-variant": "ghost",
		      disabled: busy,
		      onClick: () => {
		        onRevert();
		      }
		    }, t("save.revert")),
		    h(React, "button", {
		      className: "qqc-btn",
		      type: "button",
		      "data-variant": "primary",
		      disabled: busy,
		      onClick: () => {
		        onSave();
		      }
		    }, busy ? t("save.saving") : t("save.submit"))
		  );
		}
		function changeKeys(draft, config, clearSecret) {
		  const computed = computePatch(draft == null ? {} : draft, config == null ? {} : config, {
		    secretDraft: draft == null ? "" : String(draft.accessToken == null ? "" : draft.accessToken),
		    clearSecret: clearSecret === true
		  });
		  const keys = Object.keys(computed.patch);
		  for (const key of computed.invalidKeys) if (keys.indexOf(key) < 0) keys.push(key);
		  return keys;
		}
		function fieldOptions(props, extra) {
		  return {
		    draft: props.draft,
		    config: props.config,
		    defaults: DEFAULTS,
		    t: props.t,
		    disabled: props.busy === true,
		    secretSet: props.secretSet,
		    clearSecret: props.clearSecret,
		    tagInputs: props.tagInputs,
		    highlight: props.highlight,
		    onlyChanged: props.changedOnly === true,
		    onChange: props.onChange,
		    onSecretChange: props.onSecretChange,
		    onClearSecretChange: props.onClearSecretChange,
		    onResetField: props.onResetField,
		    onTagInput: props.onTagInput,
		    onTagCommit: props.onTagCommit,
		    onTagRemove: props.onTagRemove,
		    onTagBackspace: props.onTagBackspace,
		    renderExtraRow: props.renderExtraRow,
		    ...extra
		  };
		}
		function SettingsView(props) {
		  const t = props.t;
		  const draft = props.draft == null ? {} : props.draft;
		  const config = props.config == null ? {} : props.config;
		  const dirtyKeys = props.loading === true ? [] : changeKeys(draft, config, props.clearSecret);
		  const onlyChanged = props.changedOnly === true;
		  const query = props.query == null ? "" : props.query;
		  const searching = query.trim() !== "";
		  const banners = [];
		  if (props.error != null && props.error !== "") {
		    banners.push(banner("error", "banner-error", t("load.error"), props.error, [
		      h(React, "button", {
		        className: "qqc-btn qqc-btn--sm",
		        type: "button",
		        key: "retry",
		        onClick: () => {
		          if (typeof props.onRetry === "function") props.onRetry();
		        }
		      }, t("load.retry"))
		    ]));
		  }
		  if (props.notice != null && props.notice !== "") {
		    banners.push(banner("success", "banner-success", null, props.notice, []));
		  }
		  if (props.entryActive === false) {
		    banners.push(banner("warn", "banner-inactive", null, t("entry.inactive"), []));
		  }
		  let content;
		  if (props.loading === true) {
		    content = renderSkeletons();
		  } else if (searching) {
		    const matches = searchFields(query);
		    if (matches.length === 0) {
		      content = h(
		        React,
		        "div",
		        { className: "qqc-main" },
		        h(React, "div", { className: "qqc-empty" }, format(t("search.empty"), { q: query.trim() }))
		      );
		    } else {
		      const resultGroups = renderSearchResults(React, matches, Object.assign(
		        fieldOptions(props, { highlight: query, onlyChanged: false }),
		        { onOpenGroup: (groupId) => {
		          if (typeof props.onPageChange === "function") props.onPageChange(groupId);
		        } }
		      ));
		      content = h(
		        React,
		        "div",
		        { className: "qqc-main" },
		        [h(React, "p", { className: "qqc-page-title", key: "search-title" }, t("search.results")), resultGroups]
		      );
		    }
		  } else {
		    const group = GROUPS.find((item) => item.id === props.page) != null ? GROUPS[GROUPS.findIndex((item) => item.id === props.page)] : GROUPS[0];
		    const cards = renderGroup(React, group, fieldOptions(props, {}));
		    const mainChildren = [
		      h(
		        React,
		        "div",
		        { className: "qqc-page-head", key: "page-head" },
		        h(
		          React,
		          "div",
		          { className: "qqc-page-head-text" },
		          h(React, "h3", { className: "qqc-page-title" }, group.title),
		          h(React, "p", { className: "qqc-page-desc" }, group.desc)
		        )
		      )
		    ];
		    if (cards.length === 0) {
		      mainChildren.push(h(React, "div", { className: "qqc-empty", key: "empty" }, t("filter.empty")));
		    } else {
		      mainChildren.push(cards);
		    }
		    mainChildren.push(renderSavebar(props, dirtyKeys.length));
		    content = h(React, "div", { className: "qqc-main" }, mainChildren);
		  }
		  return h(
		    React,
		    "div",
		    {
		      className: "qqc-root",
		      "data-embedded": props.embedded === true ? "true" : void 0,
		      "data-page": props.page
		    },
		    props.embedded === true ? null : renderHeader(props),
		    // §6.2 没有给横幅容器定义规则：这里只用内联排布（等间距 8px）把多条横幅叠起来。
		    banners.length === 0 ? null : h(React, "div", { className: "qqc-banners", style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" } }, banners),
		    h(React, "div", { className: "qqc-body" }, renderNav(props, dirtyKeys), content)
		  );
		}

		// src/client/panel.ts
		function fallbackT(key) {
		  return zh[key] != null ? zh[key] : key;
		}
		function OnebotSettingsPanel(props) {
		  const t = typeof props.t === "function" ? props.t : fallbackT;
		  const remote = props.remote;
		  const embedded = props.embedded === true;
		  const [snapshot, setSnapshot] = React.useState(null);
		  const [draft, setDraft] = React.useState(null);
		  const [secretDraft, setSecretDraft] = React.useState("");
		  const [clearSecret, setClearSecret] = React.useState(false);
		  const [busy, setBusy] = React.useState(false);
		  const [error, setError] = React.useState(null);
		  const [notice, setNotice] = React.useState("");
		  const [page, setPage] = React.useState("connection");
		  const [query, setQuery] = React.useState("");
		  const [changedOnly, setChangedOnly] = React.useState(false);
		  const [tagInputs, setTagInputs] = React.useState({});
		  const [workspace, setWorkspace] = React.useState({ loaded: false, available: false, workspaces: [], selectedId: "" });
		  const accept = (next) => {
		    setSnapshot(next);
		    setDraft(draftFromSnapshot(next));
		    setTagInputs({});
		  };
		  React.useEffect(() => {
		    let alive = true;
		    void remote.getSettings().then((result) => {
		      if (!alive) return;
		      accept(unwrap(result));
		      setError(null);
		    }).catch((cause) => {
		      if (alive) setError(messageOf(cause));
		    });
		    void Promise.resolve().then(() => remote.listWorkspaces()).then((result) => {
		      if (!alive) return;
		      const value = unwrap(result);
		      setWorkspace({
		        loaded: true,
		        available: value != null && value.available === true,
		        workspaces: value != null && Array.isArray(value.workspaces) ? value.workspaces : [],
		        selectedId: ""
		      });
		    }).catch(() => {
		      if (alive) setWorkspace({ loaded: true, available: false, workspaces: [], selectedId: "" });
		    });
		    return () => {
		      alive = false;
		    };
		  }, [remote]);
		  React.useEffect(() => {
		    if (notice === "") return;
		    const timer = setTimeout(() => {
		      setNotice("");
		    }, 3e3);
		    return () => {
		      clearTimeout(timer);
		    };
		  }, [notice]);
		  const refetch = () => {
		    void remote.getSettings().then((result) => {
		      accept(unwrap(result));
		      setError(null);
		      setNotice("");
		    }).catch((cause) => {
		      setError(messageOf(cause));
		    });
		  };
		  const save = () => {
		    if (busy || snapshot == null || draft == null) return;
		    setError(null);
		    setNotice("");
		    const computed = computePatch(draft, snapshot.config, { secretDraft, clearSecret });
		    if (computed.invalidKeys.length > 0) {
		      const labels = computed.invalidKeys.map((key) => {
		        const field = ALL_FIELDS.find((item) => item.key === key);
		        return field != null ? field.label : key;
		      });
		      setError(format(t("save.badNumber"), { keys: labels.join("、") }));
		      return;
		    }
		    if (Object.keys(computed.patch).length === 0) {
		      setNotice(t("save.noChanges"));
		      return;
		    }
		    setBusy(true);
		    void Promise.resolve().then(() => remote.updateSettings(computed.patch, snapshot.revision)).then((result) => {
		      accept(unwrap(result));
		      setNotice(t("save.done"));
		      setClearSecret(false);
		      setSecretDraft("");
		    }).catch((cause) => {
		      if (isConflictError(cause)) setError(t("conflict.title"));
		      else setError(messageOf(cause));
		    }).finally(() => {
		      setBusy(false);
		    });
		  };
		  const revert = () => {
		    if (snapshot == null) return;
		    setDraft(draftFromSnapshot(snapshot));
		    setSecretDraft("");
		    setClearSecret(false);
		    setTagInputs({});
		    setError(null);
		    setNotice("");
		  };
		  const resetField = (field) => {
		    if (draft == null) return;
		    setDraft(Object.assign({}, draft, { [field.key]: snapshotValueToDraft(field, DEFAULTS[field.key]) }));
		  };
		  const commitTags = (field, text) => {
		    if (draft == null) return;
		    setDraft(Object.assign({}, draft, { [field.key]: appendTags(tagsOf(draft[field.key]), text) }));
		    setTagInputs(Object.assign({}, tagInputs, { [field.key]: "" }));
		  };
		  const backspaceTags = (field) => {
		    if (draft == null) return;
		    const current = tagsOf(draft[field.key]);
		    if (current.length === 0) return;
		    setDraft(Object.assign({}, draft, { [field.key]: removeTagAt(current, current.length - 1) }));
		  };
		  let secretSet = false;
		  if (snapshot != null && Array.isArray(snapshot.secrets)) {
		    for (const secretEntry of snapshot.secrets) {
		      if (secretEntry != null && Array.isArray(secretEntry.path) && secretEntry.path.indexOf("accessToken") >= 0 && secretEntry.set === true) secretSet = true;
		    }
		  }
		  const config = snapshot == null ? null : snapshot.config;
		  const botQQ = config == null || config.botQQ == null ? "" : String(config.botQQ);
		  return React.createElement(SettingsView, {
		    t,
		    embedded,
		    loading: draft == null,
		    error,
		    notice: notice === "" ? null : notice,
		    entryActive: snapshot == null ? true : snapshot.entryActive === true,
		    page,
		    query,
		    changedOnly,
		    draft,
		    config,
		    botQQ,
		    secretSet,
		    clearSecret,
		    tagInputs,
		    workspace,
		    busy,
		    onPageChange: (next) => {
		      setPage(next);
		    },
		    onQueryChange: (next) => {
		      setQuery(next);
		    },
		    onChangedOnlyChange: (next) => {
		      setChangedOnly(next);
		    },
		    onRetry: () => {
		      refetch();
		    },
		    onSave: () => {
		      save();
		    },
		    onRevert: () => {
		      revert();
		    },
		    onChange: (field, next) => {
		      if (draft == null) return;
		      setDraft(Object.assign({}, draft, { [field.key]: next }));
		    },
		    onSecretChange: (nextText) => {
		      setSecretDraft(nextText);
		      if (draft == null) return;
		      setDraft(Object.assign({}, draft, { accessToken: nextText }));
		    },
		    onClearSecretChange: (next) => {
		      setClearSecret(next);
		    },
		    onResetField: (field) => {
		      resetField(field);
		    },
		    onTagInput: (field, text) => {
		      setTagInputs(Object.assign({}, tagInputs, { [field.key]: text }));
		    },
		    onTagCommit: (field, text) => {
		      commitTags(field, text);
		    },
		    onTagRemove: (field, index) => {
		      if (draft == null) return;
		      setDraft(Object.assign({}, draft, { [field.key]: removeTagAt(tagsOf(draft[field.key]), index) }));
		    },
		    onTagBackspace: (field) => {
		      backspaceTags(field);
		    },
		    renderExtraRow: (field) => {
		      if (field.key !== "workspacePath") return null;
		      return renderWorkspacePicker(React, {
		        loaded: workspace.loaded,
		        available: workspace.available,
		        workspaces: workspace.workspaces,
		        selectedId: workspace.selectedId,
		        disabled: busy,
		        t,
		        onSelectedChange: (nextId) => {
		          setWorkspace(Object.assign({}, workspace, { selectedId: nextId }));
		        },
		        onApply: (path) => {
		          setDraft(fillWorkspacePath(draft, path));
		        }
		      });
		    }
		  });
		}

		// src/client/index.ts
		var inject = ["slots", "locale", "remote"];
		function fallbackTranslate2(key) {
		  return zh[key] != null ? zh[key] : key;
		}
		function panelRender(remote, embedded) {
		  return (props) => {
		    const hostProps = props == null ? {} : props;
		    const t = typeof hostProps.t === "function" ? hostProps.t : fallbackTranslate2;
		    if (hostProps.view === "summary") {
		      return React.createElement(
		        "span",
		        { className: "qqc-summary" },
		        t("settings.desc")
		      );
		    }
		    return React.createElement(
		      OnebotSettingsPanel,
		      Object.assign({}, hostProps, { remote, embedded, t })
		    );
		  };
		}
		async function apply(ctx) {
		  ctx.effect(() => {
		    const tag = document.createElement("style");
		    tag.dataset.plugin = PLUGIN_ID;
		    tag.textContent = CSS;
		    document.head.appendChild(tag);
		    return () => {
		      tag.remove();
		    };
		  }, "onebot-settings: style");
		  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "onebot-settings: dictionaries");
		  const t = ctx.locale.bind(NS);
		  const disposeRemote = await ctx.remote.$mount(ONEBOT_SETTINGS_REMOTE);
		  const remote = ctx.get("remote." + REMOTE_NS);
		  if (remote === void 0) throw new Error("onebot-settings Remote 挂载后不可用");
		  ctx.slots.inject("settings.section", () => ctx.slots.register(
		    // label 是 thunk：nav 行每次渲染读取，locale 切换后自动跟随。
		    { name: "settings.section", id: SLOT_ID, order: SLOT_ORDER, label: () => t("settings.nav"), locale: NS, icon: "settings" },
		    (props) => {
		      const hostProps = props == null ? {} : props;
		      return React.createElement(
		        OnebotSettingsPanel,
		        Object.assign({}, hostProps, { remote })
		      );
		    }
		  ));
		  ctx.slots.inject(SECOND_ENTRY_SLOT, () => ctx.slots.register(
		    { name: SECOND_ENTRY_SLOT, key: SECOND_ENTRY_KEY },
		    panelRender(remote, true)
		  ));
		  return () => {
		    void disposeRemote();
		  };
		}

		return module.exports;
	}
});
