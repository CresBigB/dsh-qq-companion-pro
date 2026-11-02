/**
 * GIF 解码（T32）：把一张动图拆成若干帧，交给拼图工具摆成一张静态图。
 *
 * 为什么要自己解而不是调 ffmpeg：这台机器上 `ffmpeg` / `ffprobe` 都不在 PATH
 * 里（`Get-Command ffmpeg` 为空），而语音合成那条路已经是「探到程序才启用」，
 * 查看动图这种基础能力不该因为对方没装 ffmpeg 就整个不可用。GIF 的格式又足够小
 * ——文件头 + 全局调色板 + 一串「扩展块 / 图像块」+ LZW 压缩的索引数据——自己解
 * 一遍不到三百行，还没有子进程、没有临时文件、没有平台差异。
 *
 * 这个模块是**纯函数**：只吃 `Uint8Array`、只吐 RGBA 像素，不碰画布、不碰文件
 * 系统，所以单测可以直接用几段手写的最小 GIF 字节覆盖 LZW、隔行、透明与
 * disposal 这些分支。合成 PNG 与排版在 {@link ./gif-sheet.ts}。
 *
 * 解出来的每一帧都是**整幅画面**的 RGBA（不是那一小块矩形）：GIF 的一帧只覆盖
 * 画面的一部分，剩下靠前一帧留在画布上的内容和 disposal 规则补齐，所以这里自己
 * 维护一块画布，按帧序把它走完——这跟「把每一帧贴到正确位置」是一回事。
 *
 * 已知取舍（真机没验的地方写在这里，而不是悄悄假设）：
 * - **不还原 disposal = 2 的背景色**：规范说清回背景色，但背景色索引指向的仍是
 *   调色板里的颜色，而绝大多数动图并不真的想要那块底色。这里按「清成透明」处理，
 *   拼图时再铺白底——结果是白底还是透明底都看得清，不会出现一圈莫名的黑块。
 * - **首帧之前的画布按透明**，不填背景色，理由同上。
 * - **单帧延迟 ≤10ms 按 100ms**：老播放器的「最快帧」约定，只影响
 *   {@link GifFrame.delayMs} 的展示，不影响抽帧。
 * @module dsh-qq-companion/gif
 */
/** 一张动图最多解多少帧（超出的帧直接不看；防止几百帧的大图把内存吃光）。 */
export declare const GIF_MAX_FRAMES = 240;
/** 解出来的画面像素上限（宽 × 高）；再大就当作不是给人看的动图。 */
export declare const GIF_MAX_PIXELS: number;
/** GIF 一律用这个内部尺寸上限（字节数由调用方另外限）。 */
export declare const GIF_MAX_BYTES: number;
/** 解码失败：文件不是 GIF、被截断，或者 LZW 数据自相矛盾。 */
export declare class GifError extends Error {
    constructor(message: string);
}
/** 一帧：整幅画面的 RGBA（`width * height * 4` 字节，行优先，非预乘）。 */
export interface GifFrame {
    readonly rgba: Uint8Array;
    /** 这一帧该显示多久（毫秒；已按「≤10ms 视为 100ms」修正）。 */
    readonly delayMs: number;
}
/** 解完的动图。 */
export interface DecodedGif {
    readonly width: number;
    readonly height: number;
    readonly frames: readonly GifFrame[];
    /** 循环次数（`NETSCAPE2.0` 应用扩展里的值；缺席 = undefined，0 = 无限）。 */
    readonly loop: number | undefined;
    /** 是否因为 {@link GIF_MAX_FRAMES} 截断了尾巴。 */
    readonly truncated: boolean;
}
/** 解码选项。 */
export interface DecodeGifOptions {
    /** 最多解多少帧（默认 {@link GIF_MAX_FRAMES}）。 */
    maxFrames?: number;
}
/**
 * LZW 解压一帧的索引数据。
 *
 * GIF 的 LZW 与 TIFF 那套的差别只有两点：码长从 `minCodeSize + 1` 起步，以及
 * 清空码 / 结束码紧跟在调色板项数之后。码是 LSB 优先、跨字节连续的。
 * @param data - 拼接后的子块数据。
 * @param minCodeSize - 图像块里写的 LZW 最小码长（2 … 8）。
 * @param pixelCount - 这一帧矩形里的像素数（解满即停，多余的码不管）。
 * @returns 长度恰好 `pixelCount` 的调色板索引。
 */
export declare function lzwDecode(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array;
/**
 * 解一张 GIF。
 * @param bytes - 完整文件字节。
 * @param options - 解码选项。
 * @returns 画面尺寸、逐帧 RGBA 与循环信息。
 * @throws GifError 文件不是 GIF、被截断、尺寸超限或 LZW 数据矛盾。
 */
export declare function decodeGif(bytes: Uint8Array, options?: DecodeGifOptions): DecodedGif;
/**
 * 从 `count` 帧里等距挑出至多 `max` 帧（含首帧与末帧）。
 * @param count - 总帧数。
 * @param max - 最多要几个。
 * @returns 递增的下标数组（无重复）。
 */
export declare function pickFrames(count: number, max: number): number[];
/** 拼图的网格尺寸（不含标签）。 */
export interface SheetGeometry {
    readonly columns: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
    readonly width: number;
    readonly height: number;
}
/**
 * 算一格多大、一共几行几列。
 * @param frameCount - 要摆几格。
 * @param columns - 想要的列数（会夹到 1 … frameCount）。
 * @param sourceWidth - 原图宽（用来按比例算格高）。
 * @param sourceHeight - 原图高。
 * @param cellWidth - 每格宽（像素，调用方已经夹过范围）。
 * @returns 网格几何。
 */
export declare function sheetGeometry(frameCount: number, columns: number, sourceWidth: number, sourceHeight: number, cellWidth: number): SheetGeometry;
