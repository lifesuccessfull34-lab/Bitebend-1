import { Readable } from "stream";

/**
 * Object storage stub.
 *
 * Replit's sidecar auth (http://127.0.0.1:1106) does not support write
 * operations in this environment. Image uploads use PostgreSQL instead
 * — see GET /api/images/:id and POST /api/owner/upload-image.
 *
 * The /api/storage/* routes are kept for forward-compatibility but will
 * return 404 for all objects until sidecar auth is resolved.
 */

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

interface StreamResult {
  stream: Readable;
  contentType: string;
  cacheTtlSec: number;
}

export class ObjectStorageService {
  async streamObjectEntity(_objectPath: string): Promise<StreamResult> {
    throw new ObjectNotFoundError();
  }

  async streamPublicObject(_filePath: string): Promise<StreamResult> {
    throw new ObjectNotFoundError();
  }
}
