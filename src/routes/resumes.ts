import express, { Request, Response } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import pool from '../db/pool';
import requireAuth from '../middleware/auth';
import { ResumeProfile } from '../types';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', requireAuth, upload.single('resume'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No resume file uploaded' });
  }
  const data = await pdfParse(req.file.buffer);
  const result = await pool.query<ResumeProfile>(
    'INSERT INTO resume_profiles (student_id, raw_text) VALUES ($1,$2) RETURNING id, student_id, created_at',
    [req.user!.id, data.text]
  );
  res.status(201).json(result.rows[0]);
});

export default router;