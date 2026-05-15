import { Router, type IRouter, type Request, type Response } from "express";
import { db, imageBlobs } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

/**
 * GET /images/:id
 *
 * Public endpoint — no auth required.
 * Serves menu item and restaurant images stored in PostgreSQL.
 * Images are stored as base64 text and returned as binary with the
 * original Content-Type, long-lived cache headers, and ETag support.
 */
router.get("/images/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  try {
    const [image] = await db
      .select()
      .from(imageBlobs)
      .where(eq(imageBlobs.id, id))
      .limit(1);

    if (!image) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    const buffer = Buffer.from(image.data, "base64");

    // ETag based on image id — immutable once written so id is stable
    const etag = `"${crypto.createHash("md5").update(id).digest("hex")}"`;
    const clientEtag = req.headers["if-none-match"];
    if (clientEtag === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", etag);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (err) {
    req.log.error({ err }, "Image serve — DB read failed");
    res.status(500).json({ error: "Failed to load image" });
  }
});

export default router;
