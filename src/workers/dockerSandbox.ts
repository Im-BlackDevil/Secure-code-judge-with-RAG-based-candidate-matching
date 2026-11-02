import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';

const docker = new Docker();

const IMAGE = 'python:3.11-slim';
const LABEL = 'code-judge';
const MEMORY_BYTES = 128 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 10_000;

export type Verdict = 'ok' | 'timeout' | 'runtime_error' | 'memory_limit';

export interface RunResult {
  verdict: Verdict;
  output: string;
  exitCode: number | null;
  durationMs: number; // wall-clock INCLUDING container startup, not pure program runtime
}

function normalise(raw: string): string {
  const text = raw.replace(/\r\n/g, '\n').trim(); // TTY mode emits \r\n
  return text.length > MAX_OUTPUT_CHARS ? text.slice(0, MAX_OUTPUT_CHARS) + '\n...[output truncated]' : text;
}

export async function runInSandbox(code: string, input: string, timeoutMs = 5000): Promise<RunResult> {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempDir = path.join(process.cwd(), 'tmp', jobId);
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'solution.py'), code);
  fs.writeFileSync(path.join(tempDir, 'input.txt'), input);

  const backstopSeconds = Math.ceil(timeoutMs / 1000) + 2;
  const started = Date.now();
  let container: Docker.Container | undefined;
  let timer: NodeJS.Timeout | undefined;

  try {
    container = await docker.createContainer({
      Image: IMAGE,
      // In-container backstop: if the worker dies, the container still kills itself.
      Cmd: ['sh', '-c', `timeout -s KILL ${backstopSeconds} python3 /app/solution.py < /app/input.txt`],
      Tty: true,
      Labels: { app: LABEL },
      HostConfig: {
        Binds: [`${tempDir}:/app:ro`],      // code is read-only inside the sandbox
        Memory: MEMORY_BYTES,
        MemorySwap: MEMORY_BYTES,           // same as Memory = no swap, so a memory bomb can't hide in swap
        NanoCpus: 500_000_000,              // 0.5 CPU
        PidsLimit: 50,                      // blocks fork bombs
        NetworkMode: 'none',                // no network at all
        ReadonlyRootfs: true,
        Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=16m' },
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        LogConfig: { Type: 'json-file', Config: { 'max-size': '1m', 'max-file': '1' } } // caps output flooding
      }
    });

    await container.start();

    // .catch matters: if the timeout wins and we remove the container, this promise rejects later,
    // and an unhandled rejection would crash the whole worker process.
    const finished = container.wait().catch(() => ({ StatusCode: -1 }));
    const timedOut = new Promise<'timeout'>(resolve => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    const outcome = await Promise.race([finished, timedOut]);

    if (typeof outcome === 'string') {
      await container.kill().catch(() => {});
      return { verdict: 'timeout', output: '', exitCode: null, durationMs: Date.now() - started };
    }
    if (outcome.StatusCode === -1) throw new Error('Sandbox lost track of container'); // infrastructure error: let BullMQ retry

    const info = await container.inspect();
    const logs = await container.logs({ stdout: true, stderr: true });
    const output = normalise(logs.toString());
    const durationMs = Date.now() - started;

    if (info.State.OOMKilled) return { verdict: 'memory_limit', output, exitCode: outcome.StatusCode, durationMs };
    if (outcome.StatusCode !== 0) return { verdict: 'runtime_error', output, exitCode: outcome.StatusCode, durationMs };
    return { verdict: 'ok', output, exitCode: 0, durationMs };
  } finally {
    if (timer) clearTimeout(timer);
    if (container) await container.remove({ force: true }).catch(() => {});
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// On worker start: remove containers left behind by a crashed worker (older than 60s so we never touch live ones).
export async function cleanupOrphans(): Promise<number> {
  const list = await docker.listContainers({ all: true, filters: { label: [`app=${LABEL}`] } });
  const stale = list.filter(c => Date.now() / 1000 - c.Created > 60);
  await Promise.all(stale.map(c => docker.getContainer(c.Id).remove({ force: true }).catch(() => {})));
  return stale.length;
}