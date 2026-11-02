import type { DecodedGif, SheetGeometry } from './gif.js';
/** 一张拼图最多摆多少格。 */
export declare const SHEET_MAX_FRAMES = 36;
/** 每格的默认宽度（像素）。 */
export declare const SHEET_CELL_WIDTH = 240;
/** 每格的宽度上下限。 */
export declare const SHEET_CELL_WIDTH_MIN = 80;
export declare const SHEET_CELL_WIDTH_MAX = 640;
/** 默认列数。 */
export declare const SHEET_COLUMNS = 4;
/** 拼图选项。 */
export interface SheetOptions {
    /** 最多摆几格（1 … {@link SHEET_MAX_FRAMES}）。 */
    maxFrames: number;
    /** 列数（1 … 8，超过格数按格数算）。 */
    columns: number;
    /** 每格宽度（像素，夹在 {@link SHEET_CELL_WIDTH_MIN} … {@link SHEET_CELL_WIDTH_MAX}）。 */
    cellWidth: number;
}
/** 拼好的图。 */
export interface GifSheet {
    /** PNG 字节。 */
    readonly png: Buffer;
    /** 摆进图里的帧下标（升序）。 */
    readonly frameIndexes: number[];
    /** 网格几何。 */
    readonly geometry: SheetGeometry;
    /** 原图总帧数。 */
    readonly sourceFrames: number;
}
/**
 * 抽帧并拼成一张 PNG。
 * @param gif - {@link decodeGif} 的结果。
 * @param options - 抽几帧、几列、每格多宽。
 * @returns PNG 字节、用到的帧下标与网格几何。
 */
export declare function renderGifSheet(gif: DecodedGif, options: SheetOptions): Promise<GifSheet>;
