/**
 * Diagnostic endpoints for the WhatsApp media download root-cause investigation.
 *
 * TEST 3  GET  /api/diag/screenshot/:restaurantId
 *   Returns an HTML page with a PNG screenshot of the live WhatsApp Web page in
 *   Chromium.  Open in a browser to confirm whether WA Web itself can display
 *   the failing image (rules out Chromium profile / browser-level corruption).
 *
 * TEST 4  POST /api/diag/idb-probe
 *   Body: { restaurantId: number, msgId: string }
 *   Runs WAWebCollections.Msg.get(msgId) and .getMessagesById([msgId]) inside
 *   the live pupPage and returns:
 *     mem                          — full WA internal Msg object from in-memory store
 *     idb                          — full WA internal Msg object from IndexedDB
 *     interceptor.callsDuringGetById — the EXACT IDB key(s) WA Web passed to
 *                                      IDBObjectStore.get() during the getMessagesById
 *                                      call.  isInvalid: true → undefined/null key →
 *                                      DataError root cause confirmed.
 *
 *   GET  /api/diag/idb-interceptor/:restaurantId
 *   Returns the accumulated window.__idbProbe state — all IDB get() calls
 *   recorded since the 'ready' event injected the interceptor.
 */

import { Request, Response } from 'express';
import {
  probeMsgIdb,
  capturePageScreenshot,
  readIdbInterceptorState,
} from '../services/whatsappClient';
import logger from '../utils/logger';

// ── TEST 4: on-demand IDB probe ────────────────────────────────────────────────

export async function idbProbeHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = parseInt(req.body.restaurantId, 10);
  const msgId        = typeof req.body.msgId === 'string' ? req.body.msgId.trim() : '';

  if (!restaurantId || isNaN(restaurantId)) {
    res.status(400).json({ success: false, error: 'restaurantId (number) is required' });
    return;
  }
  if (!msgId) {
    res.status(400).json({ success: false, error: 'msgId (string) is required — e.g. false_917xxx@c.us_HEXID' });
    return;
  }

  logger.info('[diag] idb-probe requested', { restaurantId, msgId });

  try {
    const result = await probeMsgIdb(restaurantId, msgId);
    logger.info('[diag] idb-probe complete', { restaurantId, msgId, result });
    res.json({ success: true, restaurantId, msgId, result });
  } catch (err) {
    logger.error('[diag] idb-probe threw', { error: (err as Error).message });
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

// ── TEST 3: WhatsApp Web screenshot ───────────────────────────────────────────

export async function screenshotHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = parseInt(req.params.restaurantId, 10);

  if (!restaurantId || isNaN(restaurantId)) {
    res.status(400).json({ success: false, error: 'restaurantId is required' });
    return;
  }

  logger.info('[diag] screenshot requested', { restaurantId });

  try {
    const b64 = await capturePageScreenshot(restaurantId);
    if (!b64) {
      res.status(503).json({
        success: false,
        error:   'Page not available — is the client connected?',
      });
      return;
    }

    const ts   = new Date().toISOString();
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WA Web — restaurant ${restaurantId} — ${ts}</title>
  <style>
    body { margin: 0; background: #111; display: flex; flex-direction: column;
           align-items: center; font-family: monospace; color: #ccc; }
    img  { max-width: 100%; height: auto; display: block; }
    p    { padding: 8px; font-size: 12px; }
  </style>
</head>
<body>
  <p>Restaurant ${restaurantId} — ${ts}</p>
  <img src="data:image/png;base64,${b64}" alt="WhatsApp Web screenshot">
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    logger.error('[diag] screenshot threw', { error: (err as Error).message });
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

// ── Read accumulated IDB interceptor state ─────────────────────────────────────

export async function idbInterceptorStateHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = parseInt(req.params.restaurantId, 10);

  if (!restaurantId || isNaN(restaurantId)) {
    res.status(400).json({ success: false, error: 'restaurantId is required' });
    return;
  }

  try {
    const state = await readIdbInterceptorState(restaurantId);
    if (!state) {
      res.status(503).json({ success: false, error: 'Page not available or no client found' });
      return;
    }
    res.json({ success: true, restaurantId, state });
  } catch (err) {
    logger.error('[diag] idb-interceptor-state threw', { error: (err as Error).message });
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}
