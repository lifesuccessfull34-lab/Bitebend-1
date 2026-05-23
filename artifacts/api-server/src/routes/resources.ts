import { Router } from "express";
import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import { resources } from "@workspace/db";
import { and, or, isNull, lte, gt, eq } from "drizzle-orm";

const router = Router();

// GET /api/resources — public; only active + approved + within publish/expire window
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
      ),
    )
    .orderBy(resources.displayOrder);
  res.json(rows);
};

router.get("/resources", listApprovedResources);

export default router;
