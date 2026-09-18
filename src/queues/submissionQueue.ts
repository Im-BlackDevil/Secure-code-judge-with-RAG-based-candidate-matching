import { Queue } from 'bullmq';
import connection from './connection';

export const submissionQueue = new Queue('code-execution', { connection });