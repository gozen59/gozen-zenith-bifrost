import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'events.jsonl');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LEVELS = ['info', 'warn', 'error', 'fatal'];

/**
 * Write a structured log entry to events.jsonl and stdout.
 * @param {'info'|'warn'|'error'|'fatal'} level
 * @param {string} event
 * @param {object} data
 */
function log(level, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };

  const line = JSON.stringify(entry);

  // Append to JSONL file
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (err) {
    console.error(`[logger] Failed to write to ${LOG_FILE}:`, err.message);
  }

  // Also output to stdout/stderr for PM2 log capture
  if (level === 'error' || level === 'fatal') {
    console.error(line);
  } else {
    console.log(line);
  }
}

const info  = (event, data) => log('info', event, data);
const warn  = (event, data) => log('warn', event, data);
const error = (event, data) => log('error', event, data);
const fatal = (event, data) => log('fatal', event, data);

export default { log, info, warn, error, fatal, LEVELS };
