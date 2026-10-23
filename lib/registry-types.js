/** The mapping file name inside the media dir. */
export const MAPPING_FILE = 'chat-sessions.json';
/** 这个聊天新建工作区时用的标题：群聊「QQ群 <群号>」、私聊「QQ私聊 <QQ号>」。 */
export function workspaceTitleForChat(chatId) {
    if (chatId.startsWith('group:'))
        return 'QQ群 ' + chatId.slice('group:'.length);
    if (chatId.startsWith('private:'))
        return 'QQ私聊 ' + chatId.slice('private:'.length);
    return 'QQ ' + chatId;
}
/** build one mapping entry — a bare session id when the chat carries no
 * persisted settings, else an object
 * with the optional mode/goal/workspace fields. An empty workspacePath counts
 * as unset (never persisted). */
export function persistEntry(sessionId, goal, workspacePath) {
    const ws = workspacePath !== undefined && workspacePath !== '' ? workspacePath : undefined;
    if (goal === undefined && ws === undefined)
        return sessionId;
    const entry = { session: sessionId };
    if (goal !== undefined)
        entry.goal = goal;
    if (ws !== undefined)
        entry.workspacePath = ws;
    return entry;
}
/** The preset id a session's own record names: newest logged selection, else the creation header. */
export function resolveRecordedPreset(inspection) {
    const events = inspection.events;
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type === 'agent-preset/selected' && typeof event.data?.agentPreset === 'string') {
            return event.data.agentPreset;
        }
    }
    return inspection.meta.agentPreset;
}
