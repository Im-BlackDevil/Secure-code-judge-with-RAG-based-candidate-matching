import { Queue } from 'bullmq';
import { producerConnection } from './connection';

export const submissionQueue = new Queue('code-execution', { connection: producerConnection });