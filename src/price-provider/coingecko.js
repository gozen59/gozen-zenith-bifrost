import logger from '../logger.js';
import { sleep } from '../utils.js';

const BASE_URL = 'https://api.coingecko.com/api/v3';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

/**
 * Fetch prices for multiple coins in a single API call.
 * @param {string[]} coinIds - Array of CoinGecko coin IDs
 * @param {string[]} vsCurrencies - Array of quote currencies (e.g., ['usd', 'eur'])
 * @returns {Promise<Record<string, Record<string, number>>>}
 *   e.g. { bitcoin: { usd: 64000, eur: 59000 }, ethereum: { usd: 3200 } }
 */
export async function fetchPrices(coinIds, vsCurrencies) {
  const ids = coinIds.join(',');
  const currencies = vsCurrencies.join(',');
  const url = `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=${currencies}`;

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'zenith-bifrost/1.0',
        },
        signal: AbortSignal.timeout(15_000),
      });

      // Rate limit handling
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '60', 10);
        logger.warn('price_fetch_rate_limited', {
          attempt,
          retryAfterSec: retryAfter,
        });
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      logger.info('price_fetch_success', {
        coinIds,
        vsCurrencies,
        resultKeys: Object.keys(data),
      });

      return data;
    } catch (err) {
      lastError = err;
      logger.warn('price_fetch_retry', {
        attempt,
        maxRetries: MAX_RETRIES,
        error: err.message,
      });

      if (attempt < MAX_RETRIES) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
  }

  logger.error('price_fetch_failed', {
    coinIds,
    vsCurrencies,
    error: lastError?.message,
  });

  throw new Error(`Failed to fetch prices after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}
