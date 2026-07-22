import { Router, IRouter } from 'express';
import { requireApiSecret } from '../middlewares/auth';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getStatus,
  getAllStatus,
  getQrStatusHandler,
} from '../controllers/whatsappController';
import { sendMessage } from '../controllers/sendMessageController';
import { sendMedia } from '../controllers/sendMediaController';
import {
  idbProbeHandler,
  screenshotHandler,
  idbInterceptorStateHandler,
} from '../controllers/diagController';

const router: IRouter = Router();

router.use(requireApiSecret);

router.post('/whatsapp/connect', connectWhatsApp);
router.post('/whatsapp/disconnect', disconnectWhatsApp);
router.get('/whatsapp/status', getAllStatus);
router.get('/whatsapp/status/:restaurantId', getStatus);
router.get('/whatsapp/qr-status/:restaurantId', getQrStatusHandler);

router.post('/send-message', sendMessage);
router.post('/send-media', sendMedia);

// ── Diagnostic endpoints (TEST 3 / TEST 4) ────────────────────────────────────
// TEST 3: GET  /api/diag/screenshot/:restaurantId
//   Returns an HTML page with a live PNG of the WhatsApp Web browser.
//   Proves whether WA Web itself can display the failing image.
//
// TEST 4: POST /api/diag/idb-probe
//   Body: { restaurantId, msgId }
//   Runs Msg.get() + Msg.getMessagesById() on the live page and returns the
//   exact IDB key constructed by WA Web, including any invalid-key errors.
//
// GET /api/diag/idb-interceptor/:restaurantId
//   Reads window.__idbProbe — all IDB get() calls recorded since 'ready'.
router.get('/diag/screenshot/:restaurantId',    screenshotHandler);
router.post('/diag/idb-probe',                  idbProbeHandler);
router.get('/diag/idb-interceptor/:restaurantId', idbInterceptorStateHandler);

export default router;
