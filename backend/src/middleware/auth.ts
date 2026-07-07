import { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabaseClient.js';

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Middleware that verifies the Supabase JWT from the Authorization header.
 * Attaches `req.userId` if valid, returns 401 otherwise.
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.userId = data.user.id;
  next();
}
