/**
 * /memory — fuzzy search inside the current chat's own note library.
 *
 * One library per QQ number / group (see `src/memory-store.ts`), so this
 * command can never read another chat's notes: the chat id comes from the
 * session that sent the message, not from an argument.
 * @module dsh-qq-companion/commands/memory
 */
import type { ChatId } from '../chat.js';
import type { CommandContext } from './types.js';
/** Usage line shared by the empty-argument branch and /help. */
export declare const MEMORY_USAGE = "/memory <\u5173\u952E\u8BCD>";
export declare function handleMemoryCommand(ctx: CommandContext, chatId: ChatId, arg: string): Promise<void>;
