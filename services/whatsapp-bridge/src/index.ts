import 'dotenv/config';
import http from 'http';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';

import config from './config';
import logger from './utils/logger';
import routes from './routes';
import { setSocketIO, getPendingQr, CHROMIUM_PATH, downloadMediaDirect } from './services/whatsappClient';
import { startRetryWorker } from './services/mediaQueue';

// ── Global process resilience ──────────────────────────────────────────────────
// These handlers ensure that unhandled promise rejections and uncaught
// exceptions (e.g. from Puppeteer CDP callbacks) are logged without
// terminating the bridge process.

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('[bridge] Unhandled promise rejection — bridge continues', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err: Error) => {
  logger.error('[bridge] Uncaught exception — bridge continues', {
    error: err.message,
    stack: err.stack,
  });
});

const app: Express = express();
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
  const transport   = socket.conn.transport.name;
  const url         = socket.handshake.url;

  // [trace:socket] Full handshake details — use this to diagnose room-join failures
  logger.info(
    `[ws:trace] Socket.IO connection received — id=${socket.id} transport=${transport} restaurantId=${restaurantId ?? '(missing)'} url=${url} query=${JSON.stringify(socket.handshake.query)}`,
  );

  if (restaurantId) {
    const room = `restaurant_${restaurantId}`;
    socket.join(room);

    // Count subscribers synchronously after join
    const size = io.sockets.adapter.rooms.get(room)?.size ?? 0;
    logger.info(
      `[ws:trace] Joined room ${room} — subscribers now ${size} (socketId=${socket.id})`,
    );

    // Re-deliver any cached QR to this socket if the client is already in
    // qr_pending state (common race: QR fired before socket joined the room).
    const pendingQr = getPendingQr(Number(restaurantId));
    if (pendingQr) {
      logger.info(
        `[qr:socket] QR served via Socket.IO (re-delivery) to late-joining socket id=${socket.id} room=${room} qrLength=${pendingQr.length}`,
      );
      socket.emit('whatsapp:qr', { restaurantId: Number(restaurantId), qr: pendingQr });
      socket.emit('whatsapp:status', { restaurantId: Number(restaurantId), status: 'qr_pending' });
    }
  } else {
    logger.warn(
      `[ws:trace] Socket connected WITHOUT restaurantId — will NOT receive QR events (socketId=${socket.id} query=${JSON.stringify(socket.handshake.query)})`,
    );
  }

  socket.conn.on('upgrade', (newTransport) => {
    logger.info(
      `[ws:trace] Transport upgraded ${transport} → ${newTransport.name} (socketId=${socket.id})`,
    );
  });

  socket.on('disconnect', (reason) => {
    logger.info(`[ws:trace] Socket disconnected id=${socket.id} reason=${reason}`);
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
  logger.info('='.repeat(60));
  logger.info(`WhatsApp Bridge running on port ${config.port} [${config.nodeEnv}]`);
  logger.info(`  Health check  : http://localhost:${config.port}/health`);
  logger.info(`  Session store : ${config.sessionStore}`);
  logger.info(`  Session dir   : ${config.sessionDir}`);
  logger.info(`  Bitebend hook : ${config.bitebendWebhookUrl}`);
  logger.info(`  Chromium      : ${CHROMIUM_PATH ?? '(auto — puppeteer bundled)'}`);
  logger.info(`  API secret    : ${config.bridgeApiSecret ? 'set' : 'NOT SET (unprotected)'}`);
  logger.info('='.repeat(60));

  // Start the media download retry worker.
  // Uses dependency injection so mediaQueue.ts does not import whatsappClient.ts
  // (which would create a circular dependency via incomingMessages.ts).
  // downloadMediaDirect already looks up the live client internally,
  // so no getReadyClient wrapper is needed here.
  startRetryWorker(downloadMediaDirect);
});

export { app, httpServer, io };
