import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { prisma } from '../db/prisma.js';

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

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      memberships: {
        select: {
          teamId: true,
          role: true,
          team: { select: { name: true } },
        },
      },
    },
  });

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const memberships = user.memberships.map((membership) => ({
    teamId: membership.teamId,
    teamName: membership.team.name,
    role: membership.role,
  }));

  req.user = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    memberships,
  };

  next();
}
