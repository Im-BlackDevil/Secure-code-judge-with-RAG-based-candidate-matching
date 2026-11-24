import { Queue } from 'bullmq';
import { producerConnection } from './connection';

export const resumeQueue = new Queue('resume-processing', { connection: producerConnection });