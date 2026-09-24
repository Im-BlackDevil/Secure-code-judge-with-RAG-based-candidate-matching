"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInSandbox = runInSandbox;
const dockerode_1 = __importDefault(require("dockerode"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const docker = new dockerode_1.default(); // auto-connects to the local Docker daemon
async function runInSandbox(code, input, timeoutMs = 5000) {
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempDir = path_1.default.join(process.cwd(), 'tmp', jobId);
    fs_1.default.mkdirSync(tempDir, { recursive: true });
    fs_1.default.writeFileSync(path_1.default.join(tempDir, 'solution.py'), code);
    fs_1.default.writeFileSync(path_1.default.join(tempDir, 'input.txt'), input);
    const container = await docker.createContainer({
        Image: 'python:3.11-slim',
        Cmd: ['sh', '-c', 'python3 /app/solution.py < /app/input.txt'],
        Tty: true,
        HostConfig: {
            Binds: [`${tempDir}:/app`],
            Memory: 128 * 1024 * 1024, // 128MB hard cap
            NanoCpus: 500000000, // 0.5 CPU
            PidsLimit: 50, // blocks fork bombs
            NetworkMode: 'none' // no internet access from inside the sandbox
        }
    });
    let timedOut = false;
    let errored = false;
    let output = '';
    try {
        await container.start();
        const waitPromise = container.wait();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
        await Promise.race([waitPromise, timeoutPromise]);
        const logs = await container.logs({ stdout: true, stderr: true });
        output = logs.toString().trim();
    }
    catch (err) {
        if (err.message === 'timeout') {
            timedOut = true;
            try {
                await container.kill();
            }
            catch { }
        }
        else {
            errored = true;
        }
    }
    finally {
        try {
            await container.remove({ force: true });
        }
        catch { }
        fs_1.default.rmSync(tempDir, { recursive: true, force: true });
    }
    return { output, timedOut, errored };
}
