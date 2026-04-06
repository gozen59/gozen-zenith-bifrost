import fs from 'node:fs';
import path from 'node:path';
import logger from './logger.js';

/**
 * Load and parse a JSON config file.
 * @param {string} configPath
 * @returns {object}
 */
export function loadConfig(configPath) {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in config file ${resolved}: ${err.message}`);
  }
}

/**
 * Validate config structure. Returns an array of error messages (empty = valid).
 * @param {object} config
 * @returns {string[]}
 */
export function validateConfig(config) {
  const errors = [];

  // --- app section ---
  if (!config.app) {
    errors.push('Missing "app" section');
  } else {
    if (typeof config.app.intervalSec !== 'number' || config.app.intervalSec <= 0) {
      errors.push('"app.intervalSec" must be a positive number');
    }
  }

  // --- watchers section ---
  if (!Array.isArray(config.watchers) || config.watchers.length === 0) {
    errors.push('"watchers" must be a non-empty array');
    return errors; // Can't validate further
  }

  const watcherIds = new Set();

  for (let i = 0; i < config.watchers.length; i++) {
    const w = config.watchers[i];
    const prefix = `watchers[${i}]`;

    // ID uniqueness
    if (!w.id || typeof w.id !== 'string') {
      errors.push(`${prefix}: "id" is required and must be a string`);
    } else if (watcherIds.has(w.id)) {
      errors.push(`${prefix}: duplicate watcher id "${w.id}"`);
    } else {
      watcherIds.add(w.id);
    }

    // coinId
    if (!w.coinId || typeof w.coinId !== 'string') {
      errors.push(`${prefix}: "coinId" is required and must be a non-empty string`);
    }

    // quoteCurrency
    const currency = w.quoteCurrency || config.app?.quoteCurrency;
    if (!currency || typeof currency !== 'string') {
      errors.push(`${prefix}: "quoteCurrency" must be defined (on watcher or in app defaults)`);
    }

    // thresholds
    if (!Array.isArray(w.thresholds) || w.thresholds.length === 0) {
      errors.push(`${prefix}: "thresholds" must be a non-empty array`);
      continue;
    }

    const thresholdNames = new Set();
    const validDirections = ['above_or_equal', 'below_or_equal'];

    for (let j = 0; j < w.thresholds.length; j++) {
      const t = w.thresholds[j];
      const tPrefix = `${prefix}.thresholds[${j}]`;

      // name uniqueness
      if (!t.name || typeof t.name !== 'string') {
        errors.push(`${tPrefix}: "name" is required and must be a string`);
      } else if (thresholdNames.has(t.name)) {
        errors.push(`${tPrefix}: duplicate threshold name "${t.name}" within watcher "${w.id}"`);
      } else {
        thresholdNames.add(t.name);
      }

      // direction
      if (!validDirections.includes(t.direction)) {
        errors.push(`${tPrefix}: "direction" must be one of: ${validDirections.join(', ')} (got "${t.direction}")`);
      }

      // price
      if (typeof t.price !== 'number' || t.price <= 0) {
        errors.push(`${tPrefix}: "price" must be a positive number (got ${t.price})`);
      }
    }
  }

  return errors;
}

/**
 * Load, parse and validate a config file. Throws on failure.
 * @param {string} configPath
 * @returns {object}
 */
export function loadAndValidate(configPath) {
  const config = loadConfig(configPath);
  const errors = validateConfig(config);

  if (errors.length > 0) {
    logger.error('invalid_config', { errors });
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
  }

  logger.info('config_loaded', {
    path: configPath,
    watcherCount: config.watchers.length,
    activeWatchers: config.watchers.filter((w) => w.enabled !== false).length,
  });

  return config;
}
