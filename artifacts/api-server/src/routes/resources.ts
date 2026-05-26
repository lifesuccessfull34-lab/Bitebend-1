import { Router } from "express";
import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import { resources } from "@workspace/db";
import { and, or, isNull, lte, gt, eq, inArray } from "drizzle-orm";

const router = Router();

// GET /api/resources — public (no auth required).
// Server-side enforces ALL of:
//   • deletedAt IS NULL
//   • status = 'active'
//   • approvalStatus = 'approved'
//   • publishAt <= now (or null)
//   • expireAt > now (or null)
//   • visibleTo IN ('public', 'all')   ← visibility gate
// Never rely on frontend filtering.
const listApprovedResources: RequestHandler = async (_req, res) => {
  const now = new Date();
  const rows = await db
    .select()
    .from(resources)
    .where(
      and(
        isNull(resources.deletedAt),
        eq(resources.status, "active"),
        eq(resources.approvalStatus, "approved"),
        or(isNull(resources.publishAt), lte(resources.publishAt!, now)),
        or(isNull(resources.expireAt), gt(resources.expireAt!, now)),
        inArray(resources.visibleTo, ["public", "all"]),
      ),
    )
    .orderBy(resources.displayOrder);
  res.json(rows);
};

router.get("/resources", listApprovedResources);

export default router;
