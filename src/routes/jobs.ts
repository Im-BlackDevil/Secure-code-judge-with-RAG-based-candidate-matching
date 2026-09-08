import express, { Request, Response } from 'express';
import pool from '../db/pool';
import requireAuth from '../middleware/auth';
import { Job } from '../types';

const router = express.Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (req.user?.role !== 'recruiter') {
    return res.status(403).json({ error: 'Only recruiters can post jobs' });
  }
  const { title, description, required_skills } = req.body;
  const result = await pool.query<Job>(
    'INSERT INTO jobs (recruiter_id, title, description, required_skills) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user!.id, title, description, required_skills]
  );
  res.status(201).json(result.rows[0]);
});

router.get('/', async (req: Request, res: Response) => {
  const result = await pool.query<Job>('SELECT * FROM jobs ORDER BY created_at DESC');
  res.json(result.rows);
});

export default router;