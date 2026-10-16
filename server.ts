import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes from './src/routes/auth';
import jobsRoutes from './src/routes/jobs';
import submissionsRoutes from './src/routes/submissions';
import resumesRoutes from './src/routes/resumes';
import matchesRoutes from './src/routes/matches';
import healthRoutes from './src/routes/health';
import { authLimiter } from './src/middleware/rateLimit';
import { logger } from './src/logger';

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/health', healthRoutes);

app.use('/auth', authLimiter, authRoutes);
app.use('/jobs', jobsRoutes);
app.use('/submissions', submissionsRoutes);
app.use('/resumes', resumesRoutes);
app.use('/matches', matchesRoutes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info({ event: 'server_started', port: PORT }));