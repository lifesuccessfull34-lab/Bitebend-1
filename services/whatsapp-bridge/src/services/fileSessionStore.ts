import fs from 'fs';
import path from 'path';
import config from '../config';
import logger from '../utils/logger';

function sessionPath(restaurantId: number): string {
  return path.join(config.sessionDir, `restaurant_${restaurantId}`);
}

export function ensureSessionDir(restaurantId: number): void {
  const dir = sessionPath(restaurantId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.debug(`Created session directory: ${dir}`);
  }
}

export function sessionExists(restaurantId: number): boolean {
  const dir = sessionPath(restaurantId);
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

export function deleteSessionFiles(restaurantId: number): void {
  const dir = sessionPath(restaurantId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    logger.info(`Deleted session files for restaurant ${restaurantId}`);
  }
}

export function getSessionDataPath(restaurantId: number): string {
  ensureSessionDir(restaurantId);
  return sessionPath(restaurantId);
}
