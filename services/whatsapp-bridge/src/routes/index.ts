import { Router, IRouter } from 'express';
import { requireApiSecret } from '../middlewares/auth';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getStatus,
  getAllStatus,
} from '../controllers/whatsappController';
import { sendMessage } from '../controllers/sendMessageController';
import { sendMedia } from '../controllers/sendMediaController';

const router: IRouter = Router();

router.use(requireApiSecret);

router.post('/whatsapp/connect', connectWhatsApp);
router.post('/whatsapp/disconnect', disconnectWhatsApp);
router.get('/whatsapp/status', getAllStatus);
router.get('/whatsapp/status/:restaurantId', getStatus);

router.post('/send-message', sendMessage);
router.post('/send-media', sendMedia);

export default router;
