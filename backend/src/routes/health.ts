import { Router } from "express";
import { prisma } from '../db/prisma.js';

const router = Router();

router.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ success: false, database: 'unavailable', timestamp: new Date().toISOString() });
  }
});

export default router;
