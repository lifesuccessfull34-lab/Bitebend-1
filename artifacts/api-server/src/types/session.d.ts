import "express-session";
import type { users } from "@workspace/db";

type DbUser = typeof users.$inferSelect;

declare module "express-session" {
  interface SessionData {
    userId: number;
    sensitiveActionExpiresAt?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: DbUser;
    }
  }
}
