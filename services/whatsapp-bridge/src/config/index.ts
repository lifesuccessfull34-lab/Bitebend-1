import 'dotenv/config';

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const config = {
  port: parseInt(optional('BRIDGE_PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),

  bridgeApiSecret: optional('BRIDGE_API_SECRET', ''),

  databaseUrl: process.env.DATABASE_URL,

  sessionStore: optional('SESSION_STORE', 'file') as 'file' | 'postgres',
  sessionDir: optional('SESSION_DIR', './sessions'),

  bitebendWebhookUrl: optional(
    'BITEBEND_WEBHOOK_URL',
    'http://localhost:5000/api/whatsapp/incoming'
  ),
  bitebendPaymentScreenshotUrl: optional(
    'BITEBEND_PAYMENT_SCREENSHOT_URL',
    'http://localhost:5000/api/whatsapp/payment-screenshot'
  ),
  bitebendWebhookSecret: optional('BITEBEND_WEBHOOK_SECRET', ''),

  imageStorage: optional('IMAGE_STORAGE', 'local') as 'local',
  uploadsDir: optional('UPLOADS_DIR', './uploads'),
  publicBaseUrl: optional('PUBLIC_BASE_URL', 'http://localhost:3001'),

  webhookRetryAttempts: parseInt(optional('WEBHOOK_RETRY_ATTEMPTS', '3'), 10),
  webhookRetryDelayMs: parseInt(optional('WEBHOOK_RETRY_DELAY_MS', '2000'), 10),
  messageRetryAttempts: parseInt(optional('MESSAGE_RETRY_ATTEMPTS', '2'), 10),
};

export default config;
