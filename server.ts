import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes from './src/routes/auth';
import jobsRoutes from './src/routes/jobs';
import submissionsRoutes from './src/routes/submissions';
import resumesRoutes from './src/routes/resumes';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/jobs', jobsRoutes);
app.use('/submissions', submissionsRoutes);
app.use('/resumes', resumesRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));