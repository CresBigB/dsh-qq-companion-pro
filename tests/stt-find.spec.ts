/**
 * findCommand must probe PATH by direct file checks — no `sh -c` involved, so
 * the configured name is never shell-interpreted. Every case points PATH at
 * temp dirs, keeping the probe hermetic regardless of what the host has
 * installed. "Executable" means the x bit on POSIX and a PATHEXT extension on
 * Windows (where a same-named file with no known extension is not a program).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { chmod, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { findCommand } from '../src/stt.js'

const WINDOWS = process.platform === 'win32'
const PATH_SEP = WINDOWS ? ';' : ':'

beforeEach(() => {
  // Windows look-up is PATHEXT-driven; pin it so the probe stays hermetic.
  if (WINDOWS) vi.stubEnv('PATHEXT', '.COM;.EXE;.BAT;.CMD')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Write an executable named `name` into `dir`; returns the path to expect. */
async function install(dir: string, name: string): Promise<string> {
  if (WINDOWS) {
    const program = join(dir, name + '.cmd')
    await writeFile(program, '@echo off\r\nexit /b 0\r\n')
    return program
  }
  const program = join(dir, name)
  await writeFile(program, '#!/bin/sh\nexit 0\n')
  await chmod(program, 0o755)
  return program
}

/** A file that must never count as a program: no x bit on POSIX, an extension
 * outside PATHEXT on Windows. */
async function installPlain(dir: string, name: string): Promise<void> {
  await writeFile(join(dir, name), 'plain data, not a program')
  if (!WINDOWS) await chmod(join(dir, name), 0o644)
}

describe('findCommand', () => {
  it('returns the absolute path of an executable match on PATH', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stt-find-hit-'))
    const program = await install(dir, 'fake-whisper')
    vi.stubEnv('PATH', dir)
    await expect(findCommand('fake-whisper')).resolves.toBe(program)
  })

  it('returns undefined when PATH points at an empty dir', async () => {
    vi.stubEnv('PATH', mkdtempSync(join(tmpdir(), 'stt-find-empty-')))
    await expect(findCommand('fake-whisper')).resolves.toBeUndefined()
  })

  it('skips a non-executable file and keeps scanning the next dir', async () => {
    const noExec = mkdtempSync(join(tmpdir(), 'stt-find-noexec-'))
    const exec = mkdtempSync(join(tmpdir(), 'stt-find-exec-'))
    await installPlain(noExec, 'fake-whisper')
    const program = await install(exec, 'fake-whisper')

    // A dir holding only a non-executable match must not satisfy the probe...
    vi.stubEnv('PATH', noExec)
    await expect(findCommand('fake-whisper')).resolves.toBeUndefined()

    // ...but the scan must continue into later dirs and find the real one.
    vi.stubEnv('PATH', noExec + PATH_SEP + exec)
    await expect(findCommand('fake-whisper')).resolves.toBe(program)
  })

  it.runIf(WINDOWS)('finds xxx.exe / xxx.cmd from the bare name (PATHEXT)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stt-find-pathext-'))
    await writeFile(join(dir, 'fake-exe.exe'), 'MZ fake')
    await writeFile(join(dir, 'fake-cmd.cmd'), '@echo off\r\nexit /b 0\r\n')
    vi.stubEnv('PATH', dir)
    await expect(findCommand('fake-exe')).resolves.toBe(join(dir, 'fake-exe.exe'))
    await expect(findCommand('fake-cmd')).resolves.toBe(join(dir, 'fake-cmd.cmd'))
    // An explicit extension is tried as written.
    await expect(findCommand('fake-exe.exe')).resolves.toBe(join(dir, 'fake-exe.exe'))
  })
})