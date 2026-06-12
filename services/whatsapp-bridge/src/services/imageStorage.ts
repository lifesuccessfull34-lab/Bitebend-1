import fs from 'fs';
import path from 'path';
import { MessageMedia } from 'whatsapp-web.js';
import config from '../config';
import logger from '../utils/logger';

function ensureUploadsDir(): void {
  if (!fs.existsSync(config.uploadsDir)) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  }
}

export async function storeMedia(
  restaurantId: number,
  media: MessageMedia,
  timestamp: string
): Promise<string> {
  ensureUploadsDir();
  const ext = media.mimetype.split('/')[1]?.split(';')[0] ?? 'jpg';
  const filename = `r${restaurantId}_${Date.now()}.${ext}`;
  const filePath = path.join(config.uploadsDir, filename);
  const buffer = Buffer.from(media.data, 'base64');
  fs.writeFileSync(filePath, buffer);
  const publicUrl = `${config.publicBaseUrl}/uploads/${filename}`;
  logger.debug(`Stored media: ${publicUrl} (ts=${timestamp})`);
  return publicUrl;
}
