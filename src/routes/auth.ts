import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../db/pool';
import { User } from '../types';

const router = express.Router();

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(['student', 'recruiter']),
  inviteCode: z.string().optional()
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post('/signup', async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
  }
  const { name, email, password, role, inviteCode } = parsed.data;

  const expected = process.env.RECRUITER_INVITE_CODE;
  if (role === 'recruiter' && (!expected || inviteCode !== expected)) {
    return res.status(403).json({ error: 'Invalid recruiter invite code' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query<User>(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [name, email, hash, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    throw err; // falls through to the global error handler; never echo DB errors to the client
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { email, password } = parsed.data;

  const result = await pool.query<User>('SELECT * FROM users WHERE email=$1', [email]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

export default router;