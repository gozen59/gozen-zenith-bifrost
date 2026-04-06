import { fetchPrices } from './price-provider/coingecko.js';
import { notifyTriggered, notifyRecovery } from './notifiers/telegram.js';
import { writeHealth } from './health-server.js';
import stateStore from './state-store.js';
import logger from './logger.js';
import { isoNow } from './utils.js';

/**
 * Run a single watch cycle over all watchers.
 * @param {object} config
 * @returns {Promise<object>} cycle result for health reporting
 */
export async function runCycle(config) {
  const startTime = Date.now();
  const activeWatchers = config.watchers.filter((w) => w.enabled !== false);

  logger.info('cycle_start', {
    activeWatchers: activeWatchers.length,
    totalWatchers: config.watchers.length,
  });

  // Disabled watchers logging
  const disabledWatchers = config.watchers.filter((w) => w.enabled === false);
  for (const w of disabledWatchers) {
    logger.info('watcher_disabled', { watcherId: w.id });
  }

  // Group coins by quoteCurrency for batch API calls
  const currencyGroups = {};
  for (const w of activeWatchers) {
    const currency = (w.quoteCurrency || config.app.quoteCurrency || 'eur').toLowerCase();
    if (!currencyGroups[currency]) {
      currencyGroups[currency] = new Set();
    }
    currencyGroups[currency].add(w.coinId);
  }

  // Fetch all prices (one API call per currency)
  const allPrices = {};
  let fetchError = null;

  for (const [currency, coinIdSet] of Object.entries(currencyGroups)) {
    try {
      const prices = await fetchPrices([...coinIdSet], [currency]);
      // Merge into allPrices
      for (const [coinId, priceData] of Object.entries(prices)) {
        if (!allPrices[coinId]) allPrices[coinId] = {};
        Object.assign(allPrices[coinId], priceData);
      }
    } catch (err) {
      fetchError = err;
      logger.error('price_fetch_failed', {
        currency,
        coinIds: [...coinIdSet],
        error: err.message,
      });
    }
  }

  // Process each watcher
  const watcherSummaries = {};

  for (const watcher of activeWatchers) {
    const currency = (watcher.quoteCurrency || config.app.quoteCurrency || 'eur').toLowerCase();
    const price = allPrices[watcher.coinId]?.[currency];

    const watcherState = stateStore.getWatcherState(watcher.id);

    if (price === undefined) {
      stateStore.setWatcherState(watcher.id, {
        lastCheckAt: isoNow(),
        lastStatus: 'error',
        lastError: `No price data for ${watcher.coinId}/${currency}`,
      });
      watcherSummaries[watcher.id] = { status: 'error', error: 'No price data' };
      continue;
    }

    // Update watcher state with current price
    stateStore.setWatcherState(watcher.id, {
      lastSeenPrice: price,
      lastCheckAt: isoNow(),
      lastStatus: 'ok',
      lastError: null,
    });

    watcherSummaries[watcher.id] = {
      status: 'ok',
      coinId: watcher.coinId,
      symbol: watcher.symbol || watcher.coinId.toUpperCase(),
      price,
      currency,
    };

    // Check each threshold
    for (const threshold of watcher.thresholds) {
      const ts = stateStore.getThresholdState(watcher.id, threshold.name);
      const defaultCooldown = config.app.defaultCooldownSec || 3600;
      const cooldown = (threshold.cooldownSec || defaultCooldown) * 1000;
      const symbol = watcher.symbol || watcher.coinId.toUpperCase();

      // Evaluate condition
      let conditionMet = false;
      if (threshold.direction === 'above_or_equal') {
        conditionMet = price >= threshold.price;
      } else if (threshold.direction === 'below_or_equal') {
        conditionMet = price <= threshold.price;
      }

      if (conditionMet) {
        // Check if armed and cooldown expired
        const cooldownExpired =
          !ts.lastTriggeredAt || Date.now() - new Date(ts.lastTriggeredAt).getTime() >= cooldown;

        if (ts.armed && cooldownExpired) {
          // === TRIGGER ===
          logger.info('threshold_triggered', {
            watcherId: watcher.id,
            thresholdName: threshold.name,
            coinId: watcher.coinId,
            symbol,
            currency,
            currentPrice: price,
            thresholdPrice: threshold.price,
            direction: threshold.direction,
          });

          // Send notification
          const telegramEnabled = config.notifications?.telegram?.enabled !== false;
          if (telegramEnabled) {
            await notifyTriggered({
              symbol,
              thresholdName: threshold.name,
              price,
              currency,
              threshold: threshold.price,
              direction: threshold.direction,
              messageTemplate: threshold.messageTemplate,
            });
          }

          // Update threshold state: disarm + record trigger
          stateStore.setThresholdState(watcher.id, threshold.name, {
            armed: false,
            lastTriggeredAt: isoNow(),
            lastTriggeredPrice: price,
            recoverySent: false,
          });
        }
      } else {
        // Condition NOT met — check for recovery
        if (!ts.armed) {
          // Price has recovered from triggered state
          if (threshold.notifyOnRecovery && !ts.recoverySent) {
            logger.info('threshold_recovered', {
              watcherId: watcher.id,
              thresholdName: threshold.name,
              coinId: watcher.coinId,
              symbol,
              currency,
              currentPrice: price,
              thresholdPrice: threshold.price,
            });

            const telegramEnabled = config.notifications?.telegram?.enabled !== false;
            if (telegramEnabled) {
              await notifyRecovery({
                symbol,
                thresholdName: threshold.name,
                price,
                currency,
              });
            }

            stateStore.setThresholdState(watcher.id, threshold.name, {
              recoverySent: true,
            });
          }

          // Re-arm the threshold
          stateStore.setThresholdState(watcher.id, threshold.name, {
            armed: true,
          });
        }
      }
    }
  }

  // Save state
  stateStore.save();

  const durationMs = Date.now() - startTime;
  const ok = !fetchError;

  const healthData = {
    ok,
    globalStatus: ok ? 'healthy' : 'degraded',
    activeWatchers: activeWatchers.length,
    lastCycleDurationMs: durationMs,
    lastError: fetchError?.message || null,
    watchers: watcherSummaries,
  };

  writeHealth(healthData);

  logger.info('cycle_complete', {
    durationMs,
    activeWatchers: activeWatchers.length,
    ok,
  });

  return healthData;
}
