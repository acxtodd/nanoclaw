import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes: Array<{ file: string; data: string }> = [];

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
  execFileSync: vi.fn(() => ''),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const mocked = {
    ...actual,
    mkdirSync: vi.fn(),
    symlinkSync: vi.fn(),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn((file: string, data: string) => {
      writes.push({ file: String(file), data: String(data) });
    }),
  };
  return { ...mocked, default: mocked };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  const mocked = { ...actual, homedir: () => '/Users/tester' };
  return { ...mocked, default: mocked };
});

vi.mock('./platform.js', () => ({
  commandExists: vi.fn(() => false),
  getPlatform: () => 'macos',
  getNodePath: () => '/opt/custom/node/bin/node',
  getServiceManager: () => 'launchd',
  isRoot: () => false,
}));

vi.mock('./peer-cleanup.js', () => ({
  cleanupUnhealthyPeers: () => ({ unloaded: [], removed: [] }),
}));

vi.mock('../src/upgrade-state.js', () => ({
  writeUpgradeState: () => ({ version: 'test' }),
}));

vi.mock('./status.js', () => ({ emitStatus: vi.fn() }));

describe('launchd plist PATH', () => {
  beforeEach(() => {
    writes.length = 0;
  });

  it('includes Homebrew, node dir, and the existing entries', async () => {
    const { run } = await import('./service.js');
    await run([]);

    const plist = writes.find((w) => w.file.endsWith('.plist'));
    expect(plist).toBeDefined();
    const match = plist!.data.match(/<key>PATH<\/key>\s*<string>([^<]*)<\/string>/);
    const entries = match![1].split(':');

    expect(entries).toContain('/opt/homebrew/bin');
    expect(entries).toContain('/opt/custom/node/bin');
    for (const e of ['/usr/local/bin', '/usr/bin', '/bin', '/Users/tester/.local/bin']) {
      expect(entries).toContain(e);
    }
    expect(new Set(entries).size).toBe(entries.length);
  });
});
