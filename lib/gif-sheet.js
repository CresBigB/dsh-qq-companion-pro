/**
 * 把解好的 GIF 帧摆成一张静态图（T32）。
 *
 * 抽帧拼图的意义只有一句话：**模型一次只能看一张图**。一张 30 帧的动图逐帧发给
 * 它既费上下文又看不全，所以这里等距挑几帧、按格摆开，一遍就看完整个动作的过程。
 *
 * 排版规则（都写死在 {@link ./gif.ts} 的 {@link sheetGeometry} 里，这里只管画）：
 * - 等距抽帧，**首帧与末帧一定在内**（开头和结尾往往是信息量最大的两格）；
 * - 每格按原图宽高比缩放，格与格之间留 1px 浅边框，整张图铺白底（GIF 的透明
 *   在深色底上看不清，白底最稳）；
 * - 每格左下角标 `序号/总数 · 延迟`，模型可以据此说出「第 5 帧之后才动」。
 * @module dsh-qq-companion/gif-sheet
 */
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { pickFrames, sheetGeometry } from './gif.js';
/** 一张拼图最多摆多少格。 */
export const SHEET_MAX_FRAMES = 36;
/** 每格的默认宽度（像素）。 */
export const SHEET_CELL_WIDTH = 240;
/** 每格的宽度上下限。 */
export const SHEET_CELL_WIDTH_MIN = 80;
export const SHEET_CELL_WIDTH_MAX = 640;
/** 默认列数。 */
export const SHEET_COLUMNS = 4;
/** 单元格边框颜色（浅灰，白底上刚好看得见格子）。 */
const CELL_BORDER = '#e5e5e5';
/** 标签文字颜色。 */
const LABEL_COLOR = '#6b7280';
/**
 * 把一帧画进一格。
 * @param ctx - 拼图的 2D 上下文。
 * @param frame - 这一帧的 RGBA。
 * @param sourceWidth - 原图宽。
 * @param sourceHeight - 原图高。
 * @param temp - 复用的一整幅临时画布（每帧重画一次）。
 * @param x - 这一格左上角的 x。
 * @param y - 这一格左上角的 y。
 * @param geometry - 网格几何。
 */
function paintCell(ctx, frame, sourceWidth, sourceHeight, temp, x, y, geometry) {
    const pixels = new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.length);
    const tempCtx = temp.getContext('2d');
    tempCtx.putImageData(new ImageData(pixels, sourceWidth, sourceHeight), 0, 0);
    ctx.drawImage(temp, x, y, geometry.cellWidth, geometry.cellHeight);
}
/**
 * 抽帧并拼成一张 PNG。
 * @param gif - {@link decodeGif} 的结果。
 * @param options - 抽几帧、几列、每格多宽。
 * @returns PNG 字节、用到的帧下标与网格几何。
 */
export async function renderGifSheet(gif, options) {
    const maxFrames = Math.min(SHEET_MAX_FRAMES, Math.max(1, Math.trunc(options.maxFrames)));
    const cellWidth = Math.min(SHEET_CELL_WIDTH_MAX, Math.max(SHEET_CELL_WIDTH_MIN, Math.trunc(options.cellWidth)));
    const frameIndexes = pickFrames(gif.frames.length, maxFrames);
    const geometry = sheetGeometry(frameIndexes.length, options.columns, gif.width, gif.height, cellWidth);
    const sheet = createCanvas(geometry.width, geometry.height);
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, geometry.width, geometry.height);
    const temp = createCanvas(gif.width, gif.height);
    for (let slot = 0; slot < frameIndexes.length; slot += 1) {
        const index = frameIndexes[slot];
        const frame = gif.frames[index];
        const x = (slot % geometry.columns) * geometry.cellWidth;
        const y = Math.floor(slot / geometry.columns) * geometry.cellHeight;
        paintCell(ctx, frame.rgba, gif.width, gif.height, temp, x, y, geometry);
        ctx.strokeStyle = CELL_BORDER;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, geometry.cellWidth - 1, geometry.cellHeight - 1);
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText((index + 1) + '/' + gif.frames.length + ' · ' + frame.delayMs + 'ms', x + 5, y + geometry.cellHeight - 4);
    }
    const png = await sheet.encode('png');
    return { png, frameIndexes, geometry, sourceFrames: gif.frames.length };
}
