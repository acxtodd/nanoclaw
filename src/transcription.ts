/**
 * Host-side local voice-note transcription (whisper.cpp + ffmpeg).
 *
 * Ported from v1. Runs on the host so no audio leaves the machine. Requires
 * `ffmpeg` and `whisper-cli` on PATH and a ggml model (default
 * `<cwd>/data/models/ggml-base.bin`; override with WHISPER_BIN / WHISPER_MODEL).
 */
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import { log } from './log.js';

const execFileAsync = promisify(execFile);

export const VOICE_FALLBACK_MESSAGE = '[Voice Message - transcription unavailable]';

export type ExecFn = (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ stdout: string }>;

export interface TranscribeOptions {
  exec?: ExecFn;
  whisperBin?: string;
  whisperModel?: string;
}

const defaultExec: ExecFn = async (cmd, args, opts) => {
  const { stdout } = await execFileAsync(cmd, args, opts);
  return { stdout: String(stdout) };
};

/** True for push-to-talk voice notes (not ordinary audio files). */
export function isVoiceNote(normalized: { audioMessage?: { ptt?: boolean | null } | null } | null | undefined): boolean {
  return normalized?.audioMessage?.ptt === true;
}

/** Message text for a voice note: the transcript, or the v1 fallback marker. */
export function formatVoiceContent(transcript: string | null): string {
  return transcript ? `[Voice: ${transcript}]` : VOICE_FALLBACK_MESSAGE;
}

/** Transcribe an ogg/opus buffer. Returns null on any failure or empty output. */
export async function transcribeVoiceBuffer(audio: Buffer, options: TranscribeOptions = {}): Promise<string | null> {
  const exec = options.exec ?? defaultExec;
  const whisperBin = options.whisperBin ?? (process.env.WHISPER_BIN || 'whisper-cli');
  const whisperModel =
    options.whisperModel ?? (process.env.WHISPER_MODEL || path.join(process.cwd(), 'data', 'models', 'ggml-base.bin'));

  const id = `nanoclaw-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpOgg = path.join(os.tmpdir(), `${id}.ogg`);
  const tmpWav = path.join(os.tmpdir(), `${id}.wav`);

  try {
    fs.writeFileSync(tmpOgg, audio);

    // whisper.cpp needs 16kHz mono WAV
    await exec('ffmpeg', ['-i', tmpOgg, '-ar', '16000', '-ac', '1', '-f', 'wav', '-y', tmpWav], {
      timeout: 30_000,
    });

    const { stdout } = await exec(whisperBin, ['-m', whisperModel, '-f', tmpWav, '--no-timestamps', '-nt'], {
      timeout: 60_000,
    });

    return stdout.trim() || null;
  } catch (err) {
    log.warn('whisper.cpp transcription failed', { err });
    return null;
  } finally {
    for (const f of [tmpOgg, tmpWav]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* best effort cleanup */
      }
    }
  }
}
