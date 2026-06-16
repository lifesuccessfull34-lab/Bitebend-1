import { Message, MessageTypes } from 'whatsapp-web.js';
import logger from '../utils/logger';
import { sendWebhook, sendPaymentScreenshotWebhook } from './webhookSender';
import { storeMedia } from '../services/imageStorage';

const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(jpe?g|png)/i;

export async function handleIncomingMessage(restaurantId: number, msg: Message): Promise<void> {
  if (msg.fromMe) return;

  const customerPhone = msg.from.replace('@c.us', '');
  const timestamp = new Date(msg.timestamp * 1000).toISOString();

  logger.info(`Incoming message from ${customerPhone} → restaurant ${restaurantId}`, {
    type: msg.type,
  });

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
    await sendPaymentScreenshotWebhook({ restaurantId, customerPhone, imageUrl, timestamp });
    return;
  }

  if (msg.type === MessageTypes.TEXT) {
    const urlMatch = msg.body.match(IMAGE_URL_REGEX);
    if (urlMatch) {
      const imageUrl = urlMatch[0];
      logger.info(`Detected image URL in text message from ${customerPhone}`, { imageUrl });
      await sendWebhook({ restaurantId, customerPhone, messageType: 'image', imageUrl, timestamp });
      await sendPaymentScreenshotWebhook({ restaurantId, customerPhone, imageUrl, timestamp });
      return;
    }

    await sendWebhook({ restaurantId, customerPhone, messageType: 'text', text: msg.body, timestamp });
    return;
  }

  logger.debug(`Skipping unsupported message type: ${msg.type} from ${customerPhone}`);
}
