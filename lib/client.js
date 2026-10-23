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
		  DEFAULTS: () => DEFAULTS,
		  GROUPS: () => GROUPS,
		  GROUP_KEYS: () => GROUP_KEYS,
		  ONEBOT_SETTINGS_DESCRIPTORS: () => ONEBOT_SETTINGS_DESCRIPTORS,
		  ONEBOT_SETTINGS_REMOTE: () => ONEBOT_SETTINGS_REMOTE,
		  OnebotSettingsPanel: () => OnebotSettingsPanel,
		  apply: () => apply,
		  coerceValue: () => coerceValue,
		  computePatch: () => computePatch,
		  draftFromSnapshot: () => draftFromSnapshot,
		  fillWorkspacePath: () => fillWorkspacePath,
		  inject: () => inject,
		  isConflictError: () => isConflictError,
		  renderGroup: () => renderGroup,
		  renderWorkspacePicker: () => renderWorkspacePicker,
		  snapshotValueToDraft: () => snapshotValueToDraft,
		  unwrap: () => unwrap
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

		// src/client/styles.ts
		var CSS = [
		  ".obx-panel{display:flex;flex-direction:column;gap:16px;font-size:14px;line-height:1.5}",
		  ".obx-title{font-size:16px;font-weight:600;margin:0}",
		  ".obx-desc{opacity:.72;margin:4px 0 0}",
		  ".obx-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
		  ".obx-spacer{flex:1}",
		  ".obx-meta{opacity:.72;font-size:12px}",
		  ".obx-error{border:1px solid #e5484d;background:rgba(229,72,77,.08);color:#e5484d;border-radius:8px;padding:8px 12px}",
		  ".obx-alert[role=alert]{white-space:pre-wrap}",
		  ".obx-notice{opacity:.85;min-height:1em}",
		  ".obx-effect{border:1px dashed rgba(128,128,128,.45);border-radius:8px;padding:8px 12px;opacity:.85}",
		  ".obx-warn{color:#d97706}",
		  ".obx-group{display:flex;flex-direction:column;gap:10px;border-top:1px solid rgba(128,128,128,.2);padding-top:12px}",
		  ".obx-group-title{font-weight:600;margin:0}",
		  ".obx-field{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}",
		  ".obx-label{font-size:12px;opacity:.8;min-width:180px}",
		  ".obx-control{display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex:1;min-width:240px}",
		  ".obx-input,.obx-select,.obx-textarea{flex:1;min-width:160px;max-width:420px;box-sizing:border-box;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent;color:inherit;padding:6px 8px;font:inherit}",
		  ".obx-textarea{max-width:520px;min-height:56px;resize:vertical}",
		  ".obx-toggle{display:inline-flex;align-items:center;gap:6px}",
		  ".obx-hint{opacity:.65;font-size:12px;flex-basis:100%}",
		  ".obx-secret-badge{font-size:11px;border:1px solid rgba(128,128,128,.4);border-radius:999px;padding:0 8px;opacity:.8}",
		  ".obx-badge{font-size:11px;border:1px solid rgba(128,128,128,.4);border-radius:999px;padding:0 8px;opacity:.8}",
		  ".obx-btn{cursor:pointer;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent;color:inherit;padding:4px 10px}",
		  ".obx-btn:hover:not(:disabled){border-color:currentColor}",
		  ".obx-btn:disabled{opacity:.45;cursor:not-allowed}",
		  ".obx-btn.primary{border-color:currentColor;font-weight:600}"
		].join("\n");

		// src/client/i18n.ts
		var zh = {
		  "settings.nav": "QQ Bot（OneBot）",
		  "settings.title": "QQ Bot（OneBot）设置",
		  "settings.desc": "配置持久化为 profile 层 cordis.patch.yml 中 QQ 插件条目的 config 覆盖行，与手改 patch、宿主原生设置页同源。",
		  "settings.loading": "正在加载设置…",
		  "settings.reload": "重新加载",
		  "settings.reset": "恢复默认值",
		  "save.submit": "保存设置",
		  "save.saving": "正在保存…",
		  "save.done": "设置已保存。保存即热生效：插件秒级重启，QQ 桥会自动重连。",
		  "save.noChanges": "没有需要保存的变更。",
		  "save.badNumber": "数字字段不合法：{keys}",
		  "effect.hint": "保存即热生效（无需重启宿主）：插件秒级原地重启，QQ 桥会自动重连；在途回合中断、频控窗口与中间消息缓冲清零，会话映射/历史不受影响。",
		  "effect.entryInactive": "QQ 插件条目当前未激活，保存后可能无法生效，请检查插件加载状态。",
		  "secret.set": "已配置（脱敏，不回显）",
		  "secret.unset": "未配置",
		  "secret.placeholder": "留空 = 不修改",
		  "secret.clear": "清除已保存的 AccessToken",
		  "conflict.title": "保存冲突：设置已被其他来源修改（revision 不一致），已重新拉取最新配置，请检查后重试。",
		  "status.error": "出错",
		  "revision.label": "revision"
		};
		var en = {
		  "settings.nav": "QQ Bot (OneBot)",
		  "settings.title": "QQ Bot (OneBot) settings",
		  "settings.desc": "Settings persist as the config override row of the QQ plugin entry in the profile-layer cordis.patch.yml — same source as hand-edited patches and the host's native settings page.",
		  "settings.loading": "Loading settings…",
		  "settings.reload": "Reload",
		  "settings.reset": "Reset to defaults",
		  "save.submit": "Save settings",
		  "save.saving": "Saving…",
		  "save.done": "Settings saved. Hot-applied on save: the plugin restarts within seconds and the QQ bridge reconnects automatically.",
		  "save.noChanges": "Nothing to save.",
		  "save.badNumber": "Invalid number fields: {keys}",
		  "effect.hint": "Hot-applied on save (no host restart): the plugin fiber restarts in place within seconds; the QQ bridge reconnects automatically. In-flight turns are interrupted and rate-limit windows/interim buffers reset; session mappings and history are unaffected.",
		  "effect.entryInactive": "The QQ plugin entry is currently inactive; saving may not take effect. Check the plugin's load state.",
		  "secret.set": "Configured (redacted, never echoed)",
		  "secret.unset": "Not configured",
		  "secret.placeholder": "Leave empty = keep current",
		  "secret.clear": "Clear the saved AccessToken",
		  "conflict.title": "Save conflict: settings were changed by another source (revision mismatch). The latest snapshot has been re-fetched — review and retry.",
		  "status.error": "Error",
		  "revision.label": "revision"
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
		  return {
		    parse(value) {
		      if (value === null || typeof value !== "object" || Array.isArray(value)) {
		        throw new TypeError("expected object");
		      }
		      const source = value;
		      const out = {};
		      for (const key of Object.keys(shape)) out[key] = shape[key].parse(source[key]);
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
		var configSchema = vObject({
		  host: vString(0, 256),
		  port: vNumber(),
		  accessToken: vString(0, 256),
		  botQQ: vString(0, 64),
		  workspacePath: vString(0, 1024),
		  attachWorkspaceMode: vEnum(["existing", "auto", "off"]),
		  requireMention: vBoolean(),
		  adminUsers: vArray(vString(0, 64)),
		  dmPolicy: vEnum(["open", "allowlist", "disabled"]),
		  groupPolicy: vEnum(["open", "allowlist", "disabled"]),
		  allowAllUsers: vBoolean(),
		  allowFrom: vArray(vString(0, 64)),
		  groupAllowFrom: vArray(vString(0, 64)),
		  interimMessages: vBoolean(),
		  interimRecall: vBoolean(),
		  interimRecallMs: vNumber(),
		  sendErrorNotice: vBoolean(),
		  unknownCommand: vEnum(["intercept", "passthrough"]),
		  rateLimitPerMinute: vNumber(),
		  newMessagePolicy: vEnum(["queue", "steer"]),
		  autoSteerPolicy: vEnum(["admin", "all"]),
		  deferredTimeoutMs: vNumber(),
		  actionAuditEnabled: vBoolean(),
		  traceEnabled: vBoolean(),
		  humanTypingPace: vBoolean(),
		  typingDelayPerCharMs: vNumber(),
		  typingDelayMinMs: vNumber(),
		  typingDelayMaxMs: vNumber(),
		  groupSplitLines: vBoolean(),
		  ownerTitle: vString(0, 1024),
		  agentPreset: vString(0, 1024),
		  adminPreset: vString(0, 1024),
		  adminPermission: vString(0, 1024),
		  adminWorkspacePath: vString(0, 1024),
		  splitLines: vBoolean(),
		  splitMaxMessages: vNumber(),
		  textImageThreshold: vNumber(),
		  inboundImageMaxPx: vNumber(),
		  autoAcceptAdminRequests: vBoolean(),
		  autoAllowInvitedGroups: vBoolean(),
		  idleResetHours: vNumber(),
		  privateResetDays: vNumber(),
		  groupResetDays: vNumber(),
		  publicMemoryFile: vString(0, 1024),
		  publicMemoryMaxBytes: vNumber(),
		  groupMemoryDir: vString(0, 1024),
		  groupMemoryMaxBytes: vNumber(),
		  sessionTitleTemplate: vString(0, 1024),
		  proactiveEnabled: vBoolean(),
		  proactiveChatId: vString(0, 1024),
		  proactiveWindowStart: vString(0, 1024),
		  proactiveWindowEnd: vString(0, 1024),
		  proactiveMinPerDay: vNumber(),
		  proactiveMaxPerDay: vNumber(),
		  proactiveMinGapMinutes: vNumber(),
		  proactiveSkipIfActiveMinutes: vNumber(),
		  proactiveMaxUnanswered: vNumber()
		});
		var snapshotSchema = vObject({
		  revision: vInt(0),
		  entryActive: vBoolean(),
		  config: configSchema,
		  secrets: vArray(vObject({ path: vArray(vString(1, 64)), set: vBoolean() })),
		  groups: vObject({
		    connection: vArray(vString(1, 64)),
		    permissions: vArray(vString(1, 64)),
		    behavior: vArray(vString(1, 64)),
		    diagnostics: vArray(vString(1, 64)),
		    companion: vArray(vString(1, 64)),
		    memory: vArray(vString(1, 64)),
		    proactive: vArray(vString(1, 64))
		  }),
		  effect: vEnum(["restart"])
		  // 19 键统一插件级热重启
		});
		var patchSchema = vObject({
		  host: vOptional(vString(0, 256)),
		  port: vOptional(vNumber(1, 65535)),
		  accessToken: vOptional(vString(0, 256)),
		  botQQ: vOptional(vString(0, 64)),
		  workspacePath: vOptional(vString(0, 1024)),
		  attachWorkspaceMode: vOptional(vEnum(["existing", "auto", "off"])),
		  requireMention: vOptional(vBoolean()),
		  adminUsers: vOptional(vArray(vString(0, 64))),
		  dmPolicy: vOptional(vEnum(["open", "allowlist", "disabled"])),
		  groupPolicy: vOptional(vEnum(["open", "allowlist", "disabled"])),
		  allowAllUsers: vOptional(vBoolean()),
		  allowFrom: vOptional(vArray(vString(0, 64))),
		  groupAllowFrom: vOptional(vArray(vString(0, 64))),
		  interimMessages: vOptional(vBoolean()),
		  interimRecall: vOptional(vBoolean()),
		  interimRecallMs: vOptional(vNumber(0)),
		  sendErrorNotice: vOptional(vBoolean()),
		  unknownCommand: vOptional(vEnum(["intercept", "passthrough"])),
		  rateLimitPerMinute: vOptional(vNumber(0)),
		  newMessagePolicy: vOptional(vEnum(["queue", "steer"])),
		  autoSteerPolicy: vOptional(vEnum(["admin", "all"])),
		  deferredTimeoutMs: vOptional(vNumber(0)),
		  actionAuditEnabled: vOptional(vBoolean()),
		  traceEnabled: vOptional(vBoolean()),
		  humanTypingPace: vOptional(vBoolean()),
		  typingDelayPerCharMs: vOptional(vNumber(0)),
		  typingDelayMinMs: vOptional(vNumber(0)),
		  typingDelayMaxMs: vOptional(vNumber(0)),
		  groupSplitLines: vOptional(vBoolean()),
		  ownerTitle: vOptional(vString(0, 1024)),
		  agentPreset: vOptional(vString(0, 1024)),
		  adminPreset: vOptional(vString(0, 1024)),
		  adminPermission: vOptional(vString(0, 1024)),
		  adminWorkspacePath: vOptional(vString(0, 1024)),
		  splitLines: vOptional(vBoolean()),
		  splitMaxMessages: vOptional(vNumber(0)),
		  textImageThreshold: vOptional(vNumber(0)),
		  inboundImageMaxPx: vOptional(vNumber(0)),
		  autoAcceptAdminRequests: vOptional(vBoolean()),
		  autoAllowInvitedGroups: vOptional(vBoolean()),
		  idleResetHours: vOptional(vNumber(0)),
		  privateResetDays: vOptional(vNumber(0)),
		  groupResetDays: vOptional(vNumber(0)),
		  publicMemoryFile: vOptional(vString(0, 1024)),
		  publicMemoryMaxBytes: vOptional(vNumber(0)),
		  groupMemoryDir: vOptional(vString(0, 1024)),
		  groupMemoryMaxBytes: vOptional(vNumber(0)),
		  sessionTitleTemplate: vOptional(vString(0, 1024)),
		  proactiveEnabled: vOptional(vBoolean()),
		  proactiveChatId: vOptional(vString(0, 1024)),
		  proactiveWindowStart: vOptional(vString(0, 1024)),
		  proactiveWindowEnd: vOptional(vString(0, 1024)),
		  proactiveMinPerDay: vOptional(vNumber(0)),
		  proactiveMaxPerDay: vOptional(vNumber(0)),
		  proactiveMinGapMinutes: vOptional(vNumber(0)),
		  proactiveSkipIfActiveMinutes: vOptional(vNumber(0)),
		  proactiveMaxUnanswered: vOptional(vNumber(0))
		});
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
		var GROUPS = [
		  {
		    id: "connection",
		    title: "连接",
		    fields: [
		      { key: "host", label: "监听地址", type: "string", hint: "NapCat 反向 WebSocket 连接的地址，一般保持 127.0.0.1。" },
		      { key: "port", label: "监听端口", type: "number", hint: "NapCat 反向 WebSocket 连接的端口。" },
		      { key: "accessToken", label: "访问令牌（AccessToken）", type: "secret", hint: "与 NapCat 侧一致的鉴权令牌；留空 = 不修改，勾选清除后保存 = 清空。" },
		      { key: "botQQ", label: "机器人 QQ 号", type: "string" },
		      // workspacePath 入面板（connection 组键序追加）。语义（对齐 README「会话工作区选择」）：
		      // 修改只对新会话生效；已设 per-chat /workspace 覆盖的会话不受影响。
		      { key: "workspacePath", label: "会话默认工作区路径", type: "string", hint: "QQ 会话的工作区目录；保存后仅对新会话生效，已用 /workspace 设置 per-chat 覆盖的会话不受影响。留空 = 宿主进程工作目录。管理员私聊优先用 adminWorkspacePath，开了群记忆（groupMemoryDir）的群聊用 <群记忆目录>/<群号>，这两类会话不受本项影响。（配置键 workspacePath）" },
		      // 会话归入 DSH 工作区的方式（网页会话列表按工作区分组）；已有会话可发 /workspace attach 立即补挂。
		      { key: "attachWorkspaceMode", label: "会话归入工作区", type: "enum", options: ["existing", "auto", "off"], optionLabels: { existing: "只归入已有的", auto: "自动为每个聊天建", off: "不归入" }, hint: "QQ 会话怎么归入 DSH 工作区（网页会话列表按工作区分组）：只归入已有的 = 已有工作区的目录就归入（另外为 workspacePath 自动建一个）；自动为每个聊天建 = 群聊、私聊各自的工作目录也自动建工作区（每个群一个）；不归入 = 不碰工作区。已有会话在 QQ 里发 /workspace attach 可立即补挂。（配置键 attachWorkspaceMode）" }
		    ]
		  },
		  {
		    id: "permissions",
		    title: "权限",
		    fields: [
		      { key: "requireMention", label: "群聊必须 @ 机器人", type: "boolean" },
		      { key: "adminUsers", label: "管理员用户列表", type: "stringArray", hint: "每行一个 QQ 号。" },
		      { key: "dmPolicy", label: "私聊策略", type: "enum", options: ["open", "allowlist", "disabled"], optionLabels: { open: "开放", allowlist: "白名单", disabled: "禁用" } },
		      { key: "groupPolicy", label: "群聊策略", type: "enum", options: ["open", "allowlist", "disabled"], optionLabels: { open: "开放", allowlist: "白名单", disabled: "禁用" } },
		      { key: "allowAllUsers", label: "允许所有用户", type: "boolean", hint: "关闭时仅管理员可触发。" },
		      { key: "allowFrom", label: "私聊白名单", type: "stringArray", hint: "每行一个 QQ 号，仅白名单策略生效。" },
		      { key: "groupAllowFrom", label: "群聊白名单", type: "stringArray", hint: "每行一个群号，仅白名单策略生效。" }
		    ]
		  },
		  {
		    id: "behavior",
		    title: "行为",
		    fields: [
		      { key: "interimMessages", label: "中间消息", type: "boolean", hint: "回合进行中发送流式中间消息。" },
		      { key: "interimRecall", label: "自动撤回中间消息", type: "boolean" },
		      { key: "interimRecallMs", label: "中间消息保留时长（毫秒）", type: "number" },
		      { key: "sendErrorNotice", label: "发送错误通知", type: "boolean" },
		      { key: "unknownCommand", label: "未知命令处理", type: "enum", options: ["intercept", "passthrough"], optionLabels: { intercept: "拦截", passthrough: "透传" } },
		      { key: "rateLimitPerMinute", label: "每分钟消息频率上限", type: "number" },
		      { key: "newMessagePolicy", label: "任务运行中的新消息", type: "enum", options: ["queue", "steer"], optionLabels: { queue: "排队", steer: "插话" }, hint: "任务运行中收到新普通消息：排队=当前任务结束后按序处理（每回合至多提示一次）；插话=作为补充指令加入当前任务。图片/文件/语音/引用消息与受限用户始终按排队处理。（配置键 newMessagePolicy）" },
		      { key: "autoSteerPolicy", label: "自动插话资格", type: "enum", options: ["admin", "all"], optionLabels: { admin: "仅管理员", all: "所有成员" }, hint: "插话模式下运行中收到的新普通纯文字消息谁可自动插话：仅管理员（默认）或所有成员。不具备资格的消息按排队处理；/steer 命令始终仅管理员；受限用户任何档都不自动插话。（配置键 autoSteerPolicy）" },
		      { key: "deferredTimeoutMs", label: "等待模型回复超时（毫秒）", type: "number", hint: "回合超过该时长无任何模型输出时提示超时并登记补发跟踪，任务完成后自动补发最终文字（超时补发）；发送失败最多重试 3 次，结果不确定时停止自动重试；/stop 终止该聊天的补发跟踪。0=关闭。（配置键 deferredTimeoutMs）" }
		    ]
		  },
		  {
		    id: "diagnostics",
		    title: "诊断",
		    fields: [
		      { key: "actionAuditEnabled", label: "工具发送审计", type: "boolean", hint: "她用工具主动发出的图片、语音、文件、合并转发，每条都记一行到 qq-actions.log；关闭后不再留这份记录，发送本身不受影响。（配置键 actionAuditEnabled）" },
		      { key: "traceEnabled", label: "决策追踪（trace）", type: "boolean", hint: "把每个入站/出站决策事件写入 qq-trace.jsonl 便于排查；关闭后零文件、行为与关闭时完全一致。（配置键 traceEnabled）" }
		    ]
		  },
		  {
		    id: "companion",
		    title: "陪伴",
		    fields: [
		      { key: "ownerTitle", label: "对主人的称呼", type: "string", hint: "系统提示和通知里怎么称呼管理员，例如“主人”。（配置键 ownerTitle）" },
		      { key: "agentPreset", label: "QQ 会话默认预设", type: "string", hint: "群聊和其他人用的 dsh 预设 id；留空 = 宿主默认预设。（配置键 agentPreset）" },
		      { key: "adminPreset", label: "管理员私聊预设", type: "string", hint: "管理员私聊的新会话用这个预设；留空 = 同上。（配置键 adminPreset）" },
		      { key: "adminPermission", label: "管理员私聊权限预设", type: "string", hint: "管理员私聊每个新会话自动切到的宿主权限预设，例如 danger-full-access；留空 = 不切。（配置键 adminPermission）" },
		      { key: "adminWorkspacePath", label: "管理员私聊工作目录", type: "string", hint: "管理员私聊的会话工作目录（私密记忆所在目录）；留空 = 会话默认工作区。设置后覆盖 workspacePath：管理员私聊会话用这个目录，不受「会话默认工作区路径」影响。（配置键 adminWorkspacePath）" },
		      { key: "splitLines", label: "一句一条", type: "boolean", hint: "最终回复按行拆成多条 QQ 消息发送。（配置键 splitLines）" },
		      { key: "splitMaxMessages", label: "最多拆成几条", type: "number", hint: "超过就整段发。（配置键 splitMaxMessages）" },
		      { key: "textImageThreshold", label: "长回复转图片的字数", type: "number", hint: "超过这个字数渲染成图片卡片；0 = 永远发文字。（配置键 textImageThreshold）" },
		      { key: "inboundImageMaxPx", label: "收到的图片压到多大（像素）", type: "number", hint: "长边超过就缩小再给模型看，省 token。（配置键 inboundImageMaxPx）" },
		      { key: "autoAcceptAdminRequests", label: "自动同意管理员的好友/拉群请求", type: "boolean", hint: "别人的请求不同意，会私聊告诉管理员。（配置键 autoAcceptAdminRequests）" },
		      { key: "autoAllowInvitedGroups", label: "管理员拉进的群自动加白名单", type: "boolean", hint: "（配置键 autoAllowInvitedGroups）" },
		      { key: "groupSplitLines", label: "群里也一句一条", type: "boolean", hint: "关掉后群里每次回复只发一条，发送量少很多，降低 QQ 风控概率。（配置键 groupSplitLines）" },
		      { key: "humanTypingPace", label: "所有消息按真人打字速度发", type: "boolean", hint: "每条消息发出前按字数等“打字”时间，整个小号同一时间只打一条，几个会话同时回复时自然排队。（配置键 humanTypingPace）" },
		      { key: "typingDelayPerCharMs", label: "每个字的打字时间（毫秒）", type: "number", hint: "（配置键 typingDelayPerCharMs）" },
		      { key: "typingDelayMinMs", label: "一条消息最短打字时间（毫秒）", type: "number", hint: "（配置键 typingDelayMinMs）" },
		      { key: "typingDelayMaxMs", label: "一条消息最长打字时间（毫秒）", type: "number", hint: "太长的消息也不会等超过这个时间。（配置键 typingDelayMaxMs）" }
		    ]
		  },
		  {
		    id: "memory",
		    title: "记忆与会话",
		    fields: [
		      { key: "idleResetHours", label: "空闲多久换新会话（小时）", type: "number", hint: "超过这么久没说话，下一条消息开新会话并附最近几句交接；0 = 关。（配置键 idleResetHours）" },
		      { key: "privateResetDays", label: "私聊几天换一次会话", type: "number", hint: "按凌晨 4 点算天；0 = 关。（配置键 privateResetDays）" },
		      { key: "groupResetDays", label: "群聊几天换一次会话", type: "number", hint: "按凌晨 4 点算天；0 = 关。（配置键 groupResetDays）" },
		      { key: "publicMemoryFile", label: "公开记忆文件", type: "string", hint: "所有会话都读的记忆文件路径（AGENTS.md）。（配置键 publicMemoryFile）" },
		      { key: "publicMemoryMaxBytes", label: "公开记忆上限（字节）", type: "number", hint: "满了群里就不再追加。（配置键 publicMemoryMaxBytes）" },
		      { key: "groupMemoryDir", label: "每群一份记忆的目录", type: "string", hint: "<目录>/<群号>/AGENTS.md，群会话以此为工作目录；留空 = 所有群共用公开记忆。设置后覆盖 workspacePath：群会话用 <目录>/<群号>，不受「会话默认工作区路径」影响。（配置键 groupMemoryDir）" },
		      { key: "groupMemoryMaxBytes", label: "每群记忆上限（字节）", type: "number", hint: "（配置键 groupMemoryMaxBytes）" },
		      { key: "sessionTitleTemplate", label: "会话标题模板", type: "string", hint: "新建 QQ 会话（以及恢复时还没有标题的旧会话）的网页标题，可用 {kind} {target} {nickname} {date} {time}；已有标题（比如在网页上手动改过）的不会被覆盖，留空 = 不自动命名。（配置键 sessionTitleTemplate）" }
		    ]
		  },
		  {
		    id: "proactive",
		    title: "主动聊天",
		    fields: [
		      { key: "proactiveEnabled", label: "开启主动聊天", type: "boolean", hint: "每天在时间窗内随机叫醒几次，她自己决定发不发。（配置键 proactiveEnabled）" },
		      { key: "proactiveChatId", label: "主动找谁", type: "string", hint: "会话 id，例如 private:QQ号。（配置键 proactiveChatId）" },
		      { key: "proactiveWindowStart", label: "时间窗开始", type: "string", hint: "HH:MM。（配置键 proactiveWindowStart）" },
		      { key: "proactiveWindowEnd", label: "时间窗结束", type: "string", hint: "HH:MM。（配置键 proactiveWindowEnd）" },
		      { key: "proactiveMinPerDay", label: "每天至少几次", type: "number", hint: "（配置键 proactiveMinPerDay）" },
		      { key: "proactiveMaxPerDay", label: "每天最多几次", type: "number", hint: "（配置键 proactiveMaxPerDay）" },
		      { key: "proactiveMinGapMinutes", label: "两次之间至少隔几分钟", type: "number", hint: "（配置键 proactiveMinGapMinutes）" },
		      { key: "proactiveSkipIfActiveMinutes", label: "刚聊过几分钟内跳过", type: "number", hint: "（配置键 proactiveSkipIfActiveMinutes）" },
		      { key: "proactiveMaxUnanswered", label: "几条没回就当天停止", type: "number", hint: "（配置键 proactiveMaxUnanswered）" }
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
		  requireMention: true,
		  adminUsers: [],
		  dmPolicy: "open",
		  groupPolicy: "open",
		  allowAllUsers: false,
		  allowFrom: [],
		  groupAllowFrom: [],
		  interimMessages: true,
		  interimRecall: true,
		  interimRecallMs: 9e4,
		  sendErrorNotice: true,
		  unknownCommand: "intercept",
		  rateLimitPerMinute: 30,
		  newMessagePolicy: "queue",
		  autoSteerPolicy: "admin",
		  deferredTimeoutMs: 6e5,
		  actionAuditEnabled: true,
		  traceEnabled: false,
		  humanTypingPace: false,
		  typingDelayPerCharMs: 80,
		  typingDelayMinMs: 500,
		  typingDelayMaxMs: 2500,
		  groupSplitLines: true,
		  ownerTitle: "管理员",
		  agentPreset: "",
		  adminPreset: "",
		  adminPermission: "",
		  adminWorkspacePath: "",
		  splitLines: false,
		  splitMaxMessages: 6,
		  textImageThreshold: 150,
		  inboundImageMaxPx: 2048,
		  autoAcceptAdminRequests: false,
		  autoAllowInvitedGroups: false,
		  idleResetHours: 0,
		  privateResetDays: 0,
		  groupResetDays: 0,
		  publicMemoryFile: "",
		  publicMemoryMaxBytes: 6144,
		  groupMemoryDir: "",
		  groupMemoryMaxBytes: 8192,
		  sessionTitleTemplate: "{kind} {target} · {date}",
		  proactiveEnabled: false,
		  proactiveChatId: "",
		  proactiveWindowStart: "09:00",
		  proactiveWindowEnd: "22:00",
		  proactiveMinPerDay: 4,
		  proactiveMaxPerDay: 6,
		  proactiveMinGapMinutes: 90,
		  proactiveSkipIfActiveMinutes: 30,
		  proactiveMaxUnanswered: 2
		};
		var GROUP_KEYS = {};
		for (const group of GROUPS) GROUP_KEYS[group.id] = group.fields.map((field) => field.key);

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
		function snapshotValueToDraft(field, value) {
		  if (field.type === "secret") return "";
		  if (field.type === "stringArray") return Array.isArray(value) ? value.join("\n") : "";
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
		    return String(raw == null ? "" : raw).split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
		  }
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

		// src/client/render.ts
		function h(ReactImpl2, tag, props, ...children) {
		  return ReactImpl2.createElement(tag, props, ...children);
		}
		function renderGroup(ReactImpl2, group, opts) {
		  const options = opts == null ? {} : opts;
		  const draft = options.draft == null ? {} : options.draft;
		  const nonDefaultKeys = Array.isArray(options.nonDefaultKeys) ? options.nonDefaultKeys : [];
		  const onChange = typeof options.onChange === "function" ? options.onChange : () => {
		  };
		  const onSecretChange = typeof options.onSecretChange === "function" ? options.onSecretChange : () => {
		  };
		  const onClearSecretChange = typeof options.onClearSecretChange === "function" ? options.onClearSecretChange : () => {
		  };
		  const fieldNodes = group.fields.map((field) => {
		    const value = draft[field.key];
		    let control;
		    if (field.type === "boolean") {
		      control = h(
		        ReactImpl2,
		        "label",
		        { className: "obx-toggle" },
		        h(ReactImpl2, "input", {
		          type: "checkbox",
		          checked: value === true,
		          disabled: options.disabled === true,
		          onChange: (event) => {
		            onChange(field, event.target.checked);
		          }
		        }),
		        value === true ? "开" : "关"
		      );
		    } else if (field.type === "enum") {
		      const options_ = field.options ?? [];
		      const optionLabels = field.optionLabels ?? {};
		      control = h(ReactImpl2, "select", {
		        className: "obx-select",
		        value: String(value == null ? "" : value),
		        disabled: options.disabled === true,
		        onChange: (event) => {
		          onChange(field, event.target.value);
		        },
		        "aria-label": field.label
		      }, options_.map((option) => h(ReactImpl2, "option", { key: option, value: option }, optionLabels[option] != null ? optionLabels[option] : option)));
		    } else if (field.type === "stringArray") {
		      control = h(ReactImpl2, "textarea", {
		        className: "obx-textarea",
		        rows: 3,
		        value: String(value == null ? "" : value),
		        disabled: options.disabled === true,
		        placeholder: "每行一个",
		        onChange: (event) => {
		          onChange(field, event.target.value);
		        },
		        "aria-label": field.label
		      });
		    } else if (field.type === "secret") {
		      control = h(
		        ReactImpl2,
		        "span",
		        { className: "obx-control" },
		        h(ReactImpl2, "input", {
		          type: "password",
		          className: "obx-input",
		          value: String(value == null ? "" : value),
		          placeholder: "留空 = 不修改",
		          autoComplete: "new-password",
		          disabled: options.disabled === true,
		          onChange: (event) => {
		            onSecretChange(event.target.value);
		          },
		          "aria-label": field.label
		        }),
		        h(ReactImpl2, "span", { className: "obx-secret-badge" }, options.secretSet === true ? "已配置（脱敏，不回显）" : "未配置"),
		        h(
		          ReactImpl2,
		          "label",
		          { className: "obx-toggle" },
		          h(ReactImpl2, "input", {
		            type: "checkbox",
		            checked: options.clearSecret === true,
		            disabled: options.disabled === true,
		            onChange: (event) => {
		              onClearSecretChange(event.target.checked);
		            }
		          }),
		          "清除已保存的 AccessToken"
		        )
		      );
		    } else {
		      control = h(ReactImpl2, "input", {
		        type: "text",
		        className: "obx-input",
		        value: String(value == null ? "" : value),
		        disabled: options.disabled === true,
		        onChange: (event) => {
		          onChange(field, event.target.value);
		        },
		        "aria-label": field.label
		      });
		    }
		    const nodes = [
		      h(
		        ReactImpl2,
		        "div",
		        { className: "obx-field", key: field.key },
		        h(ReactImpl2, "span", { className: "obx-label" }, field.label),
		        // W6「非默认」徽标：快照生效值 ≠ schema 默认值时标注，帮助一眼识别改过
		        // 哪些开关；「待重启」徽标不适用本插件——保存经宿主 configEditor.edit
		        // 热生效（整条 fiber 秒级原地重启），不存在键级「配置文件值≠生效值」稳态。
		        nonDefaultKeys.indexOf(field.key) >= 0 ? h(ReactImpl2, "span", { className: "obx-badge", title: "与默认值不同" }, "非默认") : null,
		        control,
		        field.hint != null ? h(ReactImpl2, "span", { className: "obx-hint" }, field.hint) : null
		      )
		    ];
		    if (typeof options.renderExtraRow === "function") {
		      const extra = options.renderExtraRow(field);
		      if (extra != null) nodes.push(extra);
		    }
		    return nodes;
		  });
		  return h(
		    ReactImpl2,
		    "section",
		    { className: "obx-group", "data-group": group.id },
		    h(ReactImpl2, "h3", { className: "obx-group-title" }, group.title),
		    fieldNodes
		  );
		}
		function renderWorkspacePicker(ReactImpl2, opts) {
		  const options = opts == null ? {} : opts;
		  if (options.loaded !== true) return null;
		  const workspaces = Array.isArray(options.workspaces) ? options.workspaces : [];
		  if (options.available !== true || workspaces.length === 0) {
		    return h(
		      ReactImpl2,
		      "p",
		      { className: "obx-hint obx-workspace-empty" },
		      options.available === true ? "暂无 workspace 记录，可直接输入路径。" : "无法获取 workspace 列表（宿主未提供 workspace 注册表），可直接输入路径。"
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
		    { className: "obx-workspace-row", "data-role": "workspace-picker" },
		    h(ReactImpl2, "span", { className: "obx-label" }, "快速填入 workspace"),
		    h(
		      ReactImpl2,
		      "select",
		      {
		        className: "obx-select",
		        value: selectedId,
		        disabled,
		        "aria-label": "快速填入 workspace",
		        title: "列出宿主 workspace 注册表中的工作区；选中后点「填入」写入上方路径输入框（只填值，保存仍走「保存设置」按钮）",
		        onChange: (event) => {
		          const onSelectedChange = options.onSelectedChange;
		          if (typeof onSelectedChange === "function") onSelectedChange(event.target.value);
		        }
		      },
		      h(ReactImpl2, "option", { key: "", value: "" }, "选择 workspace…"),
		      workspaces.map((workspace) => {
		        const label = String(workspace.path == null ? "" : workspace.path) + "（" + String(workspace.sessionCount == null ? 0 : workspace.sessionCount) + " 会话）";
		        return h(ReactImpl2, "option", { key: String(workspace.id), value: String(workspace.id) }, label);
		      })
		    ),
		    h(ReactImpl2, "button", {
		      className: "obx-btn",
		      type: "button",
		      disabled: disabled || selected == null,
		      onClick: () => {
		        const onApply = options.onApply;
		        if (selected != null && typeof onApply === "function") onApply(selected.path);
		      }
		    }, "填入"),
		    h(ReactImpl2, "span", { className: "obx-hint" }, "选中后点「填入」仅写入上方输入框；需点「保存设置」才会保存（对新会话生效，已设 /workspace 覆盖的会话不受影响）。")
		  );
		}

		// src/client/panel.ts
		function OnebotSettingsPanel(props) {
		  const t = props.t;
		  const remote = props.remote;
		  const [snapshot, setSnapshot] = React.useState(null);
		  const [draft, setDraft] = React.useState(null);
		  const [secretDraft, setSecretDraft] = React.useState("");
		  const [clearSecret, setClearSecret] = React.useState(false);
		  const [busy, setBusy] = React.useState(false);
		  const [error, setError] = React.useState(null);
		  const [notice, setNotice] = React.useState("");
		  const [workspace, setWorkspace] = React.useState({ loaded: false, available: false, workspaces: [], selectedId: "" });
		  const accept = (next) => {
		    setSnapshot(next);
		    setDraft(draftFromSnapshot(next));
		  };
		  React.useEffect(() => {
		    let alive = true;
		    void remote.getSettings().then((result) => {
		      if (!alive) return;
		      accept(unwrap(result));
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
		      if (isConflictError(cause)) {
		        setError(t("conflict.title"));
		        refetch();
		      } else {
		        setError(messageOf(cause));
		      }
		    }).finally(() => {
		      setBusy(false);
		    });
		  };
		  if (snapshot === null || draft === null) {
		    return h(
		      React,
		      "div",
		      { className: "obx-panel" },
		      h(React, "p", { className: "obx-hint" }, t("settings.loading")),
		      error === null ? null : h(React, "div", { className: "obx-error", role: "alert" }, t("status.error") + "：" + error)
		    );
		  }
		  let secretSet = false;
		  if (Array.isArray(snapshot.secrets)) {
		    for (const secretEntry of snapshot.secrets) {
		      if (secretEntry != null && Array.isArray(secretEntry.path) && secretEntry.path.indexOf("accessToken") >= 0 && secretEntry.set === true) secretSet = true;
		    }
		  }
		  if (clearSecret === true) secretSet = false;
		  const nonDefaultKeys = [];
		  if (snapshot.config != null) {
		    for (const field of ALL_FIELDS) {
		      if (valueEquals(snapshot.config[field.key], DEFAULTS[field.key]) === false) nonDefaultKeys.push(field.key);
		    }
		  }
		  const changeHandlers = {
		    disabled: busy,
		    secretSet,
		    clearSecret,
		    nonDefaultKeys,
		    draft,
		    // workspacePath 字段行下方的「快速填入 workspace」行（独立于
		    // obx-field 行；onApply 只写草稿不保存——保存仍走 save() 显式通道）。
		    renderExtraRow: (field) => {
		      if (field.key !== "workspacePath") return null;
		      return renderWorkspacePicker(React, {
		        loaded: workspace.loaded,
		        available: workspace.available,
		        workspaces: workspace.workspaces,
		        selectedId: workspace.selectedId,
		        disabled: busy,
		        onSelectedChange: (nextId) => {
		          setWorkspace(Object.assign({}, workspace, { selectedId: nextId }));
		        },
		        onApply: (path) => {
		          setDraft(fillWorkspacePath(draft, path));
		        }
		      });
		    },
		    onChange: (field, nextValue) => {
		      setDraft(Object.assign({}, draft, { [field.key]: nextValue }));
		    },
		    onSecretChange: (nextText) => {
		      setSecretDraft(nextText);
		      setDraft(Object.assign({}, draft, { accessToken: nextText }));
		    },
		    onClearSecretChange: (nextChecked) => {
		      setClearSecret(nextChecked);
		    }
		  };
		  return h(
		    React,
		    "div",
		    { className: "obx-panel" },
		    h(React, "h2", { className: "obx-title" }, t("settings.title")),
		    h(React, "p", { className: "obx-desc" }, t("settings.desc")),
		    h(
		      React,
		      "div",
		      { className: "obx-toolbar" },
		      h(React, "span", { className: "obx-meta" }, t("revision.label") + " " + String(snapshot.revision)),
		      snapshot.entryActive === true ? null : h(React, "span", { className: "obx-meta obx-warn" }, t("effect.entryInactive")),
		      h(React, "span", { className: "obx-spacer" }),
		      h(React, "button", { className: "obx-btn", type: "button", disabled: busy, onClick: refetch }, t("settings.reload")),
		      h(React, "button", { className: "obx-btn", type: "button", disabled: busy, onClick: () => {
		        setDraft(draftFromDefaults());
		      } }, t("settings.reset")),
		      h(React, "button", { className: "obx-btn primary", type: "button", disabled: busy, onClick: save }, busy ? t("save.saving") : t("save.submit"))
		    ),
		    h(React, "div", { className: "obx-effect" }, t("effect.hint")),
		    GROUPS.map((group) => renderGroup(React, group, changeHandlers)),
		    error === null ? null : h(React, "div", { className: "obx-error", role: "alert" }, t("status.error") + "：" + error),
		    notice === "" ? null : h(React, "p", { className: "obx-notice" }, notice)
		  );
		}

		// src/client/index.ts
		var inject = ["slots", "locale", "remote"];
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
		    (props) => React.createElement(
		      OnebotSettingsPanel,
		      Object.assign({}, props, { remote })
		    )
		  ));
		  return () => {
		    void disposeRemote();
		  };
		}

		return module.exports;
	}
});
