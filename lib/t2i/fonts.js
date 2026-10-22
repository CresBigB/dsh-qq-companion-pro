/**
 * Fonts for reply cards. The canvas resolves a CSS font list per character
 * and stops at the first family that claims it, so each style is one list:
 * the user's own families first, then the platform's own (Windows only),
 * then common CJK fonts, a color emoji font and a Latin fallback. Configured
 * font files are registered once. A card is only drawn when at least one CJK
 * font is present (otherwise the caller sends plain text).
 * @module dsh-qq-companion/t2i/fonts
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
/** CJK-capable families, most preferred first. */
export const CJK_FAMILIES = [
    'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei',
    'Noto Sans CJK JP', 'Noto Sans CJK TC', 'WenQuanYi Zen Hei', 'WenQuanYi Micro Hei', 'Droid Sans Fallback',
];
const EMOJI_FAMILIES = ['Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', 'Twemoji Mozilla'];
const LATIN_FAMILIES = ['DejaVu Sans', 'Liberation Sans', 'Arial'];
const MONO_FAMILIES = ['DejaVu Sans Mono', 'Noto Sans Mono CJK SC', 'Noto Sans Mono', 'Liberation Mono', 'Menlo', 'Consolas'];
/** Font files Windows ships in %WINDIR%\Fonts, registered when present. */
const WIN_FONT_FILES = ['msyh.ttc', 'msyhbd.ttc', 'simhei.ttf', 'simsun.ttc', 'segoeui.ttf', 'seguiemj.ttf', 'consola.ttf'];
/**
 * Windows families tried before the built-in CJK list. The rasterizer stops
 * looking for a fallback family as soon as one claims a character, and Windows
 * lists "cloud" fonts (e.g. Noto Sans SC) whose files are not actually
 * installed — their glyphs draw nothing — so the real fonts must come first.
 */
const WIN_CJK_FAMILIES = ['Microsoft YaHei', 'SimHei', 'DengXian', 'SimSun', 'Microsoft JhengHei', 'MS Gothic'];
const registered = new Set();
let systemFontsRegistered = false;
/** Register the platform's own font files once (Windows only; both POSIX
 * systems already expose their installed fonts to the canvas). */
function registerSystemFonts() {
    if (systemFontsRegistered || process.platform !== 'win32')
        return;
    systemFontsRegistered = true;
    const dir = join(process.env.WINDIR ?? process.env.SystemRoot ?? 'C:\\Windows', 'Fonts');
    for (const name of WIN_FONT_FILES) {
        const file = join(dir, name);
        if (registered.has(file) || !existsSync(file))
            continue;
        registered.add(file);
        GlobalFonts.registerFromPath(file);
    }
}
/** Families to try before the built-in list on this platform. */
function platformFamilies() {
    if (process.platform !== 'win32')
        return [];
    registerSystemFonts();
    return WIN_CJK_FAMILIES;
}
/** Register configured font files (each path once; missing files skipped). */
export function registerFontFiles(files) {
    for (const file of files) {
        if (file === '' || registered.has(file) || !existsSync(file))
            continue;
        registered.add(file);
        GlobalFonts.registerFromPath(file);
    }
}
const quote = (family) => '"' + family.replace(/"/g, '') + '"';
/** The installed families of a candidate list (case-insensitive). */
function installed(candidates) {
    const have = new Set(GlobalFonts.families.map(f => f.family.toLowerCase()));
    return candidates.filter(f => have.has(f.toLowerCase()));
}
/**
 * Font lists for one configuration.
 * @throws when no CJK font is installed — a card would render tofu.
 */
export function fontStacks(preferred = []) {
    const cjk = installed([...preferred, ...platformFamilies(), ...CJK_FAMILIES]);
    if (cjk.length === 0)
        throw new Error('没有可用的中文字体（安装 fonts-noto-cjk，或在 fontFiles 里指定字体文件）');
    const text = [...cjk, ...installed(EMOJI_FAMILIES), ...installed(LATIN_FAMILIES)];
    const mono = [...installed(MONO_FAMILIES), ...text];
    return { text: [...new Set(text)].map(quote).join(', ') + ', sans-serif', mono: [...new Set(mono)].map(quote).join(', ') + ', monospace' };
}
