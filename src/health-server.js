import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from './logger.js';
import { sanitizeConfig } from './utils.js';
import stateStore from './state-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(__dirname, '..', 'runtime');
const HEALTH_FILE = path.join(RUNTIME_DIR, 'health.json');

let httpServer = null;
let currentConfig = null;

/**
 * Ensure runtime directory exists.
 */
function ensureDir() {
  if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

/**
 * Write health status to runtime/health.json.
 * @param {object} healthData
 */
export function writeHealth(healthData) {
  ensureDir();
  const data = {
    ts: new Date().toISOString(),
    ...healthData,
  };
  try {
    fs.writeFileSync(HEALTH_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error('health_write_failed', { error: err.message });
  }
}

/**
 * Set the config reference used by HTTP endpoints.
 * @param {object} config
 */
export function setConfig(config) {
  currentConfig = config;
}

/**
 * Start the HTTP health server.
 * @param {number} port
 */
export function startServer(port) {
  httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const route = url.pathname;

    res.setHeader('Content-Type', 'application/json');

    try {
      switch (route) {
        case '/health': {
          if (fs.existsSync(HEALTH_FILE)) {
            const data = fs.readFileSync(HEALTH_FILE, 'utf-8');
            res.writeHead(200);
            res.end(data);
          } else {
            res.writeHead(503);
            res.end(JSON.stringify({ ok: false, message: 'No health data yet' }));
          }
          break;
        }

        case '/state': {
          const state = stateStore.getAll();
          // Create a non-sensitive summary
          const summary = {};
          for (const [watcherId, ws] of Object.entries(state)) {
            summary[watcherId] = {
              lastSeenPrice: ws.lastSeenPrice,
              lastCheckAt: ws.lastCheckAt,
              lastStatus: ws.lastStatus,
              thresholds: {},
            };
            if (ws.thresholds) {
              for (const [tName, ts] of Object.entries(ws.thresholds)) {
                summary[watcherId].thresholds[tName] = {
                  armed: ts.armed,
                  lastTriggeredAt: ts.lastTriggeredAt,
                  recoverySent: ts.recoverySent,
                };
              }
            }
          }
          res.writeHead(200);
          res.end(JSON.stringify(summary, null, 2));
          break;
        }

        case '/config': {
          if (currentConfig) {
            res.writeHead(200);
            res.end(JSON.stringify(sanitizeConfig(currentConfig), null, 2));
          } else {
            res.writeHead(503);
            res.end(JSON.stringify({ message: 'Config not loaded yet' }));
          }
          break;
        }

        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found', routes: ['/health', '/state', '/config'] }));
      }
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  httpServer.listen(port, () => {
    logger.info('health_server_started', { port });
    console.log(`🩺 Health server listening on http://localhost:${port}`);
  });

  return httpServer;
}

/**
 * Stop the HTTP health server.
 */
export function stopServer() {
  return new Promise((resolve) => {
    if (httpServer) {
      httpServer.close(() => {
        logger.info('health_server_stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}
