import logger from '../logger.js';
import { renderTemplate, isoNow } from '../utils.js';

const API_BASE = 'https://api.telegram.org/bot';

/**
 * Get Telegram credentials from environment.
 */
function getCredentials() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID is not set');

  return { token, chatId };
}

/**
 * Send a message via Telegram Bot API.
 * @param {string} text
 * @param {string} parseMode - 'Markdown' or 'HTML'
 */
export async function sendMessage(text, parseMode = 'Markdown') {
  const { token, chatId } = getCredentials();
  const url = `${API_BASE}${token}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram response not ok: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Test Telegram connection by sending a test message.
 */
export async function testConnection() {
  const msg = `✅ *Zenith Bifrost* — connexion Telegram OK !\n\n🕐 ${isoNow()}`;
  await sendMessage(msg);
  console.log('✅ Message de test envoyé avec succès.');
}

/**
 * Get chat IDs from recent messages via getUpdates.
 */
export async function getChatId() {
  const { token } = getCredentials();
  const url = `${API_BASE}${token}/getUpdates`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();

  if (!data.ok) {
    console.error('❌ Erreur de l\'API Telegram:', data.description);
    return;
  }

  if (!data.result?.length) {
    console.log('Aucun message trouvé. Envoyez un message au bot puis relancez cette commande.');
    return;
  }

  const chatIds = new Map();
  for (const update of data.result) {
    const chat = update.message?.chat;
    if (chat) {
      chatIds.set(chat.id, {
        id: chat.id,
        type: chat.type,
        title: chat.title || `${chat.first_name || ''} ${chat.last_name || ''}`.trim(),
      });
    }
  }

  console.log('\n📬 Chat IDs trouvés :\n');
  for (const [id, info] of chatIds) {
    console.log(`  ID: ${id}  |  Type: ${info.type}  |  Nom: ${info.title}`);
  }
  console.log('\nCopiez l\'ID souhaité dans votre fichier .env (TELEGRAM_CHAT_ID).\n');
}

// ─── Message Templates ───────────────────────────────────────────────

const TEMPLATES = {
  triggered_above: `🔔 *{{symbol}}* a atteint le seuil *{{thresholdName}}*
Prix actuel : \`{{price}} {{currency}}\`
Condition : >= {{threshold}} {{currency}}
Heure : {{timestamp}}`,

  triggered_below: `🔔 *{{symbol}}* a atteint le seuil *{{thresholdName}}*
Prix actuel : \`{{price}} {{currency}}\`
Condition : <= {{threshold}} {{currency}}
Heure : {{timestamp}}`,

  recovery: `ℹ️ *{{symbol}}* est revenu hors de la zone du seuil *{{thresholdName}}*.
Prix actuel : \`{{price}} {{currency}}\`.`,
};

/**
 * Send a threshold triggered notification.
 * @param {object} params
 */
export async function notifyTriggered(params) {
  const { symbol, thresholdName, price, currency, threshold, direction } = params;
  const templateKey = direction === 'above_or_equal' ? 'triggered_above' : 'triggered_below';
  const template = params.messageTemplate || TEMPLATES[templateKey];

  const text = renderTemplate(template, {
    symbol,
    thresholdName,
    price,
    currency: currency.toUpperCase(),
    threshold,
    timestamp: isoNow(),
  });

  try {
    await sendMessage(text);
    logger.info('notification_sent', {
      type: 'triggered',
      symbol,
      thresholdName,
      price,
      threshold,
    });
  } catch (err) {
    logger.error('notification_failed', {
      type: 'triggered',
      symbol,
      thresholdName,
      error: err.message,
    });
  }
}

/**
 * Send a recovery notification.
 * @param {object} params
 */
export async function notifyRecovery(params) {
  const { symbol, thresholdName, price, currency } = params;

  const text = renderTemplate(TEMPLATES.recovery, {
    symbol,
    thresholdName,
    price,
    currency: currency.toUpperCase(),
  });

  try {
    await sendMessage(text);
    logger.info('notification_sent', {
      type: 'recovery',
      symbol,
      thresholdName,
      price,
    });
  } catch (err) {
    logger.error('notification_failed', {
      type: 'recovery',
      symbol,
      thresholdName,
      error: err.message,
    });
  }
}
