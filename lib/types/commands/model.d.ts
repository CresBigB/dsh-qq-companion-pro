/**
 * Model and environment commands: /model, /workspace and /preset.
 * @module dsh-qq-companion/commands/model
 */
import { CommandContext } from './types.js';
import { type ChatId } from '../chat.js';
/** /model: show the current model (+ discoverable providers), or switch.
 * A bare switch retargets ONLY this chat's selection ref (it no
 * longer rewrites the deployment default — that is the explicit --default
 * form's job). */
export declare function handleModelCommand(ctx: CommandContext, chatId: ChatId, arg: string): Promise<void>;
/** level-2 model list for one provider: renders the numbered models and
 * snapshots them (phase 'models') so the next `/model <序号>` hits the
 * original per-chat switch path with '<provider> <model>'. */
export declare function sendModelPickList(ctx: CommandContext, chatId: ChatId, provider: string): Promise<void>;
/** /workspace: show current cwd, list workspaces, or switch directory. */
export declare function handleWorkspaceCommand(ctx: CommandContext, chatId: ChatId, arg: string): Promise<void>;
/** /workspace attach: 立即给当前聊天的 live 会话重跑一次「归入工作区」。
 * 插件只在建会话/恢复会话时归入，运行中在网页上新增的工作区要等重启才会
 * 被认领——这个子命令就是手动补挂的入口（模式 existing 下也允许为该聊天
 * 自己的目录新建工作区；模式 off 时直接提示已关闭）。 */
export declare function handleWorkspaceAttachCommand(ctx: CommandContext, chatId: ChatId): Promise<void>;
/** /preset: show available agent presets and the current one, or switch. */
export declare function handlePresetCommand(ctx: CommandContext, chatId: ChatId, arg: string): Promise<void>;
