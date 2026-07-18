import util from 'util';
import { Message, MessageTypes } from 'whatsapp-web.js';
import logger from '../utils/logger';
import { sendWebhook, sendPaymentScreenshotWebhook } from './webhookSender';
import { storeMedia } from '../services/imageStorage';

const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(jpe?g|png)/i;

/**
 * Resolve the sender's real phone number from a WhatsApp message.
 *
 * WhatsApp-web.js exposes two JID formats for msg.from:
 *
 *   @c.us  — classic format: "917086670033@c.us"
 *            Strip the suffix → "917086670033"
 *
 *   @lid   — Linked Device ID, used by newer WhatsApp accounts that have enabled
 *            the new multi-device architecture: "268641748652129@lid"
 *            This is an internal WA identifier, NOT a phone number.
 *            Must be resolved via msg.getContact() to get the real number.
 *
 * Sending the raw @lid string to the API causes normalization to fail (422)
 * because the digit sequence (15 chars) matches none of the expected Indian
 * phone formats (10 / 12 / 11 digits).
 */
async function resolvePhone(msg: Message): Promise<string> {
  const raw = msg.from;

  if (raw.endsWith('@c.us')) {
    return raw.replace('@c.us', '');
  }

  if (raw.endsWith('@lid')) {
    try {
      const contact = await msg.getContact();
      // contact.number is the phone without '+', e.g. "917086670033"
      // contact.id.user is the same value but falls back to the LID user part
      const resolved = contact.number || contact.id.user;
      logger.debug(`Resolved @lid ${raw} → phone ${resolved}`);
      return resolved;
    } catch (err) {
      logger.warn(`Could not resolve @lid to phone: ${raw}`, {
        error: (err as Error).message,
      });
      // Fall through: return the user part of the JID — the API will 422
      // but this is better than silently dropping the message
      return raw.split('@')[0];
    }
  }

  // Any other suffix (@g.us for groups, etc.) — extract the user part
  return raw.split('@')[0];
}

export async function handleIncomingMessage(restaurantId: number, msg: Message): Promise<void> {
  if (msg.fromMe) return;

  const customerPhone = await resolvePhone(msg);
  const timestamp = new Date(msg.timestamp * 1000).toISOString();

  logger.info(`Incoming message from ${customerPhone} → restaurant ${restaurantId}`, {
    rawFrom: msg.from,
    type: msg.type,
  });

  if (msg.type === MessageTypes.IMAGE) {
    let imageUrl: string;
    try {
      logger.info("[media] before downloadMedia");
      const media = await msg.downloadMedia();
      logger.info("[media] after downloadMedia");
      if (!media) {
        logger.warn(`Failed to download image from ${customerPhone}`);
        return;
      }
      logger.info("[media] media mime=%s size=%d",
        media.mimetype,
        media.data?.length ?? 0);
      logger.info("[media] before storeMedia");
      imageUrl = await storeMedia(restaurantId, media, timestamp);
      logger.info("[media] after storeMedia");
    } catch (err) {
      logger.error("Image download/store failed", {
        restaurantId,
        phone: customerPhone,
        isError: err instanceof Error,
        name: err instanceof Error ? err.name : undefined,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        inspected: util.inspect(err, { depth: 10 }),
      });
      return;
    }

    logger.info('[media] before sendWebhook (image)');
    await sendWebhook({ restaurantId, customerPhone, messageType: 'image', imageUrl, timestamp });
    logger.info('[media] after sendWebhook (image)');
    logger.info('[media] before sendPaymentScreenshotWebhook');
    await sendPaymentScreenshotWebhook({ restaurantId, customerPhone, imageUrl, timestamp });
    logger.info('[media] after sendPaymentScreenshotWebhook');
    return;
  }

  if (msg.type === MessageTypes.TEXT) {
    const urlMatch = msg.body.match(IMAGE_URL_REGEX);
    if (urlMatch) {
      const imageUrl = urlMatch[0];
      logger.info(`Detected image URL in text message from ${customerPhone}`, { imageUrl });
      logger.info('[media] before sendWebhook (text-image-url)');
      await sendWebhook({ restaurantId, customerPhone, messageType: 'image', imageUrl, timestamp });
      logger.info('[media] after sendWebhook (text-image-url)');
      logger.info('[media] before sendPaymentScreenshotWebhook (text-image-url)');
      await sendPaymentScreenshotWebhook({ restaurantId, customerPhone, imageUrl, timestamp });
      logger.info('[media] after sendPaymentScreenshotWebhook (text-image-url)');
      return;
    }

    logger.info('[media] before sendWebhook (text)');
    await sendWebhook({ restaurantId, customerPhone, messageType: 'text', text: msg.body, timestamp });
    logger.info('[media] after sendWebhook (text)');
    return;
  }

  logger.debug(`Skipping unsupported message type: ${msg.type} from ${customerPhone}`);
}
