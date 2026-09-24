"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const connection_1 = __importDefault(require("../queues/connection"));
const pool_1 = __importDefault(require("../db/pool"));
const dockerSandbox_1 = require("./dockerSandbox");
const worker = new bullmq_1.Worker('code-execution', async (job) => {
    const { submissionId, problemId, code } = job.data;
    const testCases = await pool_1.default.query('SELECT * FROM test_cases WHERE problem_id=$1', [problemId]);
    let status = 'Accepted';
    for (const test of testCases.rows) {
        const result = await (0, dockerSandbox_1.runInSandbox)(code, test.input);
        if (result.timedOut) {
            status = 'Time Limit Exceeded';
            break;
        }
        if (result.errored) {
            status = 'Runtime Error';
            break;
        }
        if (result.output !== test.expected_output.trim()) {
            status = 'Wrong Answer';
            break;
        }
    }
    await pool_1.default.query('UPDATE submissions SET status=$1 WHERE id=$2', [status, submissionId]);
}, { connection: connection_1.default });
worker.on('completed', (job) => console.log(`Job ${job.id} finished`));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err));
console.log('Execution worker is listening for jobs...');
