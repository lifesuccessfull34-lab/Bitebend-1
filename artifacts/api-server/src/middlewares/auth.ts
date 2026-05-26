import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";

export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.user = user;
  next();
};

export const requireOwner: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "owner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  req.user = user;
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  req.user = user;
  next();
};
