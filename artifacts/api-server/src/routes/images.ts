import { Router, type IRouter, type Request, type Response } from "express";
import { db, imageBlobs } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

/**
 * GET /images/:id
 *
 * Public endpoint — no auth required.
 * Serves images and self-hosted videos stored in PostgreSQL as base64 blobs.
 *
 * Supports HTTP Range requests (RFC 7233) so that <video> elements can seek.
 * Without byte-range support browsers cannot scrub video position.
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
    const totalSize = buffer.length;

    // ETag based on image id — immutable once written so id is stable
    const etag = `"${crypto.createHash("md5").update(id).digest("hex")}"`;
    const clientEtag = req.headers["if-none-match"];
    if (clientEtag === etag) {
      res.status(304).end();
      return;
    }

    // Always advertise range support — required for <video> seeking in all browsers
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", etag);

    const rangeHeader = req.headers["range"];
    if (rangeHeader) {
      // Parse "bytes=start-end" — RFC 7233 §2.1
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (!match) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
        return;
      }

      const start = match[1] !== "" ? parseInt(match[1], 10) : totalSize - parseInt(match[2] ?? "0", 10);
      const end   = match[2] !== "" ? parseInt(match[2], 10) : totalSize - 1;

      if (isNaN(start) || isNaN(end) || start > end || end >= totalSize) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
        return;
      }

      const chunk = buffer.subarray(start, end + 1);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      res.setHeader("Content-Length", String(chunk.length));
      res.end(chunk);
      return;
    }

    // Full response
    res.setHeader("Content-Length", String(totalSize));
    res.end(buffer);
  } catch (err) {
    req.log.error({ err }, "Image serve — DB read failed");
    res.status(500).json({ error: "Failed to load image" });
  }
});

export default router;
