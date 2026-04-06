import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import logger from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '..', 'runtime');
const STATE_FILE = path.join(RUNTIME_DIR, 'state.json');

// In-memory state
let state = {};

/**
 * Ensure runtime directory exists.
 */
function ensureDir() {
  if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

/**
 * Load state from disk. Missing file = empty state.
 */
function load() {
  ensureDir();
  if (!fs.existsSync(STATE_FILE)) {
    state = {};
    return state;
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    state = JSON.parse(raw);
  } catch (err) {
    logger.warn('state_load_failed', { error: err.message });
    state = {};
  }
  return state;
}

/**
 * Atomic save: write to tmp file, then rename.
 */
function save() {
  ensureDir();
  const tmpFile = path.join(RUNTIME_DIR, `state.tmp.${process.pid}`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (err) {
    logger.error('state_save_failed', { error: err.message });
    // Clean up tmp file if rename failed
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * Get state for a specific watcher.
 * @param {string} watcherId
 * @returns {object}
 */
function getWatcherState(watcherId) {
  if (!state[watcherId]) {
    state[watcherId] = { thresholds: {} };
  }
  return state[watcherId];
}

/**
 * Set state for a specific watcher.
 * @param {string} watcherId
 * @param {object} data
 */
function setWatcherState(watcherId, data) {
  state[watcherId] = { ...getWatcherState(watcherId), ...data };
}

/**
 * Get threshold state within a watcher.
 * @param {string} watcherId
 * @param {string} thresholdName
 * @returns {object}
 */
function getThresholdState(watcherId, thresholdName) {
  const ws = getWatcherState(watcherId);
  if (!ws.thresholds[thresholdName]) {
    ws.thresholds[thresholdName] = {
      armed: true,
      lastTriggeredAt: null,
      lastTriggeredPrice: null,
      recoverySent: false,
    };
  }
  return ws.thresholds[thresholdName];
}

/**
 * Set threshold state within a watcher.
 * @param {string} watcherId
 * @param {string} thresholdName
 * @param {object} data
 */
function setThresholdState(watcherId, thresholdName, data) {
  const ws = getWatcherState(watcherId);
  ws.thresholds[thresholdName] = {
    ...getThresholdState(watcherId, thresholdName),
    ...data,
  };
}

/**
 * Get full state (for health / debug).
 */
function getAll() {
  return state;
}

export default {
  load,
  save,
  getWatcherState,
  setWatcherState,
  getThresholdState,
  setThresholdState,
  getAll,
};
