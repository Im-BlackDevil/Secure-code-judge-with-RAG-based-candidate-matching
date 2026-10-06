import { Queue } from 'bullmq';
import connection from './connection';

export const resumeQueue = new Queue('resume-processing', { connection });