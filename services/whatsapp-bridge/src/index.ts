import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';

import config from './config';
import logger from './utils/logger';
import routes from './routes';
import { setSocketIO } from './services/whatsappClient';

const app = express();
const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

setSocketIO(io);

io.on('connection', (socket) => {
  const restaurantId = socket.handshake.query.restaurantId as string;
  if (restaurantId) {
    const room = `restaurant_${restaurantId}`;
    socket.join(room);
    logger.info(`Socket connected – restaurant ${restaurantId} joined room ${room}`);
  } else {
    logger.warn(`Socket connected without restaurantId: ${socket.id}`);
  }

  socket.on('disconnect', () => {
    logger.debug(`Socket disconnected: ${socket.id}`);
  });
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.url === '/health',
  })
);

app.use('/uploads', express.static(path.resolve(config.uploadsDir)));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'whatsapp-bridge', ts: new Date().toISOString() });
});

app.use('/api', routes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

httpServer.listen(config.port, () => {
  logger.info(`WhatsApp Bridge running on port ${config.port} [${config.nodeEnv}]`);
  logger.info(`  Session store : ${config.sessionStore}`);
  logger.info(`  Bitebend hook : ${config.bitebendWebhookUrl}`);
});

export { app, httpServer, io };
