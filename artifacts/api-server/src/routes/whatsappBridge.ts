import { Router } from "express";
import { requireOwner } from "../middlewares/auth";
import { logger } from "../lib/logger";
import type { RequestHandler } from "express";

const router = Router();

const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://localhost:3001";
const BRIDGE_API_SECRET = process.env.BRIDGE_API_SECRET ?? "";
const BITEBEND_WEBHOOK_SECRET = process.env.BITEBEND_WEBHOOK_SECRET ?? "";

function bridgeHeaders() {
  return {
    "Content-Type": "application/json",
    ...(BRIDGE_API_SECRET ? { "x-bridge-secret": BRIDGE_API_SECRET } : {}),
  };
}

async function callBridge(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method,
    headers: bridgeHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Owner: trigger WhatsApp QR / connect ──────────────────────────────────────
const connectHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) {
    res.status(400).json({ error: "No restaurant associated with this account" });
    return;
  }
  try {
    const data = await callBridge("/api/whatsapp/connect", "POST", { restaurantId });
    res.json(data);
  } catch {
    res.status(503).json({ error: "WhatsApp Bridge unreachable. Make sure the bridge service is running." });
  }
};

// ── Owner: disconnect ─────────────────────────────────────────────────────────
const disconnectHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) {
    res.status(400).json({ error: "No restaurant associated with this account" });
    return;
  }
  try {
    const data = await callBridge("/api/whatsapp/disconnect", "POST", { restaurantId });
    res.json(data);
  } catch {
    res.status(503).json({ error: "WhatsApp Bridge unreachable" });
  }
};

// ── Owner: get current status ─────────────────────────────────────────────────
const statusHandler: RequestHandler = async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) {
    res.status(400).json({ error: "No restaurant associated with this account" });
    return;
  }
  try {
    const data = await callBridge(`/api/whatsapp/status/${restaurantId}`, "GET");
    // Bridge reachable — include flag so the portal can distinguish this from a bridge-down state
    res.json({ ...data, bridgeReachable: true });
  } catch {
    // Bridge not running — return graceful not_initialised but flag it clearly
    res.status(200).json({ success: true, status: "not_initialised", bridgeReachable: false, restaurantId });
  }
};

router.post("/owner/whatsapp/connect",    requireOwner, connectHandler);
router.post("/owner/whatsapp/disconnect", requireOwner, disconnectHandler);
router.get("/owner/whatsapp/status",      requireOwner, statusHandler);

// ── Incoming webhook from the bridge (no session auth — verified by secret) ───
router.post("/whatsapp/incoming", ((req, res) => {
  const secret = req.headers["x-webhook-secret"];
  if (BITEBEND_WEBHOOK_SECRET && secret !== BITEBEND_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { restaurantId, customerPhone, messageType, text, imageUrl, timestamp } = req.body as {
    restaurantId: number;
    customerPhone: string;
    messageType: string;
    text?: string;
    imageUrl?: string;
    timestamp: string;
  };

  logger.info(
    { restaurantId, customerPhone, messageType, timestamp },
    "[whatsapp:incoming] message received"
  );

  // Future: store message in DB, push to dashboard via SSE/WebSocket
  void text; void imageUrl;

  res.json({ ok: true });
}) as RequestHandler);

export default router;
