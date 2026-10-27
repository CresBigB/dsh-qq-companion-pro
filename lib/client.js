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
		  CAPABILITIES_PAGE_ID: () => CAPABILITIES_PAGE_ID,
		  CSS: () => CSS,
		  DEFAULTS: () => DEFAULTS,
		  GROUPS: () => GROUPS,
		  GROUP_KEYS: () => GROUP_KEYS,
		  ONEBOT_SETTINGS_DESCRIPTORS: () => ONEBOT_SETTINGS_DESCRIPTORS,
		  ONEBOT_SETTINGS_REMOTE: () => ONEBOT_SETTINGS_REMOTE,
		  OVERVIEW_MISSING: () => OVERVIEW_MISSING,
		  OVERVIEW_PAGE_ID: () => OVERVIEW_PAGE_ID,
		  OnebotSettingsPanel: () => OnebotSettingsPanel,
		  SECOND_ENTRY_KEY: () => SECOND_ENTRY_KEY,
		  SECOND_ENTRY_SLOT: () => SECOND_ENTRY_SLOT,
		  SLOT_ID: () => SLOT_ID,
		  SLOT_ORDER: () => SLOT_ORDER,
		  SettingsView: () => SettingsView,
		  appendTags: () => appendTags,
		  apply: () => apply,
		  capabilityDependencyNotes: () => capabilityDependencyNotes,
		  capabilityRowChanged: () => capabilityRowChanged,
		  changeKeys: () => changeKeys,
		  coerceValue: () => coerceValue,
		  collectRisks: () => collectRisks,
		  computePatch: () => computePatch,
		  configSchema: () => configSchema,
		  draftFromDefaults: () => draftFromDefaults,
		  draftFromSnapshot: () => draftFromSnapshot,
		  en: () => en,
		  fieldControlId: () => fieldControlId,
		  fieldErrorId: () => fieldErrorId,
		  fieldHintId: () => fieldHintId,
		  fillWorkspacePath: () => fillWorkspacePath,
		  formatDefaultValue: () => formatDefaultValue,
		  formatSize: () => formatSize,
		  formatSizePair: () => formatSizePair,
		  groupCards: () => groupCards,
		  groupCounts: () => groupCounts,
		  groupMatches: () => groupMatches,
		  highlightSegments: () => highlightSegments,
		  inject: () => inject,
		  isConflictError: () => isConflictError,
		  matchField: () => matchField,
		  matchingCapabilities: () => matchingCapabilities,
		  meterPercent: () => meterPercent,
		  meterTone: () => meterTone,
		  normalizeQuery: () => normalizeQuery,
		  parseTagInput: () => parseTagInput,
		  patchSchema: () => patchSchema,
		  removeTagAt: () => removeTagAt,
		  renderCapabilityMatrix: () => renderCapabilityMatrix,
		  renderFieldRow: () => renderFieldRow,
		  renderGroup: () => renderGroup,
		  renderOverview: () => renderOverview,
		  renderRiskDialog: () => renderRiskDialog,
		  renderScheduledList: () => renderScheduledList,
		  renderSearchResults: () => renderSearchResults,
		  renderWorkspacePicker: () => renderWorkspacePicker,
		  riskFieldKeys: () => riskFieldKeys,
		  searchFields: () => searchFields,
		  snapshotValueToDraft: () => snapshotValueToDraft,
		  statusResultSchema: () => statusResultSchema,
		  tagsOf: () => tagsOf,
		  unitConversion: () => unitConversion,
		  unitLabel: () => unitLabel,
		  unitText: () => unitText,
		  unwrap: () => unwrap,
		  validateDraft: () => validateDraft,
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
		  "/* 冲突横幅里的「我的修改」清单（§5.6） */",
		  ".qqc-conflict{display:flex;flex-direction:column;gap:6px;margin-top:8px}",
		  ".qqc-change-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		  '.qqc-change-value{overflow:hidden;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:11px;text-overflow:ellipsis;white-space:nowrap}',
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
		  "/* 功能权限：纵向矩阵 */",
		  ".qqc-cap-head,.qqc-cap-row{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,76px);gap:8px;align-items:center;padding:12px 16px}",
		  ".qqc-cap-head{color:var(--dsw-alias-label-secondary);font-size:11px;text-align:center}",
		  ".qqc-cap-head>span:first-child{text-align:left}",
		  ".qqc-cap-row{border-top:1px solid var(--dsw-alias-border-l1)}",
		  ".qqc-cap-row[data-dirty]{box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}",
		  ".qqc-cap-meta{min-width:0;overflow-wrap:anywhere}",
		  ".qqc-cap-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-weight:600}",
		  ".qqc-cap-tools{display:flex;flex-direction:column;gap:1px;margin-top:2px;color:var(--dsw-alias-label-secondary)}",
		  '.qqc-cap-tools code{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-size:11px;overflow-wrap:anywhere}',
		  ".qqc-cap-desc,.qqc-cap-notes p{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}",
		  ".qqc-cap-row[data-needs-config] .qqc-cap-title,.qqc-cap-row[data-needs-config] .qqc-cap-tools{color:var(--dsw-alias-label-secondary)}",
		  ".qqc-cap-check{display:flex;align-items:center;justify-content:center;gap:6px;min-width:32px;min-height:32px;cursor:pointer}",
		  ".qqc-cap-check input{width:18px;height:18px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}",
		  ".qqc-cap-check input:disabled{opacity:.5;cursor:not-allowed}",
		  ".qqc-cap-check input:focus-visible,.qqc-cap-advanced>summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}",
		  ".qqc-cap-scope{display:none}",
		  ".qqc-cap-upgrade{padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12px}",
		  ".qqc-cap-advanced{min-width:0}",
		  ".qqc-cap-advanced>summary{width:fit-content;max-width:100%;padding:8px 0;cursor:pointer;color:var(--dsw-alias-label-secondary)}",
		  ".qqc-cap-advanced>.qqc-card{margin-top:8px}",
		  "@container qqc (max-width:640px){",
		  "  .qqc-cap-head{display:none}",
		  "  .qqc-cap-row{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
		  "  .qqc-cap-meta{grid-column:1/-1}",
		  "  .qqc-cap-check{flex-wrap:wrap;align-content:center;min-width:0;font-size:11px}",
		  "  .qqc-cap-scope{display:inline;overflow-wrap:anywhere}",
		  "}",
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
		  "badge.risk": "有风险",
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
		  // §4.11 保存条
		  "save.summary": "已修改 {n} 项",
		  "save.invalid": "有 {n} 项填写有误",
		  "save.groupCount": "{title} {n}",
		  "save.revert": "还原",
		  "save.submit": "保存",
		  "save.saving": "正在保存…",
		  "save.done": "已保存，插件正在原地重启…",
		  "save.noChanges": "没有需要保存的变更。",
		  "save.badNumber": "数字字段不合法：{keys}",
		  "load.error": "加载设置失败",
		  "load.retry": "重试",
		  "entry.inactive": "QQ 插件条目当前未激活，保存后可能不会生效",
		  // §5.4 校验
		  "validate.number": "请输入数字",
		  "validate.min": "不能小于 {min}",
		  "validate.max": "不能大于 {max}",
		  "validate.port": "端口范围 1–65535",
		  "validate.time": "请用 HH:MM 格式，例如 09:30",
		  "validate.time24": "请用 HH:MM 格式，可以写 24:00",
		  "validate.window": "结束时间要晚于开始时间",
		  "validate.proactiveMinMax": "最少次数不能多于最多次数",
		  "validate.typingDelay": "最短不能长于最长",
		  // §4.12 / §5.5 危险确认
		  "risk.title": "这些改动有风险",
		  "risk.text": "确认后才会保存。",
		  "risk.cancel": "取消",
		  "risk.confirm": "仍然保存",
		  "risk.dmOpenAll": "任何人都能私聊她，并拿到她默认的宿主权限（可能是完整权限）",
		  "risk.groupOpen": "她会响应所有拉她进去的群",
		  "risk.restrictedPrefixOff": "非管理员消息不再带关系绸标，提示词里与主人无差别",
		  "risk.adminPermissionFull": "主人私聊的新会话将拥有完整宿主权限且不再询问",
		  "risk.memberPermissionEmpty": "非管理员私聊与群聊的新会话不再切到收窄的权限预设，会继承宿主默认权限",
		  "risk.memberPermissionFull": "非管理员私聊与群聊的新会话将拥有完整宿主权限",
		  "risk.tokenClear": "清空后 NapCat 连接不再校验令牌",
		  "risk.hostPort": "NapCat 侧必须同步修改，否则会断开连接",
		  "risk.mediaDir": "状态文件会换到新目录，旧的会话映射不会自动迁移",
		  "risk.privateHosts": "下载时不再拦截内网地址",
		  "risk.ignoreSelfOff": "她可能回复自己的消息形成循环",
		  // §5.6 保存冲突
		  "conflict.title": "这期间配置在别处被改过",
		  "conflict.text": "你的修改还在，重新加载会丢弃它们。",
		  "conflict.reload": "重新加载（会丢弃未保存的修改）",
		  "conflict.showMine": "查看我的修改",
		  "conflict.hideMine": "收起我的修改",
		  "conflict.secretValue": "已修改",
		  "conflict.emptyValue": "空",
		  // §2 页头连接胶囊（F3 起用真实状态：ok=已连接且在线 / warn=已连接但 QQ 离线 /
		  // error=未连接 / idle=未知）
		  "conn.online": "已连接",
		  "conn.offline": "QQ 离线",
		  "conn.disconnected": "未连接",
		  "conn.unknown": "QQ 状态未知",
		  "conn.withId": "{state} · {id}",
		  // §4.14 概览子页（F3）
		  "overview.title": "概览",
		  "overview.desc": "她现在怎么样：连接、会话、今天的发送量、表情包与记忆用量",
		  "overview.refresh": "刷新",
		  "overview.off": "未开启",
		  "overview.goEnable": "去开启",
		  "overview.online": "在线",
		  "overview.offlineNow": "离线",
		  "overview.unknown": "未知",
		  "overview.unavailable": "QQ 主插件未运行，暂时看不到状态",
		  "overview.errorTitle": "状态读取失败",
		  "overview.connection": "连接",
		  "overview.sessions": "会话",
		  "overview.today": "今天",
		  "overview.proactive": "主动聊天",
		  "overview.stickers": "表情包",
		  "overview.scheduled": "定时任务",
		  "overview.memory": "记忆用量",
		  "overview.sessionsCard": "会话",
		  "overview.sessionCounts": "私聊 {dm} · 群 {group}",
		  "overview.sentUnit": "条已发送",
		  "overview.passToday": "今天 {n} 条不回",
		  "overview.checkins": "{done} / {planned} 次",
		  "overview.nextAt": "下一次 {time}",
		  "overview.stickerLibrary": "{n} / {max} 张",
		  "overview.stickerToday": "今天新存 {n} / {max}",
		  "overview.scheduledCount": "{n} 个",
		  "overview.doneToday": "今天已执行",
		  "overview.pendingToday": "今天待执行",
		  "overview.attached": "已归入工作区",
		  "overview.notAttached": "未归入工作区",
		  "overview.attachHint": "可在该聊天发 /workspace attach",
		  "overview.noMemory": "还没有记忆文件",
		  "overview.noScheduled": "没有定时任务",
		  "overview.noSessions": "还没有会话",
		  "overview.capabilities": "功能",
		  "overview.capabilitiesCount": "已开 {on} / 共 {total}",
		  "overview.capabilitiesByRelation": "主人 {owner} / 好友 {friend} / 群友 {groupMember} / 陌生人 {stranger}",
		  "overview.capabilitiesAllOn": "全部开启",
		  "overview.capabilitiesHint": "在「功能权限」里按管理员私聊、私聊和群组分别管理",
		  "overview.manageCapabilities": "管理功能权限",
		  "risk.capabilityGrant": "这些改动会放开功能权限，可能暴露社交关系或允许写操作；工具的执行守卫仍会生效",
		  "capabilities.title": "功能权限",
		  "capabilities.desc": "选择模型在各类会话中可使用的功能；保存后生效",
		  "capabilities.function": "功能与工具",
		  "capabilities.scope.owner": "管理员私聊",
		  "capabilities.scope.private": "非管理员私聊",
		  "capabilities.scope.group": "群组",
		  "capabilities.scopeNote": "管理员列只管管理员私聊，默认全开。私聊列合并好友与陌生人；群组列统一控制全体成员，包括管理员在群中发言。",
		  "capabilities.guardNote": "勾选仅表示配置许可，不保证执行。只群聊、只私聊、仅管理员回合等工具限制与执行守卫不会被勾选绕过；缺少依赖时可先预授权。",
		  "capabilities.globalNote": "开启被全局禁止的功能时，会把全局禁止转为独立列规则，其它列保持关闭。",
		  "capabilities.mixedNote": "好友与陌生人的旧设置不同（部分开启）。不点击会保留原配置；点击后统一两类非管理员私聊。",
		  "capabilities.needsConfig": "需要配置",
		  "capabilities.dep.stickerLib": "需要先在「媒体与语音」配置表情包目录。",
		  "capabilities.dep.memoryNote": "需要先在「记忆」配置每群记忆目录或公开记忆文件。",
		  "capabilities.dep.tts": "需要先开启语音合成，并按所选引擎配置模型或命令。",
		  "capabilities.dep.ttsRuntime": "此处只检查配置；仍需引擎可用，保存后的实际可用性以运行状态为准。",
		  "capabilities.empty": "没有符合当前搜索或改动筛选的功能",
		  "capabilities.advanced": "高级：按关系精细设置",
		  "capabilities.advancedNote": "保留旧的好友、陌生人及全局规则；通常直接使用上方复选框即可。",
		  "capabilities.restartRequired": "新增功能需完整重启 DSH 加载后端。当前后端尚不支持管理员独立开关，功能权限暂不可编辑；其它设置仍可使用。",
		  "overview.protocolOn": "输出协议：开启",
		  "overview.protocolOff": "输出协议：关闭",
		  "overview.protocolStat": "今天 {replies} 次回复里 {parsed} 次带控制块（成功率 {rate}）"
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
		  "badge.risk": "Risky",
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
		  "save.invalid": "{n} fields need fixing",
		  "save.groupCount": "{title} {n}",
		  "save.revert": "Revert",
		  "save.submit": "Save",
		  "save.saving": "Saving…",
		  "save.done": "Saved. The plugin is restarting…",
		  "save.noChanges": "Nothing to save.",
		  "save.badNumber": "Invalid number fields: {keys}",
		  "load.error": "Couldn't load settings",
		  "load.retry": "Retry",
		  "entry.inactive": "The QQ plugin entry is inactive; saving may have no effect",
		  "validate.number": "Enter a number",
		  "validate.min": "Must be at least {min}",
		  "validate.max": "Must be at most {max}",
		  "validate.port": "Port must be 1–65535",
		  "validate.time": "Use HH:MM format, e.g. 09:30",
		  "validate.time24": "Use HH:MM format; 24:00 is allowed",
		  "validate.window": "The end time must be later than the start time",
		  "validate.proactiveMinMax": "The minimum can't exceed the maximum",
		  "validate.typingDelay": "The shortest can't be longer than the longest",
		  "risk.title": "These changes are risky",
		  "risk.text": "Nothing is saved until you confirm.",
		  "risk.cancel": "Cancel",
		  "risk.confirm": "Save anyway",
		  "risk.dmOpenAll": "Anyone can DM her and gets her default host permission (possibly full access)",
		  "risk.groupOpen": "She will answer in every group she is pulled into",
		  "risk.restrictedPrefixOff": "Non-owner messages lose the relation banner and are indistinguishable from the owner",
		  "risk.adminPermissionFull": "New owner DMs get full host permission without asking again",
		  "risk.memberPermissionEmpty": "Non-owner DMs and groups stop switching to a narrowed preset and inherit the host default permission",
		  "risk.memberPermissionFull": "New non-owner DMs and group sessions get full host permission",
		  "risk.tokenClear": "NapCat connections will no longer verify the token",
		  "risk.hostPort": "NapCat must be changed to match, otherwise the connection drops",
		  "risk.mediaDir": "State files move to the new directory; existing session mappings are not migrated",
		  "risk.privateHosts": "Downloads from internal addresses are no longer blocked",
		  "risk.ignoreSelfOff": "She may answer her own messages and loop",
		  "conflict.title": "Settings changed elsewhere",
		  "conflict.text": "Your edits are kept; reloading discards them.",
		  "conflict.reload": "Reload (discards unsaved edits)",
		  "conflict.showMine": "Show my edits",
		  "conflict.hideMine": "Hide my edits",
		  "conflict.secretValue": "Edited",
		  "conflict.emptyValue": "Empty",
		  "conn.online": "Connected",
		  "conn.offline": "QQ offline",
		  "conn.disconnected": "Not connected",
		  "conn.unknown": "QQ status unknown",
		  "conn.withId": "{state} · {id}",
		  "overview.title": "Overview",
		  "overview.desc": "How she is right now: connection, chats, today's messages, stickers and memory usage",
		  "overview.refresh": "Refresh",
		  "overview.off": "Off",
		  "overview.goEnable": "Enable",
		  "overview.online": "Online",
		  "overview.offlineNow": "Offline",
		  "overview.unknown": "Unknown",
		  "overview.unavailable": "The QQ plugin isn't running, so its status is unavailable",
		  "overview.errorTitle": "Couldn't read the status",
		  "overview.connection": "Connection",
		  "overview.sessions": "Chats",
		  "overview.today": "Today",
		  "overview.proactive": "Proactive",
		  "overview.stickers": "Stickers",
		  "overview.scheduled": "Scheduled",
		  "overview.memory": "Memory usage",
		  "overview.sessionsCard": "Chats",
		  "overview.sessionCounts": "DMs {dm} · groups {group}",
		  "overview.sentUnit": "sent today",
		  "overview.passToday": "{n} left unanswered today",
		  "overview.checkins": "{done} / {planned}",
		  "overview.nextAt": "Next {time}",
		  "overview.stickerLibrary": "{n} / {max}",
		  "overview.stickerToday": "{n} / {max} saved today",
		  "overview.scheduledCount": "{n}",
		  "overview.doneToday": "Done today",
		  "overview.pendingToday": "Pending today",
		  "overview.attached": "In a workspace",
		  "overview.notAttached": "Not in a workspace",
		  "overview.attachHint": "Send /workspace attach in that chat",
		  "overview.noMemory": "No memory file yet",
		  "overview.noScheduled": "No scheduled task",
		  "overview.noSessions": "No chat yet",
		  "overview.capabilities": "Features",
		  "overview.capabilitiesCount": "{on} of {total} on",
		  "overview.capabilitiesByRelation": "owner {owner} / friend {friend} / member {groupMember} / stranger {stranger}",
		  "overview.capabilitiesAllOn": "All on",
		  "overview.capabilitiesHint": "Manage administrator DMs, other DMs and groups under Feature permissions",
		  "overview.manageCapabilities": "Manage feature permissions",
		  "risk.capabilityGrant": "These changes expand feature permissions and may expose social data or allow write operations; execution guards still apply",
		  "capabilities.title": "Feature permissions",
		  "capabilities.desc": "Choose which features the model may use in each conversation type; save to apply",
		  "capabilities.function": "Feature and tools",
		  "capabilities.scope.owner": "Administrator DM",
		  "capabilities.scope.private": "Other DMs",
		  "capabilities.scope.group": "Groups",
		  "capabilities.scopeNote": "The administrator column applies only to administrator DMs and defaults to all on. Other DMs combines friends and strangers. Groups applies to every member, including administrators speaking in a group.",
		  "capabilities.guardNote": "A check grants configuration permission, not guaranteed execution. Group-only, DM-only and administrator-turn restrictions and execution guards still apply. You may pre-authorize features before configuring dependencies.",
		  "capabilities.globalNote": "Enabling a globally denied feature converts the global denial into independent column rules, keeping the other columns off.",
		  "capabilities.mixedNote": "Friends and strangers have different existing settings (partly enabled). Leave untouched to preserve them; clicking unifies both types of non-administrator DMs.",
		  "capabilities.needsConfig": "Needs configuration",
		  "capabilities.dep.stickerLib": "Configure a sticker directory under Media & Voice first.",
		  "capabilities.dep.memoryNote": "Configure a per-group memory directory or public memory file under Memory first.",
		  "capabilities.dep.tts": "Enable speech synthesis and configure the selected engine model or command first.",
		  "capabilities.dep.ttsRuntime": "Only configuration is checked here; the engine must still be available. Runtime status determines actual availability after saving.",
		  "capabilities.empty": "No features match the current search or changes filter",
		  "capabilities.advanced": "Advanced: fine-grained relation settings",
		  "capabilities.advancedNote": "Existing friend, stranger and global rules are preserved. Usually the checkboxes above are enough.",
		  "capabilities.restartRequired": "Fully restart DSH to load the new backend. This backend does not support independent administrator switches yet; feature permissions are read-only, but other settings remain available.",
		  "overview.protocolOn": "Output protocol: on",
		  "overview.protocolOff": "Output protocol: off",
		  "overview.protocolStat": "{parsed} of {replies} replies carried a control block today ({rate})"
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
		  // capabilities（9，顺序与宿主 SETTINGS_GROUPS 对齐）
		  capabilitiesDeny: vArray(vString(0, 64)),
		  ownerDeny: vOptional(vArray(vString(0, 64))),
		  friendDeny: vArray(vString(0, 64)),
		  memberDeny: vArray(vString(0, 64)),
		  strangerDeny: vArray(vString(0, 64)),
		  ownerGrant: vArray(vString(0, 64)),
		  friendGrant: vArray(vString(0, 64)),
		  memberGrant: vArray(vString(0, 64)),
		  strangerGrant: vArray(vString(0, 64)),
		  // connection（6）
		  host: vString(0, 256),
		  port: vNumber(1, 65535),
		  accessToken: vString(0, 256),
		  botQQ: vString(0, 64),
		  workspacePath: vString(0, 1024),
		  attachWorkspaceMode: vEnum(["existing", "auto", "off"]),
		  // access（15）
		  adminUsers: vArray(vString(0, 64)),
		  friendUsers: vArray(vString(0, 64)),
		  memberObedience: vNumber(0, 1),
		  friendObedience: vNumber(0, 1),
		  friendIntimacy: vNumber(0, 1),
		  dmPolicy: vEnum(["open", "allowlist", "disabled"]),
		  allowFrom: vArray(vString(0, 64)),
		  allowAllUsers: vBoolean(),
		  groupPolicy: vEnum(["open", "allowlist", "disabled"]),
		  groupAllowFrom: vArray(vString(0, 64)),
		  requireMention: vBoolean(),
		  groupTriggerPolicy: vOptional(vString(0, 8192)),
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
		  // conversation（19）
		  newMessagePolicy: vEnum(["queue", "steer"]),
		  autoSteerPolicy: vEnum(["admin", "all"]),
		  deferredTimeoutMs: vNumber(0),
		  taskEveryRounds: vNumber(1),
		  unknownCommand: vEnum(["intercept", "passthrough"]),
		  rateLimitPerMinute: vNumber(0),
		  sideAskEnabled: vOptional(vBoolean()),
		  sideAskConcurrency: vOptional(vNumber(1, 8)),
		  sideAskMaxChars: vOptional(vNumber(1, 8e3)),
		  idleResetHours: vNumber(0),
		  privateResetDays: vNumber(0),
		  groupResetDays: vNumber(0),
		  sessionTitleTemplate: vString(0, 1024),
		  privateSessionKeepDays: vNumber(0),
		  groupSessionKeepDays: vNumber(0),
		  chatIdleEvictDays: vNumber(0),
		  protocolMode: vEnum(["off", "on"]),
		  protocolChats: vArray(vString(0, 1024)),
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
		  // media（28）
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
		  ttsEnabled: vBoolean(),
		  ttsEngine: vEnum(["sherpa-onnx", "command"]),
		  ttsModel: vString(0, 1024),
		  ttsCommand: vString(0, 1024),
		  ttsArgs: vArray(vString(0, 1024)),
		  ttsVoice: vString(0, 1024),
		  ttsMaxChars: vNumber(0),
		  ttsTimeoutMs: vNumber(0),
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
		  // 131 键统一插件级热重启
		});
		var patchSchema = vObject(
		  Object.fromEntries(Object.entries(CONFIG_SHAPE).map(([key, schema]) => [key, vOptional(schema)]))
		);
		var workspaceListSchema = vObject({
		  available: vBoolean(),
		  workspaces: vArray(vObject({ id: vString(1, 256), path: vString(0, 1024), sessionCount: vInt(0) }))
		});
		var statusSnapshotSchema = vObject({
		  connection: vOptional(vObject({
		    connected: vOptional(vBoolean()),
		    online: vOptional(vBoolean()),
		    selfId: vOptional(vString(0, 128)),
		    botQQ: vOptional(vString(0, 128)),
		    host: vOptional(vString(0, 256)),
		    port: vOptional(vNumber(0))
		  })),
		  sessions: vOptional(vObject({
		    private: vOptional(vNumber(0)),
		    group: vOptional(vNumber(0)),
		    list: vOptional(vArray(vObject({
		      chatId: vOptional(vString(0, 256)),
		      sessionId: vOptional(vString(0, 256)),
		      title: vOptional(vString(0, 1024)),
		      workspaceAttached: vOptional(vBoolean())
		    })))
		  })),
		  today: vOptional(vObject({ sent: vOptional(vNumber(0)), passCount: vOptional(vNumber(0)) })),
		  proactive: vOptional(vObject({
		    enabled: vOptional(vBoolean()),
		    doneToday: vOptional(vNumber(0)),
		    plannedToday: vOptional(vNumber(0)),
		    nextAt: vOptional(vString(0, 32))
		  })),
		  stickers: vOptional(vObject({
		    enabled: vOptional(vBoolean()),
		    count: vOptional(vNumber(0)),
		    maxCount: vOptional(vNumber(0)),
		    today: vOptional(vNumber(0)),
		    dailyMax: vOptional(vNumber(0))
		  })),
		  memory: vOptional(vArray(vObject({
		    label: vOptional(vString(0, 256)),
		    path: vOptional(vString(0, 1024)),
		    bytes: vOptional(vNumber(0)),
		    maxBytes: vOptional(vNumber(0))
		  }))),
		  scheduled: vOptional(vArray(vObject({
		    id: vOptional(vString(0, 256)),
		    time: vOptional(vString(0, 32)),
		    chatId: vOptional(vString(0, 256)),
		    doneToday: vOptional(vBoolean()),
		    nextAt: vOptional(vString(0, 32))
		  }))),
		  permissions: vOptional(vObject({
		    admin: vOptional(vString(0, 256)),
		    member: vOptional(vString(0, 256))
		  })),
		  capabilities: vOptional(vObject({
		    enabled: vOptional(vNumber(0)),
		    total: vOptional(vNumber(0)),
		    disabled: vOptional(vArray(vObject({
		      id: vOptional(vString(0, 256)),
		      title: vOptional(vString(0, 256)),
		      reason: vOptional(vString(0, 1024))
		    }))),
		    byRelation: vOptional(vObject({
		      owner: vOptional(vNumber(0)),
		      friend: vOptional(vNumber(0)),
		      groupMember: vOptional(vNumber(0)),
		      stranger: vOptional(vNumber(0))
		    }))
		  })),
		  protocol: vOptional(vObject({
		    enabled: vOptional(vBoolean()),
		    chats: vOptional(vArray(vString(0, 256))),
		    repliesToday: vOptional(vNumber(0)),
		    parsedToday: vOptional(vNumber(0)),
		    failedToday: vOptional(vNumber(0))
		  })),
		  generatedAt: vOptional(vNumber(0))
		});
		var statusResultSchema = vObject({
		  available: vBoolean(),
		  status: vOptional(statusSnapshotSchema),
		  error: vOptional(vString(0, 4096))
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
		  onebotMethod("listWorkspaces", [], workspaceListSchema, "WorkspaceListResult"),
		  onebotMethod("getStatus", [], statusResultSchema, "CompanionStatusResult")
		];
		var ONEBOT_SETTINGS_REMOTE = { package: PLUGIN_ID, descriptors: ONEBOT_SETTINGS_DESCRIPTORS };

		// src/capabilities.ts
		var CAPABILITIES = [
		  {
		    id: "qq.send.image",
		    title: "发图片",
		    tools: ["qq_send_image"],
		    describe: "向 QQ 会话发送本地文件或链接图片（一次最多 9 张）。",
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.send.voice",
		    title: "发语音",
		    tools: ["qq_send_voice"],
		    describe: "向 QQ 会话发送一条本地音频文件作为语音。",
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.voice.tts",
		    title: "语音念出来",
		    tools: ["qq_send_tts"],
		    describe: "把一句短话用语音念出来，发在当前会话里（音色与引擎由主人配置；引擎不可用时这个工具不会出现）。",
		    deps: ["tts"],
		    memberDefault: false,
		    groupDefault: false
		  },
		  {
		    id: "qq.send.video",
		    title: "发视频",
		    tools: ["qq_send_video"],
		    describe: "向 QQ 会话发送一条本地视频文件。",
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.send.file",
		    title: "发文件",
		    tools: ["qq_send_file"],
		    describe: "向 QQ 会话发送一个本地文件。",
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.send.forward",
		    title: "合并转发",
		    tools: ["qq_send_forward"],
		    describe: "以合并转发形式向 QQ 会话发送多条消息节点。",
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.napcat.api",
		    title: "NapCat 接口",
		    tools: ["qq_napcat_api"],
		    describe: "调用 NapCat 白名单内的 OneBot 扩展接口（群成员、文件、OCR 等）。",
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.group.history",
		    title: "群历史消息",
		    tools: ["qq_group_history"],
		    describe: "拉取当前群最近的消息历史作为上下文。",
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.message.open",
		    title: "打开消息",
		    tools: ["qq_open_message"],
		    describe: "打开当前会话里的某条消息，取回其中的图片、语音转写、聊天记录与文件。",
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.memory.note",
		    title: "群记忆笔记",
		    tools: ["qq_memory_note"],
		    describe: "往当前群的记忆文件追加一行值得记住的小事。",
		    deps: ["memoryNote"],
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.sticker.use",
		    title: "表情包（存 / 搜 / 发）",
		    tools: ["qq_sticker_save", "qq_sticker_search", "qq_sticker_send"],
		    describe: "收藏聊天里的图片、按情绪找表情包并把表情包发到当前会话。",
		    deps: ["stickerLib"],
		    memberDefault: true,
		    groupDefault: true
		  },
		  {
		    id: "qq.sticker.manage",
		    title: "表情包整理（改 / 删）",
		    tools: ["qq_sticker_edit", "qq_sticker_delete"],
		    describe: "改表情包的标签、描述，或把表情包删掉（只在和主人私聊时能改能删，群里做不了）。",
		    deps: ["stickerLib"],
		    memberDefault: true,
		    groupDefault: true
		  },
		  // ---- T12 · 隐私类查询（默认关：群友一句「列一下你的好友」就能把主人的社交关系发到群里）
		  {
		    id: "qq.list.groups",
		    title: "群列表 / 群资料",
		    tools: ["qq_list_groups", "qq_group_info"],
		    describe: "列出自己所在的群、查某个群的资料（成员数、群主、公告摘要）。这是主人账号的群关系，属于隐私数据：默认只在主人私聊里可用，需要时由主人按关系显式授权。",
		    memberDefault: false,
		    groupDefault: false
		  },
		  {
		    id: "qq.list.friends",
		    title: "好友列表",
		    tools: ["qq_list_friends"],
		    describe: "列出自己 QQ 上的好友（QQ 号、昵称、备注）。这是主人的社交关系，属于隐私数据：默认只在主人私聊里可用，需要时由主人按关系显式授权。",
		    memberDefault: false,
		    groupDefault: false
		  },
		  {
		    id: "qq.history.private",
		    title: "私聊历史",
		    tools: ["qq_private_history"],
		    describe: "拉取自己与某个好友的私聊历史（只取文本与发送者）。这是主人账号的私聊记录，属于隐私数据：默认只在主人私聊里可用，工具本身也只在管理员私聊里放行。",
		    memberDefault: false,
		    groupDefault: false
		  },
		  // ---- T13 · 群管理写操作（会真的改变群状态；默认关，且只由主人本人发起的回合执行）
		  {
		    id: "qq.group.manage",
		    title: "群管理（禁言/群名片）",
		    tools: ["qq_group_ban", "qq_group_card"],
		    describe: "写操作，会真的改变群状态：禁言或解除禁言（某个成员或全体）、改群成员的群名片。默认关闭；即使按关系开启，也只有主人本人发起的这一回合能真的执行，群里其他人要求一律拒绝。",
		    memberDefault: false,
		    groupDefault: false
		  },
		  {
		    id: "qq.group.notice",
		    title: "群公告与精华",
		    tools: ["qq_group_announce", "qq_group_essence"],
		    describe: "写操作，会真的改变群状态：发布或修改群公告（群里所有人都能看到）、把一条消息设为精华或取消精华。默认关闭；即使按关系开启，也只有主人本人发起的这一回合能真的执行。",
		    memberDefault: false,
		    groupDefault: false
		  },
		  // ---- 轻互动：管理员私聊默认授权，非主人默认仅开放表情回应。
		  // 戳与点赞仍受执行体中的会话绑定与回合主人守卫约束。
		  {
		    id: "qq.interact.react",
		    title: "表情回应",
		    tools: ["qq_emoji_react"],
		    describe: "给当前聊天里的一条消息贴一个 QQ 表情回应（不动消息本身、不发言）。",
		    memberDefault: true,
		    groupDefault: true,
		    ownerDefault: true
		  },
		  {
		    id: "qq.interact.poke",
		    title: "戳一戳",
		    tools: ["qq_poke"],
		    describe: "戳一戳当前聊天里的人：私聊里只能戳正在和她说这个话的那个人，群里只能戳这个群的成员（参数里没有聊天 id，做不到跨聊天）。默认关闭（非管理员私聊与群聊默认关闭，管理员私聊默认授权）；即使按关系开启，也只有主人本人发起的这一回合能真的戳。",
		    memberDefault: false,
		    groupDefault: false
		  },
		  {
		    id: "qq.interact.like",
		    title: "点赞",
		    tools: ["qq_send_like"],
		    describe: "给正在私聊的对方点名片赞（一次 1-10 个，只能点当前私聊的对方；群聊里没有唯一目标所以不可用）。默认关闭（非管理员私聊与群聊默认关闭，管理员私聊默认授权）；即使按关系开启，也只有主人本人发起的这一回合能真的点。",
		    memberDefault: false,
		    groupDefault: false
		  }
		];
		var ALL_CAPABILITY_IDS = CAPABILITIES.map((capability) => capability.id);
		function findCapability(id) {
		  return CAPABILITIES.find((capability) => capability.id === id);
		}
		function capabilityCatalogText() {
		  return "可用能力 id：" + CAPABILITIES.map((capability) => capability.id + "（" + capability.title + "）").join("、");
		}
		function defaultOffCapabilityTitles() {
		  return CAPABILITIES.filter((capability) => !capability.memberDefault || !capability.groupDefault || capability.ownerDefault === false).map((capability) => capability.title);
		}
		function defaultOffNoteText() {
		  return "默认关闭的是" + defaultOffCapabilityTitles().join("、") + "（即使按关系开了，其中会真的改动外部状态的也只有主人本人发起的回合能真的执行）";
		}
		var DEPENDENCY_REASON = {
		  stickerLib: "表情包库未开启（stickerDir 为空）",
		  memoryNote: "没有可写的记忆文件（publicMemoryFile 与 groupMemoryDir 都没配）",
		  tts: "语音合成没开，或引擎用不了（ttsEnabled 为 false、ttsCommand 为空、找不到该程序，或 sherpa-onnx 与 VITS 模型没装好）"
		};
		var GRANT_REASONS = {
		  ownerGrant: "主人 grant（ownerGrant）已开放",
		  friendGrant: "好友 grant（friendGrant）已开放",
		  memberGrant: "群聊 grant（memberGrant）已开放",
		  strangerGrant: "陌生人 grant（strangerGrant）已开放"
		};
		var RELATION_DENY_REASONS = {
		  ownerDeny: "主人关系 deny（ownerDeny）已关闭",
		  friendDeny: "好友关系 deny（friendDeny）已关闭",
		  memberDeny: "群聊关系 deny（memberDeny）已关闭",
		  strangerDeny: "陌生人关系 deny（strangerDeny）已关闭"
		};
		function chatRelationOf(chat) {
		  if (chat.relation !== void 0) return chat.relation;
		  if (chat.adminPrivate === true) return "owner";
		  return chat.kind === "group" ? "groupMember" : "stranger";
		}
		function chatViewOf(relation) {
		  return relation === "groupMember" ? { kind: "group", relation } : { kind: "private", relation };
		}
		function relationSlotKey(chat, relation, keys) {
		  if (chat.kind === "group") return keys.groupMember;
		  if (relation === "owner") return keys.owner ?? null;
		  if (relation === "friend") return keys.friend;
		  if (relation === "stranger") return keys.stranger;
		  return null;
		}
		function grantKeyOf(chat, relation) {
		  return relationSlotKey(chat, relation, {
		    owner: "ownerGrant",
		    friend: "friendGrant",
		    groupMember: "memberGrant",
		    stranger: "strangerGrant"
		  });
		}
		function denyKeyOf(chat, relation) {
		  return relationSlotKey(chat, relation, { owner: "ownerDeny", friend: "friendDeny", groupMember: "memberDeny", stranger: "strangerDeny" });
		}
		function idSet(ids) {
		  const out = /* @__PURE__ */ new Set();
		  for (const raw of ids ?? []) {
		    const id = typeof raw === "string" ? raw.trim() : "";
		    if (id !== "") out.add(id);
		  }
		  return out;
		}
		function decideCapability(input) {
		  const { capability, deny, available, relationDeny, grant, chat, relation } = input;
		  if (deny.has(capability.id)) return { open: false, reason: "已在 capabilitiesDeny 里关闭" };
		  const missing = (capability.deps ?? []).find((dep) => !available.has(dep));
		  if (missing !== void 0) return { open: false, reason: DEPENDENCY_REASON[missing] };
		  if (relationDeny !== void 0 && relationDeny !== null && relationDeny.ids.has(capability.id)) {
		    return { open: false, reason: RELATION_DENY_REASONS[relationDeny.key] };
		  }
		  if (grant !== null && grant.ids.has(capability.id)) return { open: true, reason: GRANT_REASONS[grant.key] };
		  if (chat.kind === "group") {
		    return capability.groupDefault ? { open: true, reason: "群聊默认开启" } : { open: false, reason: "群聊默认关闭" };
		  }
		  if (relation === "owner") {
		    return capability.ownerDefault ?? true ? { open: true, reason: "管理员私聊默认开启" } : { open: false, reason: "管理员私聊默认关闭" };
		  }
		  return capability.memberDefault ? { open: true, reason: "非管理员私聊默认开启" } : { open: false, reason: "非管理员私聊默认关闭" };
		}
		function resolveCapabilities(input) {
		  const deny = idSet(input.config.capabilitiesDeny);
		  const available = new Set(input.deps);
		  const { chat } = input;
		  const relation = chatRelationOf(chat);
		  const denyKey = denyKeyOf(chat, relation);
		  const relationDeny = denyKey === null ? null : { key: denyKey, ids: idSet(input.config[denyKey]) };
		  const grantKey = grantKeyOf(chat, relation);
		  const grant = grantKey === null ? null : { key: grantKey, ids: idSet(input.config[grantKey]) };
		  const enabled = /* @__PURE__ */ new Set();
		  const reasons = /* @__PURE__ */ new Map();
		  for (const capability of CAPABILITIES) {
		    const decision = decideCapability({ capability, deny, available, relationDeny, grant, chat, relation });
		    if (decision.open) enabled.add(capability.id);
		    reasons.set(capability.id, decision.reason);
		  }
		  const tools = [];
		  for (const capability of CAPABILITIES) {
		    if (!enabled.has(capability.id)) continue;
		    tools.push(...capability.tools);
		  }
		  return {
		    enabled,
		    tools,
		    why(id) {
		      return reasons.get(id) ?? "未知能力 id";
		    }
		  };
		}

		// src/capability-matrix.ts
		var MATRIX_KEYS = ["capabilitiesDeny", "ownerDeny", "friendDeny", "memberDeny", "strangerDeny", "ownerGrant", "friendGrant", "memberGrant", "strangerGrant"];
		var SCOPE_RELATIONS = {
		  owner: ["owner"],
		  private: ["friend", "stranger"],
		  group: ["groupMember"]
		};
		var RELATION_KEYS = {
		  owner: { deny: "ownerDeny", grant: "ownerGrant" },
		  friend: { deny: "friendDeny", grant: "friendGrant" },
		  groupMember: { deny: "memberDeny", grant: "memberGrant" },
		  stranger: { deny: "strangerDeny", grant: "strangerGrant" }
		};
		var ALL_DEPS = [...new Set(CAPABILITIES.flatMap((capability) => capability.deps ?? []))];
		function list(config, key) {
		  const value = config[key];
		  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
		}
		function getMatrixState(config, id, scope) {
		  if (findCapability(id) === void 0 || !Object.hasOwn(SCOPE_RELATIONS, scope)) return "off";
		  const permissionConfig = Object.fromEntries(MATRIX_KEYS.map((key) => [key, list(config, key)]));
		  const states = SCOPE_RELATIONS[scope].map((relation) => resolveCapabilities({ config: permissionConfig, deps: ALL_DEPS, chat: chatViewOf(relation) }).enabled.has(id));
		  return states.every(Boolean) ? "on" : states.some(Boolean) ? "mixed" : "off";
		}
		function setMatrixState(config, id, scope, enabled) {
		  const capability = findCapability(id);
		  if (capability === void 0 || !Object.hasOwn(SCOPE_RELATIONS, scope)) return {};
		  const patch = {};
		  const current = (key) => patch[key] ?? list(config, key);
		  const contains = (values) => values.some((value) => value.trim() === id);
		  const update = (key, add) => {
		    const values = current(key);
		    const next = add ? contains(values) ? values : [...values, id] : values.filter((value) => value.trim() !== id);
		    const original = list(config, key);
		    if (next.length === original.length && next.every((value, index) => value === original[index])) delete patch[key];
		    else patch[key] = next;
		  };
		  const selected = SCOPE_RELATIONS[scope];
		  if (enabled && contains(current("capabilitiesDeny"))) {
		    update("capabilitiesDeny", false);
		    for (const relation of Object.keys(RELATION_KEYS)) {
		      if (!selected.includes(relation)) update(RELATION_KEYS[relation].deny, true);
		    }
		  }
		  for (const relation of selected) {
		    const keys = RELATION_KEYS[relation];
		    update(keys.deny, !enabled);
		    const defaultOpen = relation === "owner" ? capability.ownerDefault ?? true : relation === "groupMember" ? capability.groupDefault : capability.memberDefault;
		    if (!enabled) update(keys.grant, false);
		    else if (!defaultOpen) update(keys.grant, true);
		  }
		  return patch;
		}

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
		    id: "capabilities",
		    title: "功能权限",
		    desc: "按管理员私聊、非管理员私聊和群组分别选择功能；工具执行限制仍然生效",
		    fields: [
		      { key: "capabilitiesDeny", label: "全局禁止的功能", type: "stringArray", hint: "所有关系均禁止，优先于 grant。" + capabilityCatalogText(), section: "按关系精细设置" },
		      { key: "ownerDeny", label: "不给管理员私聊用的功能", type: "stringArray", hint: "只影响管理员私聊，群里管理员发言仍按群组规则。", section: "按关系精细设置" },
		      { key: "friendDeny", label: "不给好友用的功能", type: "stringArray", hint: "只影响好友名单中的非管理员私聊。", section: "按关系精细设置" },
		      { key: "memberDeny", label: "不给群聊用的功能", type: "stringArray", hint: "影响群组全体，包括管理员在群里发言。", section: "按关系精细设置" },
		      { key: "strangerDeny", label: "不给陌生人用的功能", type: "stringArray", hint: "只影响不在好友名单中的非管理员私聊。", section: "按关系精细设置" },
		      { key: "ownerGrant", label: "给管理员私聊加开的功能", type: "stringArray", hint: "管理员默认全开；此项保留兼容旧的精细配置，不绕过执行守卫。", section: "按关系精细设置" },
		      { key: "friendGrant", label: "给好友加开的功能", type: "stringArray", hint: "仅为默认关闭的能力加开好友私聊许可。" + defaultOffNoteText(), section: "按关系精细设置" },
		      { key: "memberGrant", label: "给群聊加开的功能", type: "stringArray", hint: "仅为默认关闭的能力加开群组许可；不绕过执行守卫。" + defaultOffNoteText(), section: "按关系精细设置" },
		      { key: "strangerGrant", label: "给陌生人加开的功能", type: "stringArray", hint: "仅为默认关闭的能力加开陌生人私聊许可。" + defaultOffNoteText(), section: "按关系精细设置" }
		    ]
		  },
		  {
		    id: "connection",
		    title: "连接",
		    desc: "NapCat 怎么连到这个插件，QQ 会话默认放在哪个工作区",
		    fields: [
		      // §5.5：改 host / port 必须同步改 NapCat 侧，否则断连；清空令牌 = 不再校验（§4.6）。
		      { key: "host", label: "监听地址", type: "string", hint: "NapCat 反向 WebSocket 连接的地址，一般保持 127.0.0.1。", section: "NapCat 连接", danger: () => "risk.hostPort" },
		      { key: "port", label: "监听端口", type: "number", hint: "NapCat 反向 WebSocket 连接的端口。", section: "NapCat 连接", min: 1, max: 65535, danger: () => "risk.hostPort" },
		      { key: "accessToken", label: "访问令牌（AccessToken）", type: "secret", hint: "与 NapCat 侧一致的鉴权令牌；留空 = 不修改，点「清空」后保存 = 清空。首次部署必须填写：还没有令牌时插件停在「等待配置」（连接胶囊显示「未连接」，不监听端口），填好保存后会自动按新配置重启。", section: "NapCat 连接", danger: () => "risk.tokenClear" },
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
		      { key: "adminUsers", label: "管理员（主人）QQ", type: "stringArray", hint: "每行一个 QQ 号。", section: "关系" },
		      { key: "friendUsers", label: "好友名单 QQ", type: "stringArray", hint: "每行一个 QQ 号：比群友亲近，但不等同于主人。", section: "关系" },
		      { key: "memberObedience", label: "群友 / 陌生人的服从度", type: "number", hint: "0 = 完全不听，1 = 基本都听。只管“要求要不要照做、拒绝时怎么解释”，不管听不听话；不管多少都不许骂人。", section: "关系", min: 0, max: 1 },
		      { key: "friendObedience", label: "好友的服从度", type: "number", hint: "0 = 完全不听，1 = 基本都听。只管“要求要不要照做、拒绝时怎么解释”，不管听不听话。", section: "关系", min: 0, max: 1 },
		      { key: "friendIntimacy", label: "好友的亲密度", type: "number", hint: "影响称呼与语气亲近程度，0.6 = 比群友亲近但不越界。", section: "关系", min: 0, max: 1 },
		      { key: "dmPolicy", label: "私聊策略", type: "enum", options: ["open", "allowlist", "disabled"], optionLabels: { open: '仅管理员（开了"允许所有用户"则所有人）', allowlist: "白名单", disabled: "不接私聊" }, hint: "open = 仅管理员；allowlist = 仅私聊白名单；disabled = 拒绝所有私聊。", section: "私聊", danger: (next, prev, draft) => next === "open" && draftBool(draft, "allowAllUsers") ? "risk.dmOpenAll" : null },
		      { key: "allowFrom", label: "私聊白名单", type: "stringArray", hint: "每行一个 QQ 号，仅白名单策略生效。", section: "私聊", dependsOnText: "仅在私聊策略为白名单时生效", dependsOn: (draft) => draftText(draft, "dmPolicy") === "allowlist" },
		      // §5.5 的跨字段最终状态判断：与 dmPolicy 共用同一条风险（collectRisks 按说明去重）。
		      { key: "allowAllUsers", label: "允许所有用户", type: "boolean", hint: "开发用。打开后任何人都能私聊她。", section: "私聊", danger: (next, prev, draft) => next === true && draftText(draft, "dmPolicy") === "open" ? "risk.dmOpenAll" : null },
		      { key: "groupPolicy", label: "群聊策略", type: "enum", options: ["open", "allowlist", "disabled"], optionLabels: { open: "所有群", allowlist: "白名单", disabled: "不接群聊" }, hint: "open = 所有群；allowlist = 仅群聊白名单；disabled = 拒绝所有群聊。", section: "群聊", danger: (next) => next === "open" ? "risk.groupOpen" : null },
		      { key: "groupAllowFrom", label: "群聊白名单", type: "stringArray", hint: "每行一个群号，仅白名单策略生效。", section: "群聊", dependsOnText: "仅在群聊策略为白名单时生效", dependsOn: (draft) => draftText(draft, "groupPolicy") === "allowlist" },
		      { key: "requireMention", label: "群聊必须 @ 机器人", type: "boolean", section: "群聊" },
		      { key: "groupTriggerPolicy", label: "普通群消息触发策略", type: "string", hint: 'JSON 文本，例如 {"replyMode":"related","keywords":["项目"],"groups":{"643561596":{"replyMode":"probability","probability":0.3}}}。可用字段：mentionRequired（必须 @）、proactiveEnabled（没 @ 也主动）、replyMode=all/related/probability/off、probability 0–1、botName/botNames/aliases/keywords；groups 按群号、users 按 QQ 号覆盖，群规则里的 users 可再按人细分。只写 probability 不写 replyMode 时按概率模式生效；默认 {} 等于原来的 requireMention 行为；叫机器人名字或接着她说仍算直接触发；/命令不受该策略过滤（仍受 requireMention 限制）；JSON 写错时由后端自动降级。', section: "群聊", placeholder: "{}" },
		      { key: "restrictedMemberPrefix", label: "非管理员消息加关系绸标", type: "boolean", hint: "群里和非管理员私聊的消息前加一条关系绸标（如 [关系:群友｜语气中性｜服从0.2｜亲密0.2｜不可指挥]），写明关系 / 语气 / 服从度 / 亲密 / 能否指挥。关掉后提示词里群友和主人没有区别。", section: "群聊", danger: (next) => next === false ? "risk.restrictedPrefixOff" : null },
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
		      { key: "adminPermission", label: "管理员私聊权限预设", type: "string", hint: "管理员私聊每个新会话自动切到的宿主权限预设，例如 danger-full-access；留空 = 不切。", section: "预设与权限", danger: (next) => next === "danger-full-access" ? "risk.adminPermissionFull" : null },
		      // §3.3 追加的两种危险：改成空（不再收窄权限）或改成完整权限。
		      { key: "memberPermission", label: "其他会话的宿主权限", type: "string", hint: "非管理员私聊与所有群聊的新会话自动切换的权限预设，建议 read-only；留空 = 不切，会话继承宿主默认预设。", section: "预设与权限", danger: (next) => String(next == null ? "" : next).trim() === "" ? "risk.memberPermissionEmpty" : String(next).trim() === "danger-full-access" ? "risk.memberPermissionFull" : null },
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
		      { key: "newMessagePolicy", label: "任务运行中的新消息", type: "enum", options: ["queue", "steer"], optionLabels: { queue: "排队", steer: "插话" }, hint: "任务运行中收到新普通消息：排队=当前任务结束后按序处理（每回合至多提示一次）；插话=作为补充指令加入当前任务。图片/文件/语音/引用消息与带关系绸标的非管理员消息始终按排队处理。", section: "忙的时候" },
		      { key: "autoSteerPolicy", label: "自动插话资格", type: "enum", options: ["admin", "all"], optionLabels: { admin: "仅管理员", all: "所有成员" }, hint: "插话模式下运行中收到的新普通纯文字消息谁可自动插话：仅管理员（默认）或所有成员。不具备资格的消息按排队处理；/steer 命令始终仅管理员；带关系绸标的非管理员消息任何档都不自动插话。", section: "忙的时候", dependsOnText: "仅在「任务运行中的新消息」为插话时生效", dependsOn: (draft) => draftText(draft, "newMessagePolicy") === "steer" },
		      { key: "deferredTimeoutMs", label: "等待模型回复超时（毫秒）", type: "number", hint: "回合超过该时长无任何模型输出时提示超时并登记补发跟踪，任务完成后自动补发最终文字（超时补发）；发送失败最多重试 3 次，结果不确定时停止自动重试；/stop 终止该聊天的补发跟踪。0=关闭。", section: "忙的时候", unit: "ms", min: 0, zeroMeans: "关闭" },
		      { key: "taskEveryRounds", label: "长任务几轮回传一次", type: "number", hint: "管理员私聊用 /task <目标> 创建长任务后，自动轮次每 N 轮回传一次当轮最终文字（1=逐轮都回传，默认；N≥2=每 N 轮）。中途轮次只更新进度、不发消息；预算最后一轮与暂停/恢复/阻塞/完成通知始终照发。插件不汇总、不总结，回传的是当轮真实文字。", section: "长任务", unit: "count", min: 1 },
		      { key: "unknownCommand", label: "未知命令处理", type: "enum", options: ["intercept", "passthrough"], optionLabels: { intercept: "拦截", passthrough: "透传" }, hint: "未知斜杠命令：拦截 = 提示相近命令或 /help；透传 = 交给模型处理。", section: "命令与频控" },
		      { key: "rateLimitPerMinute", label: "每分钟消息频率上限", type: "number", hint: "每 chat 每分钟普通消息条数上限；命令消息不计入；0 = 不限。", section: "命令与频控", unit: "perMin", min: 0, zeroMeans: "不限" },
		      { key: "sideAskEnabled", label: "任务运行中自动旁问", type: "boolean", hint: "开启后，当前聊天正在跑任务时又发来的纯文字消息不再排队或插话，而是交给一个独立的旁问子代理（宿主 subagent，非 fork 副本）立刻回答；回答作为另一条消息发回，主任务完全不受影响，也不会复制会话历史。需要宿主提供 subagents（spawn）服务，未提供时运行端只记一条告警并保持原行为。旁问子级沿用当前 preset，因此提示词要求它只作答。带图片/文件/引用/转发的消息仍按排队处理。默认关闭。", section: "旁问" },
		      { key: "sideAskConcurrency", label: "旁问同时运行上限", type: "number", hint: "跨所有 QQ 聊天的旁问并发上限（1–8）；占满后新消息退回「任务运行中收到新消息」的排队/插话策略，不会报错。", section: "旁问", unit: "count", min: 1, max: 8, dependsOnText: "仅在旁问开启时生效", dependsOn: (draft) => draftBool(draft, "sideAskEnabled") },
		      { key: "sideAskMaxChars", label: "旁问消息最大字数", type: "number", hint: "超过这个字数的消息不进入旁问，按普通排队处理（1–8000）。", section: "旁问", unit: "char", min: 1, max: 8e3, dependsOnText: "仅在旁问开启时生效", dependsOn: (draft) => draftBool(draft, "sideAskEnabled") },
		      { key: "idleResetHours", label: "空闲多久换新会话（小时）", type: "number", hint: "超过这么久没说话，下一条消息开新会话并附最近几句交接；0 = 关。", section: "换新会话", unit: "h", min: 0, zeroMeans: "关闭" },
		      { key: "privateResetDays", label: "私聊几天换一次会话", type: "number", hint: "按凌晨 4 点算天；0 = 关。", section: "换新会话", unit: "day", min: 0, zeroMeans: "关闭" },
		      { key: "groupResetDays", label: "群聊几天换一次会话", type: "number", hint: "按凌晨 4 点算天；0 = 关。", section: "换新会话", unit: "day", min: 0, zeroMeans: "关闭" },
		      { key: "sessionTitleTemplate", label: "会话标题模板", type: "string", hint: "新建 QQ 会话（以及恢复时还没有标题的旧会话）的网页标题，可用 {kind} {target} {nickname} {date} {time}；已有标题（比如在网页上手动改过）的不会被覆盖，留空 = 不自动命名。", section: "换新会话" },
		      { key: "privateSessionKeepDays", label: "私聊旧会话保留", type: "number", hint: "换下来的私聊旧会话超过这么多天没写入就删除；0 = 永不删。正在用的会话不会删", section: "旧会话清理", unit: "day", min: 0, zeroMeans: "关闭" },
		      { key: "groupSessionKeepDays", label: "群聊旧会话保留", type: "number", hint: "同上，作用于群聊", section: "旧会话清理", unit: "day", min: 0, zeroMeans: "关闭" },
		      { key: "chatIdleEvictDays", label: "空闲会话释放", type: "number", hint: "超过这么多天没动静的聊天先释放内存（会话已落盘，下次来消息自动恢复）；0 = 不释放", section: "旧会话清理", unit: "day", min: 0, zeroMeans: "关闭" },
		      { key: "protocolMode", label: "输出协议", type: "enum", options: ["off", "on"], optionLabels: { off: "关闭", on: "开启" }, hint: "让模型可以在回复最后一行写【控制】{json} 精确控制是否回应、分几条发、引用哪条。默认关闭（关闭时完全不解析，行为与改造前一样）；开启前先看 /doctor 里的解析成功率，成功率低于 95% 别全局开。", section: "输出协议" },
		      { key: "protocolChats", label: "只在哪些聊天启用", type: "stringArray", hint: "private:QQ号 / group:群号，每行一个；留空 = 开启时对所有聊天生效。用于先灰度一个群。", section: "输出协议", placeholder: "group:643561596", dependsOnText: "仅在「输出协议」开启时生效", dependsOn: (draft) => draftText(draft, "protocolMode") === "on" }
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
		    desc: "表情包库、语音转写与语音合成、收发图片与文件的大小上限",
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
		      { key: "ttsEnabled", label: "她能念出话来（发语音）", type: "boolean", hint: "sherpa-onnx 完全在本机离线合成；自定义命令联不联网取决于你配的工具。程序或模型找不到时，她根本没有「把话念出来」这个工具", section: "语音合成" },
		      { key: "ttsEngine", label: "合成引擎", type: "enum", options: ["sherpa-onnx", "command"], optionLabels: { "sherpa-onnx": "sherpa-onnx（推荐）", command: "自定义命令" }, section: "语音合成", dependsOnText: "仅在「她能念出话来」打开时生效", dependsOn: (draft) => draftBool(draft, "ttsEnabled") },
		      { key: "ttsModel", label: "模型", type: "string", control: "path", hint: "sherpa-onnx 填 VITS 模型目录（tokens.txt + model.onnx；中文模型另带 lexicon.txt，会自动用上；dict/ 与 espeak-ng-data/ 不必准备）；留空去 ~/.cache/sherpa-onnx/tts 等默认位置找。模型下载与参数见 k2-fsa.github.io/sherpa/onnx/tts", section: "语音合成", dependsOnText: "仅在合成引擎为 sherpa-onnx 时生效", dependsOn: (draft) => draftBool(draft, "ttsEnabled") && draftText(draft, "ttsEngine") !== "command" },
		      { key: "ttsCommand", label: "自定义命令程序", type: "string", control: "path", section: "语音合成", dependsOnText: "仅在合成引擎为自定义命令时生效", dependsOn: (draft) => draftBool(draft, "ttsEnabled") && draftText(draft, "ttsEngine") === "command" },
		      { key: "ttsArgs", label: "自定义命令参数", type: "stringArray", hint: "每个一行，可用 {text}（要念的文字）{output}（写出的 wav）{model} {voice} {lang} 占位；留空 = {output} {text}", section: "语音合成", dependsOnText: "仅在合成引擎为自定义命令时生效", dependsOn: (draft) => draftBool(draft, "ttsEnabled") && draftText(draft, "ttsEngine") === "command" },
		      { key: "ttsVoice", label: "音色", type: "string", hint: "sherpa-onnx 填说话人编号（--sid，多说话人模型 0/1/2…，单说话人留空）；自定义命令填进 {voice}", section: "语音合成", dependsOnText: "仅在「她能念出话来」打开时生效", dependsOn: (draft) => draftBool(draft, "ttsEnabled") },
		      { key: "ttsMaxChars", label: "一条语音最多念多少字", type: "number", hint: "超过就直接报错让她精简，不会硬念（最长 1000）", section: "语音合成", unit: "count", min: 0, dependsOnText: "仅在「她能念出话来」打开时生效", dependsOn: (draft) => draftBool(draft, "ttsEnabled") },
		      { key: "ttsTimeoutMs", label: "单次合成超时", type: "number", section: "语音合成", unit: "ms", min: 0, dependsOnText: "仅在「她能念出话来」打开时生效", dependsOn: (draft) => draftBool(draft, "ttsEnabled") },
		      { key: "inboundImageMaxPx", label: "收到的图片压到多大（像素）", type: "number", hint: "长边超过就缩小再给模型看，省 token。", section: "图片与文件", unit: "px", min: 0 },
		      { key: "outboundImageMaxBytes", label: "发出图片上限", type: "number", section: "图片与文件", unit: "byte", min: 0 },
		      { key: "maxVoiceBytes", label: "发出语音上限", type: "number", section: "图片与文件", unit: "byte", min: 0 },
		      { key: "maxFileBytes", label: "发出视频/文件上限", type: "number", section: "图片与文件", unit: "byte", min: 0 },
		      { key: "inboundFileMaxBytes", label: "接收文件上限", type: "number", hint: "0 = 不限制", section: "图片与文件", unit: "byte", min: 0, zeroMeans: "不限" },
		      { key: "mediaDir", label: "媒体与状态目录", type: "string", control: "path", hint: "留空 = <DSH 目录>/media/onebot。改了之后会话映射等状态文件也换位置，旧文件不会自动搬", section: "存储与网络", danger: () => "risk.mediaDir" },
		      { key: "tempTtlHours", label: "临时媒体保留", type: "number", section: "存储与网络", unit: "h", min: 0 },
		      { key: "allowPrivateHosts", label: "允许从内网地址下载", type: "boolean", hint: "默认拒绝下载内网/本机地址（防 SSRF）；NapCat 文件服务在本机时才需要打开", section: "存储与网络", danger: (next) => next === true ? "risk.privateHosts" : null }
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
		      { key: "ignoreSelf", label: "忽略自己发出的消息", type: "boolean", hint: "防止她回复自己形成循环，一般不要关", section: "入站", danger: (next) => next === false ? "risk.ignoreSelfOff" : null },
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
		  friendUsers: [],
		  memberObedience: 0.2,
		  friendObedience: 0.5,
		  friendIntimacy: 0.6,
		  dmPolicy: "open",
		  allowFrom: [],
		  allowAllUsers: false,
		  groupPolicy: "open",
		  groupAllowFrom: [],
		  requireMention: true,
		  groupTriggerPolicy: "{}",
		  restrictedMemberPrefix: true,
		  autoAcceptAdminRequests: false,
		  autoAllowInvitedGroups: false,
		  capabilitiesDeny: [],
		  ownerDeny: [],
		  friendDeny: [],
		  memberDeny: [],
		  strangerDeny: [],
		  ownerGrant: [],
		  friendGrant: [],
		  memberGrant: [],
		  strangerGrant: [],
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
		  taskEveryRounds: 1,
		  unknownCommand: "intercept",
		  rateLimitPerMinute: 30,
		  sideAskEnabled: false,
		  sideAskConcurrency: 2,
		  sideAskMaxChars: 8e3,
		  idleResetHours: 0,
		  privateResetDays: 0,
		  groupResetDays: 0,
		  sessionTitleTemplate: "{kind} {target} · {date}",
		  privateSessionKeepDays: 0,
		  groupSessionKeepDays: 0,
		  chatIdleEvictDays: 7,
		  protocolMode: "off",
		  protocolChats: [],
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
		  ttsEnabled: false,
		  ttsEngine: "sherpa-onnx",
		  ttsModel: "",
		  ttsCommand: "",
		  ttsArgs: [],
		  ttsVoice: "",
		  ttsMaxChars: 200,
		  ttsTimeoutMs: 6e4,
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
		    { section: "定时任务", mode: "card", text: "定时任务在 cordis.patch.yml 的 scheduledPrompts 里编辑；下面是当前生效的列表。" }
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
		function appendTags(list2, text) {
		  const out = tagsOf(list2);
		  for (const item of parseTagInput(text)) {
		    if (out.indexOf(item) < 0) out.push(item);
		  }
		  return out;
		}
		function removeTagAt(list2, index) {
		  const out = tagsOf(list2);
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
		    const list2 = tagsOf(value);
		    return list2.length === 0 ? "空" : list2.join("、");
		  }
		  if (value === void 0 || value === null || value === "") return "空";
		  return String(value);
		}
		function snapshotValueToDraft(field, value) {
		  if (field.type === "secret") return "";
		  if (field.type === "stringArray") {
		    if (MATRIX_KEYS.some((key) => key === field.key) && Array.isArray(value)) return value.filter((entry) => typeof entry === "string");
		    return tagsOf(value);
		  }
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
		  if (field.type === "stringArray") {
		    if (MATRIX_KEYS.some((key) => key === field.key) && Array.isArray(raw)) return raw.filter((entry) => typeof entry === "string");
		    return tagsOf(raw);
		  }
		  return String(raw == null ? "" : raw);
		}
		function valueEquals(a, b) {
		  return JSON.stringify(a === void 0 ? null : a) === JSON.stringify(b === void 0 ? null : b);
		}
		function configHasKey(config, key) {
		  return config != null && Object.prototype.hasOwnProperty.call(config, key) && config[key] !== void 0;
		}
		function computePatch(draft, config, opts) {
		  const options = opts == null ? {} : opts;
		  const config_ = config == null ? {} : config;
		  const patch = {};
		  const invalidKeys = [];
		  for (const field of ALL_FIELDS) {
		    if (field.type === "secret") continue;
		    if (!configHasKey(config_, field.key)) continue;
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
		  if (field.optionLabels != null) {
		    for (const optionLabel of Object.values(field.optionLabels)) {
		      if (includesNeedle(String(optionLabel), needle)) {
		        hits.push("option");
		        break;
		      }
		    }
		  }
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
		function fieldErrorId(key) {
		  return "qqc-e-" + key;
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
		  const config = options.config;
		  if (config == null || !configHasKey(config, field.key)) return false;
		  const next = coerceValue(field, draftOf(options, field));
		  if (field.type === "number" && Number.isNaN(next)) {
		    const raw = String(draftOf(options, field) == null ? "" : draftOf(options, field)).trim();
		    return raw !== String(config[field.key] == null ? "" : config[field.key]);
		  }
		  return !valueEquals(next, config[field.key]);
		}
		function isFieldNonDefault(field, options) {
		  if (options.config == null || !configHasKey(options.config, field.key) || options.defaults == null) return false;
		  return !valueEquals(options.config[field.key], options.defaults[field.key]);
		}
		function isFieldInactive(field, options) {
		  if (typeof field.dependsOn !== "function") return false;
		  const draft = options.draft == null ? {} : options.draft;
		  return field.dependsOn(draft) === false;
		}
		function canResetField(field, options) {
		  if (!configHasKey(options.config, field.key) || options.defaults == null || field.type === "secret") return false;
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
		function controlOf(ReactImpl2, field, options, t, describedBy, invalid) {
		  const value = draftOf(options, field);
		  const disabled = options.disabled === true || !configHasKey(options.config, field.key);
		  const id = fieldControlId(field.key);
		  const onChange = typeof options.onChange === "function" ? options.onChange : () => {
		  };
		  const ariaInvalid = invalid === true ? "true" : void 0;
		  if (field.type === "boolean") {
		    const on = value === true;
		    return h(ReactImpl2, "button", {
		      className: "qqc-switch",
		      type: "button",
		      role: "switch",
		      id,
		      "aria-checked": on,
		      "aria-invalid": ariaInvalid,
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
		      "aria-invalid": ariaInvalid,
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
		        "aria-invalid": ariaInvalid,
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
		        "aria-invalid": ariaInvalid,
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
		    "aria-invalid": ariaInvalid,
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
		  const risk = Array.isArray(options.riskKeys) && options.riskKeys.indexOf(field.key) >= 0;
		  const error = options.invalid == null ? void 0 : options.invalid[field.key];
		  const stack = field.type === "stringArray";
		  const badges = [];
		  if (dirty) badges.push(h(ReactImpl2, "span", { className: "qqc-badge", "data-tone": "brand", key: "badge-dirty" }, t("badge.dirty")));
		  if (nonDefault) badges.push(h(ReactImpl2, "span", { className: "qqc-badge", key: "badge-non-default" }, t("badge.nonDefault")));
		  if (inactive) badges.push(h(ReactImpl2, "span", { className: "qqc-badge", key: "badge-inactive" }, t("badge.inactive")));
		  if (willClear) badges.push(h(ReactImpl2, "span", { className: "qqc-badge", "data-tone": "warn", key: "badge-will-clear" }, t("badge.willClear")));
		  if (risk) badges.push(h(ReactImpl2, "span", { className: "qqc-badge", "data-tone": "warn", key: "badge-risk" }, t("badge.risk")));
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
		  const describedIds = [];
		  if (hasHint || hasInactiveNote) describedIds.push(fieldHintId(field.key));
		  if (error != null) describedIds.push(fieldErrorId(field.key));
		  const describedBy = describedIds.length === 0 ? void 0 : describedIds.join(" ");
		  const control = controlOf(ReactImpl2, field, options, t, describedBy, error != null);
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
		  const errorNode = error == null ? null : h(ReactImpl2, "p", { className: "qqc-error", id: fieldErrorId(field.key) }, error);
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
		      ),
		      errorNode
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
		      ),
		      errorNode
		    );
		  } else if (field.type === "secret") {
		    controlNode = h(ReactImpl2, "div", { className: "qqc-control" }, control, errorNode);
		  } else {
		    controlNode = h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-control" },
		      h(ReactImpl2, "div", { className: "qqc-control-line" }, control, unit, resetButton),
		      errorNode
		    );
		  }
		  const props = {
		    className: stack ? "qqc-row qqc-row--stack" : "qqc-row",
		    "data-key": field.key,
		    key: field.key
		  };
		  if (dirty) props["data-dirty"] = "true";
		  if (inactive) props["data-inactive"] = "true";
		  if (error != null) props["data-invalid"] = "true";
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
		    if (typeof options.renderCardNote === "function") {
		      const custom = options.renderCardNote(note);
		      if (custom != null) {
		        cards.push(custom);
		        continue;
		      }
		    }
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
		function renderRiskDialog(ReactImpl2, opts) {
		  const options = opts == null ? {} : opts;
		  const risks = Array.isArray(options.risks) ? options.risks : [];
		  if (risks.length === 0) return null;
		  const t = typeof options.t === "function" ? options.t : fallbackTranslate;
		  const onCancel = () => {
		    if (typeof options.onCancel === "function") options.onCancel();
		  };
		  const onConfirm = () => {
		    if (typeof options.onConfirm === "function") options.onConfirm();
		  };
		  return h(
		    ReactImpl2,
		    "div",
		    { className: "qqc-overlay", "data-role": "risk-overlay", key: "risk-overlay" },
		    h(
		      ReactImpl2,
		      "div",
		      {
		        className: "qqc-dialog",
		        "data-role": "risk-dialog",
		        role: "dialog",
		        "aria-modal": "true",
		        "aria-labelledby": "qqc-risk-title",
		        onKeyDown: (event) => {
		          if (event.key === "Escape") {
		            event.preventDefault();
		            onCancel();
		            return;
		          }
		          if (event.key !== "Tab") return;
		          const scope = event.currentTarget;
		          if (scope == null || typeof scope.querySelectorAll !== "function") return;
		          const focusables = Array.prototype.slice.call(scope.querySelectorAll(".qqc-btn"));
		          if (focusables.length === 0) return;
		          let index = -1;
		          for (let i = 0; i < focusables.length; i += 1) {
		            if (focusables[i] === event.target) index = i;
		          }
		          event.preventDefault();
		          if (index < 0) {
		            focusables[event.shiftKey === true ? focusables.length - 1 : 0].focus();
		            return;
		          }
		          const next = event.shiftKey === true ? (index - 1 + focusables.length) % focusables.length : (index + 1) % focusables.length;
		          focusables[next].focus();
		        }
		      },
		      h(ReactImpl2, "h3", { className: "qqc-dialog-title", id: "qqc-risk-title" }, t("risk.title")),
		      h(ReactImpl2, "p", { className: "qqc-dialog-text" }, t("risk.text")),
		      h(ReactImpl2, "ul", { className: "qqc-risk-list" }, risks.map((risk, index) => h(
		        ReactImpl2,
		        "li",
		        {
		          className: "qqc-risk",
		          key: "risk-" + index,
		          "data-key": risk.keys.join(" ")
		        },
		        h(ReactImpl2, "span", { className: "qqc-risk-field" }, risk.label),
		        t(risk.messageKey)
		      ))),
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-dialog-actions" },
		        h(ReactImpl2, "button", {
		          className: "qqc-btn",
		          type: "button",
		          id: "qqc-risk-cancel",
		          autoFocus: true,
		          onClick: () => {
		            onCancel();
		          }
		        }, t("risk.cancel")),
		        h(ReactImpl2, "button", {
		          className: "qqc-btn",
		          type: "button",
		          "data-variant": "danger",
		          id: "qqc-risk-confirm",
		          onClick: () => {
		            onConfirm();
		          }
		        }, t("risk.confirm"))
		      )
		    )
		  );
		}

		// src/client/overview.ts
		var OVERVIEW_PAGE_ID = "overview";
		var OVERVIEW_MISSING = "—";
		function fallbackTranslate2(key) {
		  return zh[key] != null ? zh[key] : key;
		}
		function numberText(value) {
		  return typeof value === "number" && Number.isFinite(value) ? String(value) : OVERVIEW_MISSING;
		}
		function formatSize(bytes) {
		  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return OVERVIEW_MISSING;
		  if (bytes < 1024) return bytes + "B";
		  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
		  return (bytes / (1024 * 1024)).toFixed(2) + "MB";
		}
		function formatSizePair(bytes, maxBytes) {
		  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return OVERVIEW_MISSING;
		  const used = formatSize(bytes);
		  if (typeof maxBytes !== "number" || !Number.isFinite(maxBytes) || maxBytes < 0) return used;
		  const limit = formatSize(maxBytes);
		  const usedUnit = used.replace(/^[\d.]+/, "");
		  const limitUnit = limit.replace(/^[\d.]+/, "");
		  if (usedUnit === limitUnit) return used.slice(0, used.length - usedUnit.length) + " / " + limit;
		  return used + " / " + limit;
		}
		function meterTone(bytes, maxBytes) {
		  if (typeof bytes !== "number" || typeof maxBytes !== "number" || !Number.isFinite(bytes) || !Number.isFinite(maxBytes) || maxBytes <= 0) return null;
		  const ratio = bytes / maxBytes;
		  if (ratio >= 1) return "error";
		  if (ratio >= 0.8) return "warn";
		  return null;
		}
		function meterPercent(bytes, maxBytes) {
		  if (typeof bytes !== "number" || typeof maxBytes !== "number" || !Number.isFinite(bytes) || !Number.isFinite(maxBytes) || maxBytes <= 0) return 0;
		  return Math.max(0, Math.min(100, Math.round(bytes / maxBytes * 100)));
		}
		function protocolRate(protocol) {
		  if (protocol == null) return null;
		  const replies = typeof protocol.repliesToday === "number" && Number.isFinite(protocol.repliesToday) ? protocol.repliesToday : 0;
		  const parsed = typeof protocol.parsedToday === "number" && Number.isFinite(protocol.parsedToday) ? protocol.parsedToday : 0;
		  if (replies <= 0) return null;
		  return Math.max(0, Math.min(100, Math.round(Math.min(parsed, replies) / replies * 100)));
		}
		function protocolRateText(protocol) {
		  const rate = protocolRate(protocol);
		  return rate === null ? OVERVIEW_MISSING : rate + "%";
		}
		function connectionDotState(connection) {
		  if (connection == null) return "idle";
		  if (connection.connected !== true) return "error";
		  if (connection.online === true) return "ok";
		  if (connection.online === false) return "warn";
		  return "idle";
		}
		function stat(ReactImpl2, options) {
		  const labelChildren = [];
		  if (options.dot !== void 0) labelChildren.push(h(ReactImpl2, "span", { className: "qqc-dot", "data-state": options.dot, "aria-hidden": "true", key: "dot" }));
		  labelChildren.push(options.label);
		  const children = [
		    h(ReactImpl2, "div", { className: "qqc-stat-label", key: "label" }, ...labelChildren),
		    h(ReactImpl2, "div", { className: "qqc-stat-value", key: "value" }, options.value)
		  ];
		  if (options.action != null) children.push(h(ReactImpl2, "div", { className: "qqc-stat-sub", key: "action" }, options.action));
		  else if (options.sub !== void 0 && options.sub !== "") children.push(h(ReactImpl2, "div", { className: "qqc-stat-sub", key: "sub" }, options.sub));
		  return h(ReactImpl2, "div", { className: "qqc-stat", "data-stat": options.key, key: "stat-" + options.key }, ...children);
		}
		function statsOf(ReactImpl2, t, status, options) {
		  const connection = status == null ? null : status.connection ?? null;
		  const sessions = status == null ? null : status.sessions ?? null;
		  const today = status == null ? null : status.today ?? null;
		  const proactive = status == null ? null : status.proactive ?? null;
		  const stickers = status == null ? null : status.stickers ?? null;
		  const scheduled = status == null || !Array.isArray(status.scheduled) ? null : status.scheduled;
		  const connectionValue = connection == null ? OVERVIEW_MISSING : connection.connected !== true ? t("conn.disconnected") : connection.online === true ? t("overview.online") : connection.online === false ? t("overview.offlineNow") : t("overview.unknown");
		  const connectionId = connection == null ? OVERVIEW_MISSING : String(connection.selfId !== void 0 && connection.selfId !== "" ? connection.selfId : connection.botQQ !== void 0 && connection.botQQ !== "" ? connection.botQQ : "") || OVERVIEW_MISSING;
		  const sessionValue = sessions == null ? OVERVIEW_MISSING : format(t("overview.sessionCounts"), { dm: numberText(sessions.private), group: numberText(sessions.group) });
		  const proactiveValue = proactive == null ? OVERVIEW_MISSING : proactive.enabled === false ? t("overview.off") : format(t("overview.checkins"), { done: numberText(proactive.doneToday), planned: numberText(proactive.plannedToday) });
		  const proactiveSub = proactive != null && typeof proactive.nextAt === "string" && proactive.nextAt !== "" ? format(t("overview.nextAt"), { time: proactive.nextAt }) : "";
		  const stickersOff = stickers != null && stickers.enabled === false;
		  const stickersValue = stickers == null ? OVERVIEW_MISSING : stickersOff ? t("overview.off") : format(t("overview.stickerLibrary"), { n: numberText(stickers.count), max: numberText(stickers.maxCount) });
		  const stickersSub = stickers == null || stickersOff ? "" : format(t("overview.stickerToday"), { n: numberText(stickers.today), max: numberText(stickers.dailyMax) });
		  const enableButton = stickersOff ? h(ReactImpl2, "button", {
		    className: "qqc-link",
		    type: "button",
		    "data-role": "overview-go-media",
		    key: "go-media",
		    onClick: () => {
		      if (typeof options.onGoToPage === "function") options.onGoToPage("media");
		    }
		  }, t("overview.goEnable")) : null;
		  let nextSchedule = "";
		  if (scheduled != null) {
		    for (const task of scheduled) {
		      if (task == null || typeof task.nextAt !== "string" || task.nextAt === "") continue;
		      if (nextSchedule === "" || task.nextAt < nextSchedule) nextSchedule = task.nextAt;
		    }
		  }
		  const scheduledValue = scheduled == null ? OVERVIEW_MISSING : format(t("overview.scheduledCount"), { n: String(scheduled.length) });
		  const scheduledSub = nextSchedule === "" ? "" : format(t("overview.nextAt"), { time: nextSchedule });
		  const todayPassSub = today != null && typeof today.passCount === "number" ? " · " + format(t("overview.passToday"), { n: numberText(today.passCount) }) : "";
		  const todaySub = t("overview.sentUnit") + todayPassSub;
		  return h(
		    ReactImpl2,
		    "div",
		    { className: "qqc-stats", "data-role": "overview-stats", key: "stats" },
		    stat(ReactImpl2, { key: "connection", label: t("overview.connection"), value: connectionValue, sub: connectionId, dot: connectionDotState(connection) }),
		    stat(ReactImpl2, { key: "sessions", label: t("overview.sessions"), value: sessionValue }),
		    stat(ReactImpl2, { key: "today", label: t("overview.today"), value: today == null ? OVERVIEW_MISSING : numberText(today.sent), sub: todaySub }),
		    stat(ReactImpl2, { key: "proactive", label: t("overview.proactive"), value: proactiveValue, sub: proactiveSub }),
		    stat(ReactImpl2, { key: "stickers", label: t("overview.stickers"), value: stickersValue, sub: stickersSub, action: enableButton }),
		    stat(ReactImpl2, { key: "scheduled", label: t("overview.scheduled"), value: scheduledValue, sub: scheduledSub })
		  );
		}
		function memoryCard(ReactImpl2, t, status) {
		  const files = status == null || !Array.isArray(status.memory) ? null : status.memory;
		  const rows = [];
		  for (const file of files ?? []) {
		    if (file == null) continue;
		    const label = typeof file.label === "string" && file.label !== "" ? file.label : OVERVIEW_MISSING;
		    const path = typeof file.path === "string" ? file.path : "";
		    const tone = meterTone(file.bytes, file.maxBytes);
		    const sizeText = typeof file.bytes === "number" ? formatSizePair(file.bytes, file.maxBytes) : OVERVIEW_MISSING;
		    const meterProps = { className: "qqc-meter", key: "meter" };
		    const fillProps = {
		      className: "qqc-meter-fill",
		      style: { width: meterPercent(file.bytes, file.maxBytes) + "%" }
		    };
		    if (tone != null) fillProps["data-tone"] = tone;
		    rows.push(h(
		      ReactImpl2,
		      "li",
		      { className: "qqc-list-row", key: "memory-" + rows.length, "data-key": path },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-row-meta" },
		        h(ReactImpl2, "span", { className: "qqc-label" }, label),
		        h(ReactImpl2, "span", { className: "qqc-list-path", title: path }, path)
		      ),
		      h(ReactImpl2, "span", { className: "qqc-unit" }, sizeText),
		      h(ReactImpl2, "div", meterProps, h(ReactImpl2, "div", fillProps))
		    ));
		  }
		  const body = files == null || rows.length === 0 ? [h(ReactImpl2, "div", { className: "qqc-empty", key: "empty" }, t("overview.noMemory"))] : [h(ReactImpl2, "ul", { className: "qqc-list", key: "list" }, rows)];
		  return h(
		    ReactImpl2,
		    "section",
		    { className: "qqc-card", "data-section": t("overview.memory"), "data-role": "overview-memory", key: "memory-card" },
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-card-head" },
		      h(ReactImpl2, "h3", { className: "qqc-card-title" }, t("overview.memory"))
		    ),
		    ...body
		  );
		}
		function renderScheduledList(ReactImpl2, options) {
		  const t = options != null && typeof options.t === "function" ? options.t : fallbackTranslate2;
		  const tasks = options == null || !Array.isArray(options.tasks) ? null : options.tasks;
		  if (tasks == null || tasks.length === 0) {
		    return [h(ReactImpl2, "div", { className: "qqc-empty", key: "scheduled-empty", "data-role": "overview-scheduled-empty" }, t("overview.noScheduled"))];
		  }
		  const rows = [];
		  for (const task of tasks) {
		    if (task == null) continue;
		    const id = typeof task.id === "string" && task.id !== "" ? task.id : OVERVIEW_MISSING;
		    const time = typeof task.time === "string" && task.time !== "" ? task.time : OVERVIEW_MISSING;
		    const chatId = typeof task.chatId === "string" && task.chatId !== "" ? task.chatId : OVERVIEW_MISSING;
		    const done = task.doneToday === true;
		    rows.push(h(
		      ReactImpl2,
		      "li",
		      { className: "qqc-list-row", key: "task-" + rows.length, "data-key": id },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-row-meta" },
		        h(ReactImpl2, "span", { className: "qqc-label" }, id + " · " + time),
		        h(ReactImpl2, "span", { className: "qqc-list-path", title: chatId }, chatId)
		      ),
		      h(ReactImpl2, "span", { className: "qqc-unit" }, done ? t("overview.doneToday") : t("overview.pendingToday"))
		    ));
		  }
		  return [h(ReactImpl2, "ul", { className: "qqc-list", key: "scheduled-list" }, rows)];
		}
		function scheduledCard(ReactImpl2, t, status) {
		  const tasks = status == null || !Array.isArray(status.scheduled) ? null : status.scheduled;
		  return h(
		    ReactImpl2,
		    "section",
		    { className: "qqc-card", "data-section": t("overview.scheduled"), "data-role": "overview-scheduled", key: "scheduled-card" },
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-card-head" },
		      h(ReactImpl2, "h3", { className: "qqc-card-title" }, t("overview.scheduled"))
		    ),
		    ...renderScheduledList(ReactImpl2, { tasks, t })
		  );
		}
		function sessionsCard(ReactImpl2, t, status) {
		  const list2 = status == null || status.sessions == null || !Array.isArray(status.sessions.list) ? null : status.sessions.list;
		  const rows = [];
		  for (const chat of list2 ?? []) {
		    if (chat == null) continue;
		    const chatId = typeof chat.chatId === "string" && chat.chatId !== "" ? chat.chatId : OVERVIEW_MISSING;
		    const title = typeof chat.title === "string" && chat.title !== "" ? chat.title : chatId;
		    const attached = chat.workspaceAttached;
		    const attachedText = attached === true ? t("overview.attached") : attached === false ? t("overview.notAttached") : OVERVIEW_MISSING;
		    const children = [
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-row-meta", key: "meta" },
		        h(ReactImpl2, "span", { className: "qqc-label", title: chatId }, title),
		        h(ReactImpl2, "span", { className: "qqc-list-path", title: chatId }, chatId)
		      ),
		      h(ReactImpl2, "span", { className: "qqc-unit", key: "attached", "data-attached": attached === true ? "true" : attached === false ? "false" : "unknown" }, attachedText)
		    ];
		    if (attached === false) {
		      children.push(h(ReactImpl2, "div", { className: "qqc-hint", key: "hint", style: { gridColumn: "1 / -1" } }, t("overview.attachHint")));
		    }
		    rows.push(h(ReactImpl2, "li", { className: "qqc-list-row", key: "session-" + rows.length, "data-key": chatId }, ...children));
		  }
		  const body = list2 == null || rows.length === 0 ? [h(ReactImpl2, "div", { className: "qqc-empty", key: "empty" }, t("overview.noSessions"))] : [h(ReactImpl2, "ul", { className: "qqc-list", key: "list" }, rows)];
		  return h(
		    ReactImpl2,
		    "section",
		    { className: "qqc-card", "data-section": t("overview.sessionsCard"), "data-role": "overview-sessions", key: "sessions-card" },
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-card-head" },
		      h(ReactImpl2, "h3", { className: "qqc-card-title" }, t("overview.sessionsCard"))
		    ),
		    ...body
		  );
		}
		function capabilitiesCard(ReactImpl2, t, status, options) {
		  const summary = status == null || status.capabilities == null ? null : status.capabilities;
		  const disabled = summary == null || !Array.isArray(summary.disabled) ? [] : summary.disabled;
		  const counts = summary == null || summary.byRelation == null ? null : summary.byRelation;
		  const relationRow = h(ReactImpl2, "div", {
		    className: "qqc-hint",
		    key: "by-relation",
		    "data-role": "overview-capabilities-by-relation"
		  }, counts == null ? OVERVIEW_MISSING : format(t("overview.capabilitiesByRelation"), {
		    owner: numberText(counts.owner),
		    friend: numberText(counts.friend),
		    groupMember: numberText(counts.groupMember),
		    stranger: numberText(counts.stranger)
		  }));
		  const rows = [];
		  for (const item of disabled) {
		    if (item == null) continue;
		    const id = typeof item.id === "string" && item.id !== "" ? item.id : OVERVIEW_MISSING;
		    const title = typeof item.title === "string" && item.title !== "" ? item.title : "";
		    const reason = typeof item.reason === "string" && item.reason !== "" ? item.reason : OVERVIEW_MISSING;
		    rows.push(h(
		      ReactImpl2,
		      "li",
		      { className: "qqc-list-row", key: "capability-" + rows.length, "data-key": id },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-row-meta" },
		        h(ReactImpl2, "span", { className: "qqc-label", title: id }, title === "" ? id : id + "（" + title + "）"),
		        h(ReactImpl2, "span", { className: "qqc-list-path", title: reason }, reason)
		      ),
		      h(ReactImpl2, "span", { className: "qqc-unit", key: "state" }, t("overview.off"))
		    ));
		  }
		  const body = summary == null ? [h(ReactImpl2, "div", { className: "qqc-empty", key: "missing" }, OVERVIEW_MISSING)] : [
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-hint", key: "count", "data-role": "overview-capabilities-count" },
		      format(t("overview.capabilitiesCount"), { on: numberText(summary.enabled), total: numberText(summary.total) }) + " · " + t("overview.capabilitiesHint")
		    ),
		    ...rows.length === 0 ? [h(ReactImpl2, "div", { className: "qqc-empty", key: "all-on", "data-role": "overview-capabilities-all-on" }, t("overview.capabilitiesAllOn"))] : [h(ReactImpl2, "ul", { className: "qqc-list", key: "list" }, rows)]
		  ];
		  const protocol = status == null || status.protocol == null ? null : status.protocol;
		  const protocolState = protocol == null ? "missing" : protocol.enabled === true ? "on" : "off";
		  const protocolText = protocol == null ? OVERVIEW_MISSING : protocol.enabled !== true ? t("overview.protocolOff") : t("overview.protocolOn") + " · " + format(t("overview.protocolStat"), {
		    replies: numberText(protocol.repliesToday),
		    parsed: numberText(protocol.parsedToday),
		    rate: protocolRateText(protocol)
		  });
		  const protocolRow = h(ReactImpl2, "div", {
		    className: "qqc-hint",
		    key: "protocol",
		    "data-role": "overview-protocol",
		    "data-state": protocolState
		  }, protocolText);
		  return h(
		    ReactImpl2,
		    "section",
		    { className: "qqc-card", "data-section": t("overview.capabilities"), "data-role": "overview-capabilities", key: "capabilities-card" },
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-card-head" },
		      h(ReactImpl2, "h3", { className: "qqc-card-title" }, t("overview.capabilities")),
		      h(ReactImpl2, "button", {
		        className: "qqc-btn qqc-btn--sm",
		        type: "button",
		        "data-role": "overview-go-capabilities",
		        onClick: () => {
		          options.onGoToPage?.("capabilities");
		        }
		      }, t("overview.manageCapabilities"))
		    ),
		    protocolRow,
		    relationRow,
		    ...body
		  );
		}
		function renderOverview(ReactImpl2, opts) {
		  const options = opts == null ? {} : opts;
		  const t = typeof options.t === "function" ? options.t : fallbackTranslate2;
		  const available = options.available !== false;
		  const status = available ? options.status == null ? null : options.status : null;
		  const onRefresh = typeof options.onRefresh === "function" ? options.onRefresh : () => {
		  };
		  const nodes = [
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-page-head", key: "page-head" },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-page-head-text" },
		        h(ReactImpl2, "h3", { className: "qqc-page-title" }, t("overview.title")),
		        h(ReactImpl2, "p", { className: "qqc-page-desc" }, t("overview.desc"))
		      ),
		      h(ReactImpl2, "button", {
		        className: "qqc-btn qqc-btn--sm",
		        type: "button",
		        "data-role": "overview-refresh",
		        key: "refresh",
		        onClick: () => {
		          onRefresh();
		        }
		      }, t("overview.refresh"))
		    )
		  ];
		  if (!available) {
		    nodes.push(h(
		      ReactImpl2,
		      "div",
		      {
		        className: "qqc-banner",
		        "data-tone": "info",
		        "data-role": "overview-unavailable",
		        key: "unavailable"
		      },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-banner-body" },
		        h(ReactImpl2, "p", { className: "qqc-banner-title" }, t("overview.unavailable"))
		      )
		    ));
		  } else if (options.error != null && options.error !== "") {
		    nodes.push(h(
		      ReactImpl2,
		      "div",
		      {
		        className: "qqc-banner",
		        "data-tone": "error",
		        "data-role": "overview-error",
		        key: "overview-error"
		      },
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-banner-body" },
		        h(ReactImpl2, "p", { className: "qqc-banner-title" }, t("overview.errorTitle")),
		        h(ReactImpl2, "p", { className: "qqc-banner-text" }, options.error)
		      ),
		      h(
		        ReactImpl2,
		        "div",
		        { className: "qqc-banner-actions" },
		        h(ReactImpl2, "button", {
		          className: "qqc-btn qqc-btn--sm",
		          type: "button",
		          key: "retry",
		          onClick: () => {
		            onRefresh();
		          }
		        }, t("load.retry"))
		      )
		    ));
		  }
		  nodes.push(statsOf(ReactImpl2, t, status, options));
		  nodes.push(memoryCard(ReactImpl2, t, status));
		  nodes.push(scheduledCard(ReactImpl2, t, status));
		  nodes.push(sessionsCard(ReactImpl2, t, status));
		  nodes.push(capabilitiesCard(ReactImpl2, t, status, options));
		  return nodes;
		}

		// src/client/validate.ts
		function fallbackTranslate3(key) {
		  return zh[key] != null ? zh[key] : key;
		}
		var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
		var TIME24_RE = /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/;
		function textOf(values, key) {
		  const raw = values[key];
		  return String(raw == null ? "" : raw).trim();
		}
		function minutesOf(text) {
		  const parts = text.split(":");
		  return Number(parts[0]) * 60 + Number(parts[1]);
		}
		function validateField(field, values, t) {
		  if (field.type === "number") {
		    const text = textOf(values, field.key);
		    if (text === "") return t("validate.number");
		    const value = Number(text);
		    if (!Number.isFinite(value)) return t("validate.number");
		    if (field.key === "port") return value < 1 || value > 65535 ? t("validate.port") : null;
		    const min = field.min == null ? 0 : field.min;
		    if (value < min) return format(t("validate.min"), { min });
		    if (field.max != null && value > field.max) return format(t("validate.max"), { max: field.max });
		    return null;
		  }
		  if (field.control === "time" || field.control === "time24") {
		    const text = textOf(values, field.key);
		    const pattern = field.control === "time24" ? TIME24_RE : TIME_RE;
		    if (pattern.test(text)) return null;
		    return t(field.control === "time24" ? "validate.time24" : "validate.time");
		  }
		  return null;
		}
		function applyWindowRule(values, startKey, endKey, errors, t) {
		  if (errors[startKey] != null || errors[endKey] != null) return;
		  const start = textOf(values, startKey);
		  const end = textOf(values, endKey);
		  if (!TIME24_RE.test(start) || !TIME24_RE.test(end)) return;
		  if (minutesOf(end) <= minutesOf(start)) errors[endKey] = t("validate.window");
		}
		function applyOrderRule(values, lowKey, highKey, errors, t, messageKey) {
		  if (errors[lowKey] != null || errors[highKey] != null) return;
		  const low = draftNumber(values, lowKey);
		  const high = draftNumber(values, highKey);
		  if (!Number.isFinite(low) || !Number.isFinite(high)) return;
		  if (low > high) errors[highKey] = t(messageKey);
		}
		function validateDraft(draft, t) {
		  const translate = typeof t === "function" ? t : fallbackTranslate3;
		  const values = draft == null ? {} : draft;
		  const errors = {};
		  for (const field of ALL_FIELDS) {
		    const message = validateField(field, values, translate);
		    if (message != null) errors[field.key] = message;
		  }
		  applyWindowRule(values, "proactiveWindowStart", "proactiveWindowEnd", errors, translate);
		  applyWindowRule(values, "groupPeekWindowStart", "groupPeekWindowEnd", errors, translate);
		  applyOrderRule(values, "proactiveMinPerDay", "proactiveMaxPerDay", errors, translate, "validate.proactiveMinMax");
		  applyOrderRule(values, "typingDelayMinMs", "typingDelayMaxMs", errors, translate, "validate.typingDelay");
		  return errors;
		}
		function collectRisks(draft, config, opts) {
		  const values = draft == null ? {} : draft;
		  const effective = config == null ? {} : config;
		  const clearSecret = opts != null && opts.clearSecret === true;
		  const risks = [];
		  const byMessage = {};
		  const push = (field, message) => {
		    const existing = byMessage[message];
		    if (existing == null) {
		      const entry = { keys: [field.key], label: field.label, messageKey: message };
		      byMessage[message] = entry;
		      risks.push(entry);
		      return;
		    }
		    if (existing.keys.indexOf(field.key) >= 0) return;
		    existing.keys.push(field.key);
		    existing.label = existing.label + " / " + field.label;
		  };
		  for (const field of ALL_FIELDS) {
		    if (MATRIX_KEYS.some((key) => key === field.key)) {
		      const before = tagsOf(effective[field.key]);
		      const after = tagsOf(values[field.key]);
		      const expands = field.key.endsWith("Deny") ? before.some((id) => !after.includes(id)) : after.some((id) => !before.includes(id));
		      if (expands) push(field, "risk.capabilityGrant");
		    }
		    if (typeof field.danger !== "function") continue;
		    if (field.type === "secret") {
		      if (!clearSecret) continue;
		      const message2 = field.danger(textOf(values, field.key), effective[field.key], values);
		      if (message2 != null && message2 !== "") push(field, message2);
		      continue;
		    }
		    const next = coerceValue(field, values[field.key]);
		    if (field.type === "number" && Number.isNaN(next)) continue;
		    if (valueEquals(next, effective[field.key])) continue;
		    const message = field.danger(next, effective[field.key], values);
		    if (message != null && message !== "") push(field, message);
		  }
		  return risks;
		}
		function riskFieldKeys(risks) {
		  const out = [];
		  for (const risk of risks == null ? [] : risks) {
		    for (const key of risk.keys) if (out.indexOf(key) < 0) out.push(key);
		  }
		  return out;
		}

		// src/client/capability-matrix.ts
		var CAPABILITIES_PAGE_ID = "capabilities";
		var MATRIX_SCOPES = ["owner", "private", "group"];
		function capabilityRowChanged(draft, config, id) {
		  return MATRIX_KEYS.some((key) => tagsOf(draft[key]).includes(id) !== tagsOf(config[key]).includes(id));
		}
		function matchingCapabilities(options) {
		  const query = normalizeQuery(options.query);
		  return CAPABILITIES.filter((capability) => {
		    if (options.changedOnly === true && !capabilityRowChanged(options.draft, options.config, capability.id)) return false;
		    return query === "" || [capability.title, capability.id, capability.describe, ...capability.tools].some((text) => text.toLowerCase().includes(query));
		  });
		}
		function capabilityDependencyNotes(capability, draft, t) {
		  const text = (key) => typeof draft[key] === "string" ? draft[key].trim() : "";
		  let missing = false;
		  const notes = [];
		  for (const dependency of capability.deps ?? []) {
		    if (dependency === "stickerLib" && text("stickerDir") === "") {
		      missing = true;
		      notes.push(t("capabilities.dep.stickerLib"));
		    } else if (dependency === "memoryNote" && text("groupMemoryDir") === "" && text("publicMemoryFile") === "") {
		      missing = true;
		      notes.push(t("capabilities.dep.memoryNote"));
		    } else if (dependency === "tts") {
		      const engineConfigured = draft.ttsEngine !== "command" || text("ttsCommand") !== "";
		      if (draft.ttsEnabled !== true || !engineConfigured) {
		        missing = true;
		        notes.push(t("capabilities.dep.tts"));
		      }
		      notes.push(t("capabilities.dep.ttsRuntime"));
		    }
		  }
		  return { missing, notes };
		}
		function highlighted(ReactImpl2, text, query) {
		  return highlightSegments(text, query).map((segment, index) => segment.hit ? h(ReactImpl2, "mark", { className: "qqc-mark", key: index }, segment.text) : segment.text);
		}
		function mixedRef(mixed) {
		  return (node) => {
		    if (node != null) node.indeterminate = mixed;
		  };
		}
		function renderCapabilityMatrix(ReactImpl2, options) {
		  const { t, draft, config } = options;
		  const supported = Array.isArray(config.ownerDeny);
		  const rows = matchingCapabilities(options);
		  return h(
		    ReactImpl2,
		    "section",
		    { className: "qqc-card qqc-cap-matrix", "data-role": "capability-matrix" },
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-card-head" },
		      h(ReactImpl2, "h3", { className: "qqc-card-title" }, t("capabilities.title")),
		      h(ReactImpl2, "p", { className: "qqc-card-desc" }, t("capabilities.scopeNote")),
		      h(ReactImpl2, "p", { className: "qqc-card-desc" }, t("capabilities.guardNote")),
		      h(ReactImpl2, "p", { className: "qqc-card-desc" }, t("capabilities.globalNote")),
		      supported ? null : h(ReactImpl2, "p", { className: "qqc-cap-upgrade", role: "status" }, t("capabilities.restartRequired"))
		    ),
		    h(
		      ReactImpl2,
		      "div",
		      { className: "qqc-cap-head", "aria-hidden": true },
		      h(ReactImpl2, "span", null, t("capabilities.function")),
		      MATRIX_SCOPES.map((scope) => h(ReactImpl2, "span", { key: scope }, t("capabilities.scope." + scope)))
		    ),
		    rows.length === 0 ? h(ReactImpl2, "div", { className: "qqc-empty" }, t("capabilities.empty")) : rows.map((capability) => {
		      const dependency = capabilityDependencyNotes(capability, draft, t);
		      const changed = capabilityRowChanged(draft, config, capability.id);
		      const mixed = getMatrixState(draft, capability.id, "private") === "mixed";
		      const noteId = "qqc-cap-note-" + capability.id;
		      return h(
		        ReactImpl2,
		        "div",
		        {
		          className: "qqc-cap-row",
		          key: capability.id,
		          "data-capability": capability.id,
		          "data-dirty": changed || void 0,
		          "data-needs-config": dependency.missing || void 0
		        },
		        h(
		          ReactImpl2,
		          "div",
		          { className: "qqc-cap-meta" },
		          h(
		            ReactImpl2,
		            "div",
		            { className: "qqc-cap-title" },
		            ...highlighted(ReactImpl2, capability.title, options.query),
		            dependency.missing ? h(ReactImpl2, "span", { className: "qqc-badge" }, t("capabilities.needsConfig")) : null,
		            changed ? h(ReactImpl2, "span", { className: "qqc-badge", "data-tone": "brand" }, t("badge.dirty")) : null
		          ),
		          h(ReactImpl2, "div", { className: "qqc-cap-tools" }, capability.tools.map((tool) => h(ReactImpl2, "code", { key: tool }, ...highlighted(ReactImpl2, tool, options.query)))),
		          h(ReactImpl2, "p", { className: "qqc-cap-desc" }, ...highlighted(ReactImpl2, capability.describe, options.query)),
		          h(
		            ReactImpl2,
		            "div",
		            { id: noteId, className: "qqc-cap-notes" },
		            dependency.notes.map((note, index) => h(ReactImpl2, "p", { key: index }, note)),
		            mixed ? h(ReactImpl2, "p", { "data-role": "capability-mixed-note" }, t("capabilities.mixedNote")) : null
		          )
		        ),
		        MATRIX_SCOPES.map((scope) => {
		          const state = getMatrixState(draft, capability.id, scope);
		          return h(
		            ReactImpl2,
		            "label",
		            { className: "qqc-cap-check", key: scope, "data-scope": scope },
		            h(ReactImpl2, "input", {
		              type: "checkbox",
		              checked: state === "on",
		              ref: mixedRef(state === "mixed"),
		              "aria-checked": state === "mixed" ? "mixed" : state === "on",
		              "aria-label": capability.title + " · " + t("capabilities.scope." + scope),
		              "aria-describedby": noteId,
		              "data-state": state,
		              disabled: options.disabled === true || !supported,
		              onChange: (event) => {
		                if (options.disabled === true || !supported) return;
		                options.onMatrixChange?.(capability.id, scope, event.target.checked);
		              }
		            }),
		            h(ReactImpl2, "span", { className: "qqc-cap-scope" }, t("capabilities.scope." + scope))
		          );
		        })
		      );
		    })
		  );
		}

		// src/client/view.ts
		var GROUP_TITLE_OF_KEY = {};
		for (const group of GROUPS) {
		  for (const field of group.fields) GROUP_TITLE_OF_KEY[field.key] = group.title;
		}
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
		function groupCounts(keys, draft, config) {
		  const counts = {};
		  for (const group of GROUPS) {
		    let count = 0;
		    for (const field of group.fields) if (keys.indexOf(field.key) >= 0) count += 1;
		    counts[group.id] = count;
		  }
		  if (draft != null && config != null) counts[CAPABILITIES_PAGE_ID] = matchingCapabilities({ draft, config, changedOnly: true }).length;
		  return counts;
		}
		function renderNav(props, dirtyKeys, invalid) {
		  const t = props.t;
		  const onPageChange = typeof props.onPageChange === "function" ? props.onPageChange : () => {
		  };
		  const onQueryChange = typeof props.onQueryChange === "function" ? props.onQueryChange : () => {
		  };
		  const onChangedOnlyChange = typeof props.onChangedOnlyChange === "function" ? props.onChangedOnlyChange : () => {
		  };
		  const dirtyCounts = groupCounts(dirtyKeys, props.draft, props.config);
		  const errorCounts = groupCounts(Object.keys(invalid));
		  const pages = [
		    { id: OVERVIEW_PAGE_ID, title: t("overview.title") },
		    ...GROUPS.map((group) => ({ id: group.id, title: group.id === CAPABILITIES_PAGE_ID ? t("capabilities.title") : group.title }))
		  ];
		  const badgeOf = (groupId) => {
		    const errorCount = errorCounts[groupId] == null ? 0 : errorCounts[groupId];
		    if (errorCount > 0) return h(React, "span", { className: "qqc-count", "data-tone": "error" }, String(errorCount));
		    const dirtyCount = dirtyCounts[groupId] == null ? 0 : dirtyCounts[groupId];
		    if (dirtyCount > 0) return h(React, "span", { className: "qqc-count" }, String(dirtyCount));
		    return null;
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
		        const list2 = event.currentTarget;
		        if (list2 == null || typeof list2.querySelectorAll !== "function") return;
		        const items = Array.prototype.slice.call(list2.querySelectorAll(".qqc-nav-item"));
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
		    }, pages.map((page) => {
		      return h(
		        React,
		        "button",
		        {
		          className: "qqc-nav-item",
		          type: "button",
		          key: page.id,
		          "data-page": page.id,
		          "aria-current": props.page === page.id ? "page" : void 0,
		          onClick: () => {
		            onPageChange(page.id);
		          }
		        },
		        h(React, "span", { className: "qqc-nav-label" }, page.title),
		        badgeOf(page.id)
		      );
		    }))
		  );
		}
		function renderHeader(props) {
		  const t = props.t;
		  const botQQ = props.botQQ == null ? "" : String(props.botQQ);
		  const status = props.status == null ? null : props.status;
		  const connection = status == null || status.connection == null ? null : status.connection;
		  const selfId = connection == null || connection.selfId == null ? "" : String(connection.selfId);
		  const id = selfId !== "" ? selfId : botQQ;
		  let state = "idle";
		  let label = "";
		  if (connection == null) {
		    if (botQQ !== "") label = format(t("conn.qq"), { qq: botQQ });
		  } else if (connection.connected !== true) {
		    state = "error";
		    label = t("conn.disconnected");
		  } else if (connection.online === true) {
		    state = "ok";
		    label = format(t("conn.withId"), { state: t("conn.online"), id: id !== "" ? id : "—" });
		  } else if (connection.online === false) {
		    state = "warn";
		    label = format(t("conn.withId"), { state: t("conn.offline"), id: id !== "" ? id : "—" });
		  } else {
		    state = "idle";
		    label = format(t("conn.withId"), { state: t("conn.unknown"), id: id !== "" ? id : "—" });
		  }
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
		    label === "" ? null : h(
		      React,
		      "span",
		      { className: "qqc-conn" },
		      h(React, "span", { className: "qqc-dot", "data-state": state, "aria-hidden": "true" }),
		      label
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
		function skeletonCards() {
		  return [120, 88, 152].map((height) => h(React, "div", {
		    className: "qqc-skeleton",
		    key: "skeleton-" + height,
		    style: { height: height + "px" }
		  }));
		}
		function draftValueText(field, raw, props) {
		  const t = props.t;
		  if (field.type === "secret") return t("conflict.secretValue");
		  if (field.type === "boolean") return raw === true ? t("switch.on") : t("switch.off");
		  if (field.type === "stringArray") {
		    const list2 = tagsOf(raw);
		    return list2.length === 0 ? t("conflict.emptyValue") : list2.join("、");
		  }
		  const text = String(raw == null ? "" : raw);
		  return text === "" ? t("conflict.emptyValue") : text;
		}
		function renderConflictChanges(props, dirtyKeys) {
		  const draft = props.draft == null ? {} : props.draft;
		  const rows = [];
		  for (const field of ALL_FIELDS) {
		    if (dirtyKeys.indexOf(field.key) < 0) continue;
		    const groupTitle = GROUP_TITLE_OF_KEY[field.key] == null ? "" : GROUP_TITLE_OF_KEY[field.key];
		    rows.push(h(
		      React,
		      "li",
		      { className: "qqc-list-row", key: field.key, "data-key": field.key },
		      h(React, "span", { className: "qqc-change-path" }, (groupTitle === "" ? "" : groupTitle + " · ") + field.label),
		      h(React, "span", { className: "qqc-change-value" }, draftValueText(field, draft[field.key], props))
		    ));
		  }
		  return h(
		    React,
		    "div",
		    { className: "qqc-conflict", "data-role": "conflict-changes", key: "conflict-changes" },
		    h(React, "ul", { className: "qqc-list" }, rows)
		  );
		}
		function conflictNodes(props, dirtyKeys) {
		  if (props.conflict !== true) return [];
		  const t = props.t;
		  const actions = [
		    h(React, "button", {
		      className: "qqc-btn qqc-btn--sm",
		      type: "button",
		      key: "reload",
		      "data-role": "conflict-reload",
		      onClick: () => {
		        if (typeof props.onReload === "function") props.onReload();
		      }
		    }, t("conflict.reload")),
		    h(React, "button", {
		      className: "qqc-btn qqc-btn--sm",
		      type: "button",
		      "data-variant": "ghost",
		      key: "mine",
		      "data-role": "conflict-mine",
		      onClick: () => {
		        if (typeof props.onToggleMine === "function") props.onToggleMine();
		      }
		    }, props.conflictShowMine === true ? t("conflict.hideMine") : t("conflict.showMine"))
		  ];
		  const nodes = [banner("error", "banner-conflict", t("conflict.title"), t("conflict.text"), actions)];
		  if (props.conflictShowMine === true) nodes.push(renderConflictChanges(props, dirtyKeys));
		  return nodes;
		}
		function renderSavebar(props, dirtyKeys, invalid) {
		  const t = props.t;
		  const saved = props.saveState === "saved";
		  const saving = props.busy === true || props.saveState === "saving";
		  if (!saved && dirtyKeys.length === 0) return null;
		  const invalidCount = Object.keys(invalid).length;
		  const onSave = typeof props.onSave === "function" ? props.onSave : () => {
		  };
		  const onRevert = typeof props.onRevert === "function" ? props.onRevert : () => {
		  };
		  const onPageChange = typeof props.onPageChange === "function" ? props.onPageChange : () => {
		  };
		  const text = [];
		  if (saved) {
		    text.push(t("save.done"));
		  } else if (invalidCount > 0) {
		    text.push(...withStrong(t("save.invalid"), invalidCount));
		  } else {
		    text.push(...withStrong(t("save.summary"), dirtyKeys.length));
		    const counts = groupCounts(dirtyKeys);
		    for (const group of GROUPS) {
		      const count = counts[group.id] == null ? 0 : counts[group.id];
		      if (count <= 0) continue;
		      text.push(" · ");
		      text.push(h(React, "button", {
		        className: "qqc-link",
		        type: "button",
		        key: "savebar-group-" + group.id,
		        "data-group": group.id,
		        onClick: () => {
		          onPageChange(group.id);
		        }
		      }, group.title));
		      text.push(" " + count);
		    }
		  }
		  const barProps = { className: "qqc-savebar", "data-role": "savebar", key: "savebar" };
		  if (saved) barProps["data-tone"] = "success";
		  else if (invalidCount > 0) barProps["data-tone"] = "error";
		  const actions = saved ? [] : [
		    h(React, "button", {
		      className: "qqc-btn",
		      type: "button",
		      "data-variant": "ghost",
		      key: "revert",
		      disabled: saving,
		      onClick: () => {
		        onRevert();
		      }
		    }, t("save.revert")),
		    h(React, "button", {
		      className: "qqc-btn",
		      type: "button",
		      "data-variant": "primary",
		      key: "submit",
		      disabled: saving || invalidCount > 0,
		      onClick: () => {
		        onSave();
		      }
		    }, saving ? t("save.saving") : t("save.submit"))
		  ];
		  return h(React, "div", barProps, h(React, "div", { className: "qqc-savebar-text" }, ...text), ...actions);
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
		    // §3.8：主动聊天页的「定时任务」只读卡片——F3 起用 getStatus() 的真实列表
		    // （快照缺席时退回空态说明），提示文案仍指向 cordis.patch.yml 的 scheduledPrompts。
		    renderCardNote: (note) => {
		      if (note.mode !== "card" || note.section !== "定时任务") return null;
		      const tasks = props.status == null || props.status.scheduled == null ? null : props.status.scheduled;
		      return h(
		        React,
		        "section",
		        {
		          className: "qqc-card",
		          "data-section": note.section,
		          "data-role": "proactive-scheduled",
		          key: "note-" + note.section
		        },
		        h(
		          React,
		          "div",
		          { className: "qqc-card-head" },
		          h(React, "h3", { className: "qqc-card-title" }, note.section),
		          h(React, "p", { className: "qqc-card-desc" }, note.text)
		        ),
		        ...renderScheduledList(React, { tasks, t: props.t })
		      );
		    },
		    ...extra
		  };
		}
		function SettingsView(props) {
		  const t = props.t;
		  const draft = props.draft == null ? {} : props.draft;
		  const config = props.config == null ? {} : props.config;
		  const loading = props.loading === true;
		  const dirtyKeys = loading ? [] : changeKeys(draft, config, props.clearSecret);
		  const invalid = loading ? {} : validateDraft(draft, t);
		  const risks = loading ? [] : collectRisks(draft, config, { clearSecret: props.clearSecret });
		  const riskKeys = riskFieldKeys(risks);
		  const onlyChanged = props.changedOnly === true;
		  const query = props.query == null ? "" : props.query;
		  const searching = query.trim() !== "";
		  const conflictTop = loading ? [] : conflictNodes(props, dirtyKeys);
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
		  if (loading) {
		    content = h(React, "div", { className: "qqc-main" }, ...conflictTop, skeletonCards());
		  } else if (searching) {
		    const matches = searchFields(query, GROUPS.filter((group) => group.id !== CAPABILITIES_PAGE_ID));
		    const matrixOptions = { t, draft, config, query, changedOnly: onlyChanged, disabled: props.busy === true, onMatrixChange: props.onMatrixChange };
		    const capabilityMatches = matchingCapabilities(matrixOptions);
		    if (matches.length === 0 && capabilityMatches.length === 0) {
		      content = h(
		        React,
		        "div",
		        { className: "qqc-main" },
		        ...conflictTop,
		        h(React, "div", { className: "qqc-empty" }, format(t("search.empty"), { q: query.trim() })),
		        renderSavebar(props, dirtyKeys, invalid)
		      );
		    } else {
		      const resultGroups = renderSearchResults(React, matches, Object.assign(
		        fieldOptions(props, { highlight: query, onlyChanged: false, invalid, riskKeys }),
		        { onOpenGroup: (groupId) => {
		          if (typeof props.onPageChange === "function") props.onPageChange(groupId);
		        } }
		      ));
		      content = h(
		        React,
		        "div",
		        { className: "qqc-main" },
		        ...conflictTop,
		        h(React, "p", { className: "qqc-page-title", key: "search-title" }, t("search.results")),
		        capabilityMatches.length === 0 ? null : renderCapabilityMatrix(React, matrixOptions),
		        resultGroups,
		        renderSavebar(props, dirtyKeys, invalid)
		      );
		    }
		  } else if (props.page === OVERVIEW_PAGE_ID) {
		    const overviewNodes = renderOverview(React, {
		      t,
		      status: props.status,
		      available: props.statusAvailable !== false,
		      error: props.statusError,
		      onRefresh: props.onRefreshStatus,
		      onGoToPage: (pageId) => {
		        if (typeof props.onPageChange === "function") props.onPageChange(pageId);
		      }
		    });
		    content = h(
		      React,
		      "div",
		      { className: "qqc-main" },
		      ...conflictTop,
		      ...overviewNodes,
		      renderSavebar(props, dirtyKeys, invalid)
		    );
		  } else if (props.page === CAPABILITIES_PAGE_ID) {
		    const group = GROUPS.find((item) => item.id === CAPABILITIES_PAGE_ID);
		    const supported = Array.isArray(config.ownerDeny);
		    content = h(
		      React,
		      "div",
		      { className: "qqc-main" },
		      ...conflictTop,
		      h(
		        React,
		        "div",
		        { className: "qqc-page-head" },
		        h(
		          React,
		          "div",
		          { className: "qqc-page-head-text" },
		          h(React, "h3", { className: "qqc-page-title" }, t("capabilities.title")),
		          h(React, "p", { className: "qqc-page-desc" }, t("capabilities.desc"))
		        )
		      ),
		      renderCapabilityMatrix(React, { t, draft, config, changedOnly: onlyChanged, disabled: props.busy === true, onMatrixChange: props.onMatrixChange }),
		      h(
		        React,
		        "details",
		        { className: "qqc-cap-advanced" },
		        h(React, "summary", null, t("capabilities.advanced")),
		        h(React, "p", { className: "qqc-page-desc" }, t("capabilities.advancedNote")),
		        renderGroup(React, group, fieldOptions(props, { invalid, riskKeys, disabled: props.busy === true || !supported }))
		      ),
		      renderSavebar(props, dirtyKeys, invalid)
		    );
		  } else {
		    const group = GROUPS.find((item) => item.id === props.page) != null ? GROUPS[GROUPS.findIndex((item) => item.id === props.page)] : GROUPS.find((item) => item.id === "connection");
		    const cards = renderGroup(React, group, fieldOptions(props, { invalid, riskKeys }));
		    const mainChildren = [
		      ...conflictTop,
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
		    mainChildren.push(renderSavebar(props, dirtyKeys, invalid));
		    content = h(React, "div", { className: "qqc-main" }, mainChildren);
		  }
		  return h(
		    React,
		    "div",
		    {
		      className: "qqc-root",
		      "data-embedded": props.embedded === true ? "true" : void 0,
		      "data-page": props.page,
		      // §5.7：Ctrl/⌘+S = 保存。监听挂在**面板根节点**上（不注册全局 window 监听），
		      // 焦点在面板内时按键冒泡到这里。
		      onKeyDown: (event) => {
		        if (event.key !== "s" && event.key !== "S") return;
		        if (event.ctrlKey !== true && event.metaKey !== true) return;
		        event.preventDefault();
		        if (props.busy === true || props.saveState === "saving") return;
		        if (props.riskDialog != null && props.riskDialog.length > 0) return;
		        if (typeof props.onSave === "function") props.onSave();
		      }
		    },
		    props.embedded === true ? null : renderHeader(props),
		    // §6.2 没有给横幅容器定义规则：这里只用内联排布（等间距 8px）把多条横幅叠起来。
		    banners.length === 0 ? null : h(React, "div", { className: "qqc-banners", style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" } }, banners),
		    h(React, "div", { className: "qqc-body" }, renderNav(props, dirtyKeys, invalid), content),
		    // §4.12：危险确认对话框挂在面板根节点内（覆盖层 position:fixed），绝不挂 document.body。
		    props.riskDialog != null && props.riskDialog.length > 0 ? renderRiskDialog(React, { risks: props.riskDialog, t, onCancel: props.onRiskCancel, onConfirm: props.onRiskConfirm }) : null
		  );
		}

		// src/client/panel.ts
		var OVERVIEW_REFRESH_MS = 3e4;
		function fallbackT(key) {
		  return zh[key] != null ? zh[key] : key;
		}
		function focusElement(id) {
		  if (typeof document === "undefined" || document == null) return;
		  const getter = document.getElementById;
		  if (typeof getter !== "function") return;
		  const element = getter.call(document, id);
		  if (element != null && typeof element.focus === "function") element.focus();
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
		  const [saveState, setSaveState] = React.useState("idle");
		  const [error, setError] = React.useState(null);
		  const [notice, setNotice] = React.useState("");
		  const [conflict, setConflict] = React.useState(false);
		  const [showMine, setShowMine] = React.useState(false);
		  const [riskDialog, setRiskDialog] = React.useState(null);
		  const [focusTarget, setFocusTarget] = React.useState(null);
		  const [page, setPage] = React.useState(OVERVIEW_PAGE_ID);
		  const [query, setQuery] = React.useState("");
		  const [changedOnly, setChangedOnly] = React.useState(false);
		  const [status, setStatus] = React.useState({ available: true, status: null, error: null });
		  const [tagInputs, setTagInputs] = React.useState({});
		  const [workspace, setWorkspace] = React.useState({ loaded: false, available: false, workspaces: [], selectedId: "" });
		  const accept = (next) => {
		    setSnapshot(next);
		    setDraft(draftFromSnapshot(next));
		    setTagInputs({});
		  };
		  const refetch = () => {
		    void remote.getSettings().then((result) => {
		      accept(unwrap(result));
		      setError(null);
		      setNotice("");
		    }).catch((cause) => {
		      setError(messageOf(cause));
		    });
		  };
		  const loadStatus = () => {
		    void Promise.resolve().then(() => typeof remote.getStatus === "function" ? remote.getStatus() : null).then((result) => {
		      if (result == null) return;
		      const value = unwrap(result);
		      const available = value != null && value.available === true;
		      const detail = value != null && value.status != null && typeof value.status === "object" ? value.status : null;
		      const failure = value != null && typeof value.error === "string" && value.error !== "" ? value.error : null;
		      setStatus({ available, status: available ? detail : null, error: failure });
		    }).catch(() => {
		      setStatus({ available: false, status: null, error: null });
		    });
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
		    loadStatus();
		  }, [remote]);
		  React.useEffect(() => {
		    if (page !== OVERVIEW_PAGE_ID) return;
		    const timer = setInterval(() => {
		      loadStatus();
		    }, OVERVIEW_REFRESH_MS);
		    return () => {
		      clearInterval(timer);
		    };
		  }, [page, remote]);
		  React.useEffect(() => {
		    if (notice === "") return;
		    const timer = setTimeout(() => {
		      setNotice("");
		    }, 3e3);
		    return () => {
		      clearTimeout(timer);
		    };
		  }, [notice]);
		  React.useEffect(() => {
		    if (saveState !== "saved") return;
		    const timer = setTimeout(() => {
		      setSaveState("idle");
		      refetch();
		    }, 2e3);
		    return () => {
		      clearTimeout(timer);
		    };
		  }, [saveState]);
		  React.useEffect(() => {
		    if (riskDialog == null || riskDialog.length === 0) return;
		    focusElement("qqc-risk-cancel");
		  }, [riskDialog]);
		  React.useEffect(() => {
		    if (focusTarget == null) return;
		    focusElement("qqc-f-" + focusTarget);
		    setFocusTarget(null);
		  }, [focusTarget]);
		  const commit = () => {
		    if (busy || snapshot == null || draft == null) return;
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
		    setSaveState("saving");
		    setConflict(false);
		    setShowMine(false);
		    void Promise.resolve().then(() => remote.updateSettings(computed.patch, snapshot.revision)).then((result) => {
		      accept(unwrap(result));
		      setClearSecret(false);
		      setSecretDraft("");
		      setSaveState("saved");
		    }).catch((cause) => {
		      setSaveState("idle");
		      if (isConflictError(cause)) {
		        setConflict(true);
		        setError(null);
		      } else {
		        setError(messageOf(cause));
		      }
		    }).finally(() => {
		      setBusy(false);
		    });
		  };
		  const save = () => {
		    if (busy || snapshot == null || draft == null) return;
		    setError(null);
		    setNotice("");
		    setRiskDialog(null);
		    const invalid = validateDraft(draft, t);
		    const invalidKeys = ALL_FIELDS.filter((field) => invalid[field.key] != null).map((field) => field.key);
		    if (invalidKeys.length > 0) {
		      const firstKey = invalidKeys[0];
		      const group = GROUPS.find((item) => item.fields.some((field) => field.key === firstKey));
		      if (group != null) setPage(group.id);
		      setFocusTarget(firstKey);
		      return;
		    }
		    const risks = collectRisks(draft, snapshot.config, { clearSecret });
		    if (risks.length > 0) {
		      setRiskDialog(risks);
		      return;
		    }
		    commit();
		  };
		  const revert = () => {
		    if (snapshot == null) return;
		    setDraft(draftFromSnapshot(snapshot));
		    setSecretDraft("");
		    setClearSecret(false);
		    setTagInputs({});
		    setError(null);
		    setNotice("");
		    setRiskDialog(null);
		  };
		  const reload = () => {
		    setConflict(false);
		    setShowMine(false);
		    setSaveState("idle");
		    setError(null);
		    setNotice("");
		    refetch();
		  };
		  const markEdited = () => {
		    if (saveState === "saved") setSaveState("idle");
		  };
		  const resetField = (field) => {
		    if (draft == null) return;
		    markEdited();
		    setDraft(Object.assign({}, draft, { [field.key]: snapshotValueToDraft(field, DEFAULTS[field.key]) }));
		  };
		  const commitTags = (field, text) => {
		    if (draft == null) return;
		    markEdited();
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
		    status: status.status,
		    statusAvailable: status.available,
		    statusError: status.error,
		    onRefreshStatus: () => {
		      loadStatus();
		    },
		    secretSet,
		    clearSecret,
		    tagInputs,
		    workspace,
		    busy,
		    saveState,
		    conflict,
		    conflictShowMine: showMine,
		    riskDialog,
		    onPageChange: (next) => {
		      setPage(next);
		      setQuery("");
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
		    onReload: () => {
		      reload();
		    },
		    onToggleMine: () => {
		      setShowMine(!showMine);
		    },
		    onRiskCancel: () => {
		      setRiskDialog(null);
		    },
		    onRiskConfirm: () => {
		      setRiskDialog(null);
		      commit();
		    },
		    onMatrixChange: (id, scope, enabled) => {
		      if (busy || config == null || !Array.isArray(config.ownerDeny)) return;
		      markEdited();
		      setDraft((previous) => previous == null ? previous : { ...previous, ...setMatrixState(previous, id, scope, enabled) });
		    },
		    onChange: (field, next) => {
		      if (draft == null) return;
		      markEdited();
		      setDraft(Object.assign({}, draft, { [field.key]: next }));
		    },
		    onSecretChange: (nextText) => {
		      markEdited();
		      setSecretDraft(nextText);
		      if (draft == null) return;
		      setDraft(Object.assign({}, draft, { accessToken: nextText }));
		    },
		    onClearSecretChange: (next) => {
		      markEdited();
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
		      markEdited();
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
		          markEdited();
		          setDraft(fillWorkspacePath(draft, path));
		        }
		      });
		    }
		  });
		}

		// src/client/index.ts
		var inject = ["slots", "locale", "remote"];
		function fallbackTranslate4(key) {
		  return zh[key] != null ? zh[key] : key;
		}
		function panelRender(remote, embedded) {
		  return (props) => {
		    const hostProps = props == null ? {} : props;
		    const t = typeof hostProps.t === "function" ? hostProps.t : fallbackTranslate4;
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
