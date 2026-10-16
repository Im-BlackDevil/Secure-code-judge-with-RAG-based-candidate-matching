import rateLimit from 'express-rate-limit';
import { Request } from 'express';

// Brute-force protection on signup/login (per IP)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

// Per-user limit on submissions. Must run AFTER requireAuth.
export const submissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX ?? 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => String(req.user!.id)
});