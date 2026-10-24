/** Which engine turns text into audio. */
export type TtsEngine = 'command' | 'sherpa-onnx';
/** Settings of the synthesizer (a slice of the plugin config, resolved once at mount). */
export interface TtsConfig {
    /** Master switch; false = the tool is not even registered. */
    enabled: boolean;
    engine: TtsEngine;
    /** `command` engine: program the argv template is handed to. */
    command: string;
    /** `command` engine: argv template with `{text}` / `{output}` / … placeholders. */
    args: string[];
    /** `sherpa-onnx` engine: VITS model directory (or a direct `.onnx` path). */
    model: string;
    /** Voice picker: `{voice}` in the command template, `--sid` for sherpa-onnx. */
    voice: string;
    /** Longest text one utterance may carry (characters); see {@link MAX_TTS_CHARS}. */
    maxChars: number;
    /** Per-synthesis timeout (ms). */
    timeoutMs: number;
    /** Largest audio file the transport will accept (bytes): `maxVoiceBytes`, so
     *  an over-sized WAV is caught here (before a doomed send) instead of by QQ. */
    maxBytes: number;
}
/** Default `ttsMaxChars` (characters of spoken text). */
export declare const DEFAULT_TTS_MAX_CHARS = 200;
/** Hard ceiling for `ttsMaxChars`: one QQ voice message is short, and a runaway
 *  value would hold one CLI process for minutes while producing a file the
 *  transport refuses anyway. */
export declare const MAX_TTS_CHARS = 1000;
/** One utterance's substitution values for a `command`-engine argv template. */
export interface TtsArgValues {
    text: string;
    output: string;
    model: string;
    voice: string;
    lang: string;
}
/**
 * Substitute the argv template placeholders. Pure, so tests can pin the exact
 * argv a given configuration produces.
 *
 * An empty template falls back to `['{output}', '{text}']` — the argument order
 * most small TTS CLIs use (say "text into output file"). Unknown placeholders
 * are left untouched on purpose: a template that mentions `{speed}` is not an
 * error, it is just handed to the program verbatim.
 * @param template - configured arguments.
 * @param values - substitution values.
 * @returns the argv to pass.
 */
export declare function fillTtsArgs(template: readonly string[], values: TtsArgValues): string[];
/**
 * Turn a chat reply into something worth listening to.
 *
 * Markdown that reads fine on screen reads badly out loud: code fences, link
 * targets, list bullets, emphasis markers and URLs are dropped rather than
 * spelled out. Line breaks become `，` because a TTS engine given no punctuation
 * runs one sentence straight into the next.
 * @param raw - the text the model wants to speak.
 * @param maxChars - character budget for one utterance.
 * @returns the cleaned text (guaranteed non-empty and within `maxChars`).
 * @throws when nothing speakable is left, or the text is over budget (the
 *   message is meant to be shown to the caller — it says how much to cut).
 */
export declare function prepareTtsText(raw: string, maxChars: number): string;
/**
 * Find an executable on PATH (no shell involved; same rules as src/stt.ts).
 *
 * "It exists" is not enough: the answer decides whether `qq_send_tts` is
 * registered at all, so a directory named like a program, a plain text file or
 * a non-executable file must all answer `undefined` rather than hand the tool a
 * program that can never run. On Windows that means a regular file with a
 * PATHEXT extension (an explicit path is checked by the same rule, not trusted
 * because `stat` found something); on POSIX a regular file with the x bit.
 *
 * Deliberately synchronous: the mount-time {@link Synthesizer.probe} has to know
 * the answer *before* the bridge decides which tools exist, and plugin apply is
 * synchronous. These are a handful of `stat` calls, not real I/O.
 * @param name - bare command name (looked up on PATH) or an explicit path.
 * @returns the path to spawn, or `undefined` when nothing usable is there.
 */
