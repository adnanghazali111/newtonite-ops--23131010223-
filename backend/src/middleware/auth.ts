import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { query } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  memberships: Array<{
    teamId: string;
    teamName: string;
    role: "Viewer" | "Member" | "Lead" | "Admin";
  }>;
}

declare module "express" {
  interface Request {
    user?: AuthUser;
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed authorization header" });
    return;
  }

  const token = header.slice(7);

  let decoded: { userId: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Look up the user
  const userResult = await query(
    `SELECT id, email, display_name FROM users WHERE id = $1`,
    [decoded.userId],
  );

  if (userResult.rows.length === 0) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const row = userResult.rows[0];

  // Fetch team memberships
  const membershipResult = await query(
    `SELECT m.team_id, t.name AS team_name, m.role
       FROM memberships m
       JOIN teams t ON t.id = m.team_id
      WHERE m.user_id = $1`,
    [decoded.userId],
  );

  const memberships = membershipResult.rows.map((m) => ({
    teamId: m.team_id as string,
    teamName: m.team_name as string,
    role: m.role as "Viewer" | "Member" | "Lead" | "Admin",
  }));

  req.user = {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    memberships,
  };

  next();
}
