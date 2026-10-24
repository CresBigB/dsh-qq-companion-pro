import type { CommandContext } from './types.js';
/** `/task` 入口（commands.ts 的 COMMANDS['task'].handler 指到这里）。 */
export declare function handleTaskCommand(ctx: CommandContext, chatId: string, arg: string): Promise<void>;
