import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';

import {
  VOICE_FALLBACK_MESSAGE,
  formatVoiceContent,
  isVoiceNote,
  transcribeVoiceBuffer,
  type ExecFn,
} from './transcription.js';

describe('transcribeVoiceBuffer', () => {
  it('converts with ffmpeg to 16kHz mono wav, runs whisper-cli, returns trimmed transcript and cleans up', async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    let oggPath = '';
    let wavPath = '';
    const exec: ExecFn = vi.fn(async (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === 'ffmpeg') {
        oggPath = args[args.indexOf('-i') + 1];
        wavPath = args[args.length - 1];
        expect(fs.readFileSync(oggPath).toString()).toBe('opus-bytes');
        fs.writeFileSync(wavPath, 'wav');
        return { stdout: '' };
      }
      return { stdout: '  hello world \n' };
    });

    const out = await transcribeVoiceBuffer(Buffer.from('opus-bytes'), {
      exec,
      whisperBin: 'whisper-cli',
      whisperModel: '/models/ggml-base.bin',
    });

    expect(out).toBe('hello world');
    expect(calls[0].cmd).toBe('ffmpeg');
    expect(calls[0].args).toEqual(expect.arrayContaining(['-ar', '16000', '-ac', '1', '-f', 'wav']));
    expect(calls[1]).toEqual({
      cmd: 'whisper-cli',
      args: ['-m', '/models/ggml-base.bin', '-f', wavPath, '--no-timestamps', '-nt'],
    });
    expect(fs.existsSync(oggPath)).toBe(false);
    expect(fs.existsSync(wavPath)).toBe(false);
  });

  it('returns null when a tool fails or output is empty', async () => {
    const failing: ExecFn = async () => {
      throw new Error('boom');
    };
    expect(await transcribeVoiceBuffer(Buffer.from('x'), { exec: failing })).toBeNull();
    const empty: ExecFn = async () => ({ stdout: '  \n' });
    expect(await transcribeVoiceBuffer(Buffer.from('x'), { exec: empty })).toBeNull();
  });

  it('defaults the model to data/models/ggml-base.bin under cwd', async () => {
    const exec: ExecFn = vi.fn(async () => ({ stdout: 'hi' }));
    delete process.env.WHISPER_MODEL;
    await transcribeVoiceBuffer(Buffer.from('x'), { exec });
    const whisperCall = vi.mocked(exec).mock.calls.find((c) => c[0] !== 'ffmpeg')!;
    expect(whisperCall[1][1]).toBe(path.join(process.cwd(), 'data', 'models', 'ggml-base.bin'));
  });
});

describe('voice content helpers', () => {
  it('formats transcript like v1, with fallback', () => {
    expect(formatVoiceContent('hello')).toBe('[Voice: hello]');
    expect(formatVoiceContent(null)).toBe(VOICE_FALLBACK_MESSAGE);
    expect(VOICE_FALLBACK_MESSAGE).toBe('[Voice Message - transcription unavailable]');
  });

  it('detects only push-to-talk audio', () => {
    expect(isVoiceNote({ audioMessage: { ptt: true } })).toBe(true);
    expect(isVoiceNote({ audioMessage: { ptt: false } })).toBe(false);
    expect(isVoiceNote({})).toBe(false);
  });
});
