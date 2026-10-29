import express, { Request, Response } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import pool from '../db/pool';
import requireAuth from '../middleware/auth';
import { resumeQueue } from '../queues/resumeQueue';
import { ResumeProfile } from '../types';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Maximum 5 MB
  },
  fileFilter: (req, file, cb) => {
  if (file.mimetype !== 'application/pdf') {
    const error = new Error('Only PDF files are allowed') as Error & { status?: number };

    error.status = 400;
    return cb(error);
  }

  cb(null, true);
},
});

router.post('/', requireAuth, upload.single('resume'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No resume file uploaded' });

  let data;

try {
  data = await pdfParse(req.file.buffer);
} catch {
  return res.status(400).json({
    error: 'Could not read PDF',
  });
}

  const result = await pool.query<ResumeProfile>(
    'INSERT INTO resume_profiles (student_id, raw_text, status) VALUES ($1,$2,$3) RETURNING id, student_id, status, created_at',
    [req.user!.id, data.text, 'pending']
  );

  await resumeQueue.add(
  'process-resume',
  { resumeId: result.rows[0].id },
  {
    jobId: `resume-${result.rows[0].id}`,
    attempts: 4,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  }
);
  res.status(202).json(result.rows[0]);
});

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const result = await pool.query(
    `SELECT id, student_id, status, parsed, created_at
     FROM resume_profiles
     WHERE id = $1`,
    [id]
  );

  const resume = result.rows[0];

  if (
    !resume ||
    (req.user!.role !== 'recruiter' &&
      resume.student_id !== req.user!.id)
  ) {
    return res.status(404).json({ error: 'Resume not found' });
  }

  res.json(resume);
});

export default router;