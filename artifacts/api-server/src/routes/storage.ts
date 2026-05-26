import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 */
router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;

      const { stream, contentType, cacheTtlSec } =
        await objectStorageService.streamPublicObject(filePath);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", `public, max-age=${cacheTtlSec}`);
      stream.pipe(res);

      stream.on("error", (err: Error) => {
        req.log.error({ err }, "Error streaming public object");
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to serve public object" });
        } else {
          res.destroy();
        }
      });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve public object" });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve private object entities uploaded via the upload-image endpoint.
 * Currently public (no ACL checks) — menu customers must be able to load
 * dish photos without logging in.
 */
router.get(
  "/storage/objects/*path",
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;

      const { stream, contentType, cacheTtlSec } =
        await objectStorageService.streamObjectEntity(objectPath);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", `public, max-age=${cacheTtlSec}`);
      stream.pipe(res);

      stream.on("error", (err: Error) => {
        req.log.error({ err }, "Error streaming object entity");
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to serve object" });
        } else {
          res.destroy();
        }
      });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

export default router;