export declare function findProgram(name: string): string | undefined;
/** A VITS model located on disk. */
export interface VitsModel {
    /** The `.onnx` file. */
    model: string;
    /** `tokens.txt` next to it. */
    tokens: string;
    /** Optional `lexicon.txt` (needed by the Chinese models). */
    lexicon?: string;
}
/**
 * Locate a VITS model: `model` may be a directory (the model file and
 * `tokens.txt` inside it, or in one of its subdirectories), or the `.onnx` file
 * itself (tokens looked up beside it). Empty = the usual cache locations.
 *
 * Only a real model counts: the `.onnx` must be a regular `.onnx` file (a
 * directory, a text file or anything else that merely exists is not a model),
 * and `tokens.txt` / `lexicon.txt` must be regular files rather than
 * directories with those names. An explicit path that is unusable answers
 * `undefined` — never an exception — so {@link Synthesizer.probe} can report
 * "not ready" honestly instead of failing the mount.
 *
 * Only what sherpa actually reads is looked for. `dict/` and `espeak-ng-data/`
 * used to be passed as `--vits-dict-dir` / `--vits-data-dir`, but upstream says
 * both are ignored now (`dict_dir`: "you don't need to provide it" since
 * v1.12.15; `data_dir`: deprecated since v2.0.0, espeak-ng dropped) — passing
 * them only earns a warning on stderr, so they are not part of the model.
 */
export declare function findVitsModel(location: string): VitsModel | undefined;
/**
 * The argv `sherpa-onnx-offline-tts` needs to synthesize `text` into `output`.
 *
 * Flags follow the upstream registration in
 * `sherpa-onnx/csrc/offline-tts-vits-model-config.cc` (https://github.com/k2-fsa/sherpa-onnx)
 * and the documented examples
 * (https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html): only
 * `--vits-model`, `--vits-tokens` and (when the model ships one)
 * `--vits-lexicon` are read; `--vits-data-dir` (deprecated since v2.0.0) and
 * `--vits-dict-dir` (unused since v1.12.15) are deliberately *not* passed — they
 * would only produce a warning. `--lexicon` is omitted when the directory has
 * no `lexicon.txt`, because sherpa rejects a path that does not exist.
 * Everything is one `--k=v` form (fine on every platform, no shell), and the
 * text is the one positional argument, last.
 *
 * Pure and exported so tests can pin the exact argv without a real model or a
 * real binary.
 * @param vits - the located model.
 * @param output - WAV path to write.
 * @param speaker - `--sid` value (`''` = single-speaker model, flag omitted).
 * @param text - the cleaned text to speak.
 * @returns the argv (without the program name).
 */
export declare function buildSherpaArgs(vits: VitsModel, output: string, speaker: string, text: string): string[];
/** What {@link verifyWav} confirmed about a produced file. */
export interface WavInfo {
    /** File size on disk (bytes). */
    bytes: number;
    /** Samples per second. */
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    /** Bytes declared by the `data` chunk. */
    dataBytes: number;
}
/**
 * Check that a file really is a non-empty PCM WAV of an acceptable size.
 *
 * "The program exited 0" is not evidence of usable audio: a stand-in script, a
 * confused argument order or a truncated write all leave a file behind. So the
 * header is parsed (RIFF/WAVE, a PCM `fmt ` that is complete enough for its own
 * format tag, a `data` chunk that is neither empty nor cut short) and the size
 * is checked against the transport's cap *before* the file is handed to QQ.
 *
 * Two things are treated as lies rather than details: the RIFF-declared length
 * (every chunk — and every byte accessed — has to fall inside it, so a file
 * that claims more than it holds is truncation, not a quirk) and the fmt
 * numbers (`blockAlign` / `byteRate` must agree with channels / rate / depth,
 * and `data` must be a whole number of frames). An `EXTENSIBLE` fmt is only
 * accepted when its header is actually there (`size` and `cbSize` large enough)
 * and its SubFormat GUID is PCM.
 *
 * Only the chunk headers are read — a few dozen bytes — so this stays cheap
 * even for a long utterance, and the chunk walk is bounded so a hostile file
 * full of empty chunks cannot spin the event loop.
 * @param path - the produced file.
 * @param maxBytes - the transport's voice-size cap (bytes).
 * @returns what the header says.
 * @throws with a Chinese message naming what is wrong with the file.
 */
