import type { Context } from '@deepseek-ai/cordis';
import type { ChatBridge } from './bridge.js';
/** 一次拼图最多摆几帧（默认值；参数上限见 {@link SHEET_MAX_FRAMES}）。 */
export declare const GIF_FRAMES_DEFAULT = 12;
/**
 * 注册 `qq_gif_frames`。
 * @param ctx - 注册作用域（工具随它销毁）。
 * @param bridge - 聊天桥（取媒体目录、发消息）。
 * @param allow - 能力层闸（`qq.send.image` 关掉时这个工具不注册）。
 * @returns 注销函数。
 */
export declare function registerGifTool(ctx: Context, bridge: ChatBridge, allow?: (toolName: string) => boolean): () => void;
