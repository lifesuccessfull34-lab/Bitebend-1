import { Message, MessageTypes } from 'whatsapp-web.js';
import logger from '../utils/logger';
import { sendWebhook } from './webhookSender';
import { storeMedia } from '../services/imageStorage';

export async function handleIncomingMessage(restaurantId: number, msg: Message): Promise<void> {
  if (msg.fromMe) return;

  const customerPhone = msg.from.replace('@c.us', '');
  const timestamp = new Date(msg.timestamp * 1000).toISOString();

  logger.info(`Incoming message from ${customerPhone} → restaurant ${restaurantId}`, {
    type: msg.type,
  });

  if (msg.type === MessageTypes.TEXT) {
    await sendWebhook({ restaurantId, customerPhone, messageType: 'text', text: msg.body, timestamp });
    return;
  }

  if (msg.type === MessageTypes.IMAGE) {
    let imageUrl: string;
    try {
      const media = await msg.downloadMedia();
      if (!media) {
        logger.warn(`Failed to download image from ${customerPhone}`);
        return;
      }
      imageUrl = await storeMedia(restaurantId, media, timestamp);
    } catch (err) {
      logger.error(`Image download/store failed`, {
        restaurantId,
        phone: customerPhone,
        error: (err as Error).message,
      });
      return;
    }
    await sendWebhook({ restaurantId, customerPhone, messageType: 'image', imageUrl, timestamp });
    return;
  }

  logger.debug(`Skipping unsupported message type: ${msg.type} from ${customerPhone}`);
}