export declare function verifyWav(path: string, maxBytes: number): Promise<WavInfo>;
/** What the tool gets back after a successful synthesis. */
export interface SynthesizeResult {
    /** Absolute path of the WAV under `mediaDir`. */
    path: string;
    /** Engine that produced it. */
    engine: TtsEngine;
    /** File size (bytes). */
    bytes: number;
    /** Wall-clock duration of the CLI call (ms). */
    ms: number;
    /** Spoken characters (after cleaning). */
    chars: number;
}
/**
 * The synthesizer: one CLI process per utterance, one WAV per utterance.
 *
 * Output files are named `tts_<id>.wav` directly under `mediaDir` so the
 * existing temporary-media cleanup (`MediaStore.cleanupExpired`, which sweeps
 * the `media_*` / `stt_*` / `tts_*` prefixes) reaps them on the usual TTL —
 * nothing here has to remember to delete anything.
 */
export declare class Synthesizer {
    private readonly config;
    private readonly dir;
    private resolved;
    private lastDetail;
    /** Result of the most recent {@link probe}; `undefined` = never probed. */
    private probeState;
    constructor(config: TtsConfig, mediaDir: string);
    /** Master switch (the tool is registered only when this is true). */
    get enabled(): boolean;
    /**
     * Enabled *and* actually usable: the engine plus — for `command` — the
     * program, and — for `sherpa-onnx` — the binary *and* a VITS model were all
     * found by the last {@link probe}.
     *
     * This is deliberately a fact, not a guess. Knowing whether a program is on
     * PATH or a model directory holds `tokens.txt` means touching the disk, and a
     * getter cannot wait for that, so {@link probe} is run once at mount (see
     * `src/index.ts`) and this getter reports what it found. Capability
     * resolution and tool registration key off it, so a half-filled or
     * unsatisfiable configuration leaves the model with no `qq_send_tts` at all
     * instead of a tool that fails on every call. Not yet probed = not ready.
     */
    get ready(): boolean;
    /**
     * Look for the engine once and remember the answer; also why it is *not*
     * usable, which `/doctor` shows instead of a cheerful "sherpa-onnx".
     *
     * Never throws: a failed probe is an answer, not an error. A failure is not
     * cached by {@link resolve}, so a probe after installing the missing piece
     * succeeds without a restart.
     *
     * Synchronous on purpose: plugin apply is sync, and the answer has to be in
     * hand before the bridge works out which tools a chat gets. The work is a
     * handful of `stat` calls — cheap enough to do inline.
     * @returns whether the synthesizer can synthesize.
     */
    probe(): boolean;
    /** Configured text budget for one utterance. */
    get maxChars(): number;
    /** Transport cap on the produced file (bytes); non-positive = no cap. */
    get maxBytes(): number;
    /**
     * One `/doctor` line, synchronously: what the engine is, whether the last
     * {@link probe} found it, and — when it did not — why not. Never throws,
     * never starts a process (a status line must stay cheap).
     */
    status(): {
        enabled: boolean;
        engine: TtsEngine;
        ready: boolean;
        detail: string;
    };
    /**
     * Synthesize one utterance.
     * @param raw - the text to speak (cleaned by {@link prepareTtsText}).
     * @param options - `signal` aborts the CLI call (the tool passes the turn's).
     * @returns the produced file.
     * @throws with a Chinese message naming the problem; no file is left behind.
     */
    synthesize(raw: string, options?: {
        signal?: AbortSignal;
    }): Promise<SynthesizeResult>;
    /** Resolve the engine once; failures are not cached, so a missing program
     *  installed later is picked up without a restart. */
    private resolve;
    private resolveNow;
    private runEngine;
}
/**
 * Run one TTS program to completion.
 *
 * Unlike `stt.ts`'s runner this one also honours an abort signal — the tool
 * hands over the turn's `signal`, and a cancelled turn must not keep a CLI
 * process (or a half-written WAV) alive.
 *
 * Cancellation, timeout and a non-zero exit all converge on the same path:
 * stop the process tree, then wait for its `close` before settling. Settling
 * early would let the caller delete the output file while the engine is still
 * writing it (leaving a stray WAV that the TTL sweep never sees), or report
 * "cancelled" for a process that is in fact still running. `signal` is
 * optional so tests and callers without a turn context can run it directly.
 * @throws a Chinese message on timeout, abort, or a non-zero exit.
 */
export declare function runProcess(program: string, args: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<{
    stdout: string;
    stderr: string;
}>;
