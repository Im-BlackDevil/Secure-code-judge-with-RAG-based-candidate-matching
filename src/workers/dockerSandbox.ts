import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';

const docker = new Docker(); // auto-connects to the local Docker daemon

interface RunResult {
  output: string;
  timedOut: boolean;
  errored: boolean;
}

export async function runInSandbox(code: string, input: string, timeoutMs = 5000): Promise<RunResult> {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempDir = path.join(process.cwd(), 'tmp', jobId);
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'solution.py'), code);
  fs.writeFileSync(path.join(tempDir, 'input.txt'), input);

  const container = await docker.createContainer({
    Image: 'python:3.11-slim',
    Cmd: ['sh', '-c', 'python3 /app/solution.py < /app/input.txt'],
    Tty: true,
    HostConfig: {
      Binds: [`${tempDir}:/app`],
      Memory: 128 * 1024 * 1024,   // 128MB hard cap
      NanoCpus: 500000000,          // 0.5 CPU
      PidsLimit: 50,                 // blocks fork bombs
      NetworkMode: 'none'            // no internet access from inside the sandbox
    }
  });

  let timedOut = false;
  let errored = false;
  let output = '';

  try {
    await container.start();

    const waitPromise = container.wait();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs)
    );
    await Promise.race([waitPromise, timeoutPromise]);

    const logs = await container.logs({ stdout: true, stderr: true });
    output = logs.toString().trim();
  } catch (err) {
    if ((err as Error).message === 'timeout') {
      timedOut = true;
      try { await container.kill(); } catch {}
    } else {
      errored = true;
    }
  } finally {
    try { await container.remove({ force: true }); } catch {}
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { output, timedOut, errored };
}