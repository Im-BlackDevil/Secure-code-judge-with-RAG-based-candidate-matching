import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET as string) as { id: number; role: 'student' | 'recruiter' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export default requireAuth;