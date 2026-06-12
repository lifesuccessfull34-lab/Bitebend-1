import { Router } from 'express';
import { requireApiSecret } from '../middlewares/auth';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getStatus,
  getAllStatus,
} from '../controllers/whatsappController';
import { sendMessage } from '../controllers/sendMessageController';

const router = Router();

router.use(requireApiSecret);

router.post('/whatsapp/connect', connectWhatsApp);
router.post('/whatsapp/disconnect', disconnectWhatsApp);
router.get('/whatsapp/status', getAllStatus);
router.get('/whatsapp/status/:restaurantId', getStatus);

router.post('/send-message', sendMessage);

export default router;
