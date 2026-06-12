import { Request, Response, NextFunction } from 'express';
import config from '../config';
import logger from '../utils/logger';

export function requireApiSecret(req: Request, res: Response, next: NextFunction): void {
  if (!config.bridgeApiSecret) {
    logger.warn('BRIDGE_API_SECRET not set – API is unprotected!');
    next();
    return;
  }

  const provided = req.headers['x-bridge-secret'];
  if (provided !== config.bridgeApiSecret) {
    res.status(401).json({ success: false, error: 'Unauthorised' });
    return;
  }

  next();
}
