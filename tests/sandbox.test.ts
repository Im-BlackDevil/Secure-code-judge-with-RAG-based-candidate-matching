import { describe, it, expect } from 'vitest';
import Docker from 'dockerode';
import { runInSandbox } from '../src/workers/dockerSandbox';

const docker = new Docker();

describe('sandbox: normal behaviour', () => {
  it('runs a normal program', async () => {
    const r = await runInSandbox('a, b = map(int, input().split())\nprint(a + b)', '2 3');
    expect(r.verdict).toBe('ok');
    expect(r.output).toBe('5');
  });

  it('preserves multi-line output (CRLF normalised)', async () => {
    const r = await runInSandbox("print('a')\nprint('b')", '');
    expect(r.output).toBe('a\nb');
  });

  it('reports a crash as runtime_error, not wrong answer', async () => {
    const r = await runInSandbox('print(1/0)', '');
    expect(r.verdict).toBe('runtime_error');
  });
});

describe('sandbox: attacks', () => {
  it('kills an infinite loop', async () => {
    const r = await runInSandbox('while True:\n    pass', '', 2000);
    expect(r.verdict).toBe('timeout');
  });

  it('stops a memory bomb', async () => {
    const r = await runInSandbox("x = []\nwhile True:\n    x.append('a' * 10_000_000)", '', 5000);
    expect(r.verdict).toBe('memory_limit');
  });

  it('contains a fork bomb', async () => {
    const r = await runInSandbox('import os\nwhile True:\n    os.fork()', '', 3000);
    expect(r.verdict).not.toBe('ok');
  });

  it('has no network access', async () => {
    const r = await runInSandbox("import urllib.request\nurllib.request.urlopen('http://example.com', timeout=2)", '', 5000);
    expect(r.verdict).toBe('runtime_error');
  });

  it('cannot write to the filesystem', async () => {
    const r = await runInSandbox("open('/etc/hacked.txt', 'w').write('x')", '', 5000);
    expect(r.verdict).toBe('runtime_error');
  });

  it('caps huge output', async () => {
    const r = await runInSandbox("print('x' * 5_000_000)", '', 5000);
    expect(r.output.length).toBeLessThanOrEqual(10_100);
  });
});

describe('sandbox: hygiene', () => {
  it('leaves no containers behind', async () => {
    const left = await docker.listContainers({ all: true, filters: { label: ['app=code-judge'] } });
    expect(left.length).toBe(0);
  });
});