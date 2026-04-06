import 'dotenv/config';
import path from 'node:path';
import { loadAndValidate, loadConfig, validateConfig } from './config-loader.js';
import { runCycle } from './watcher.js';
import { testConnection, getChatId } from './notifiers/telegram.js';
import { startServer, stopServer, setConfig } from './health-server.js';
import stateStore from './state-store.js';
import logger from './logger.js';
import { sleep } from './utils.js';

// ─── Parse CLI arguments ─────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1;
}

function getArgValue(name) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

const FLAG_TEST_TELEGRAM = getArg('--test-telegram');
const FLAG_GET_CHAT_ID = getArg('--get-chat-id');
const FLAG_ONCE = getArg('--once');
const CONFIG_PATH = getArgValue('--config') || process.env.CONFIG_PATH || './config/watcher.config.json';

// ─── CLI Modes ───────────────────────────────────────────────────────

async function main() {
  // Test Telegram mode
  if (FLAG_TEST_TELEGRAM) {
    try {
      await testConnection();
    } catch (err) {
      console.error('❌ Échec du test Telegram:', err.message);
      process.exit(1);
    }
    process.exit(0);
  }

  // Get Chat ID mode
  if (FLAG_GET_CHAT_ID) {
    try {
      await getChatId();
    } catch (err) {
      console.error('❌ Échec de getUpdates:', err.message);
      process.exit(1);
    }
    process.exit(0);
  }

  // ─── Normal / Once Mode ──────────────────────────────────────────

  // Load and validate config
  let config;
  try {
    config = loadAndValidate(CONFIG_PATH);
  } catch (err) {
    console.error('❌ Erreur de configuration:', err.message);
    process.exit(1);
  }

  // Load persistent state
  stateStore.load();

  // Start health server if enabled
  const healthPort = config.app.healthPort || parseInt(process.env.HEALTH_PORT, 10) || 8787;
  if (config.app.enableHttpHealth) {
    setConfig(config);
    startServer(healthPort);
  }

  logger.info('service_start', {
    configPath: CONFIG_PATH,
    mode: FLAG_ONCE ? 'once' : 'continuous',
    watcherCount: config.watchers.length,
    intervalSec: config.app.intervalSec,
  });

  console.log(`\n🚀 Zenith Bifrost démarré`);
  console.log(`   Mode: ${FLAG_ONCE ? 'exécution unique' : 'continu'}`);
  console.log(`   Config: ${CONFIG_PATH}`);
  console.log(`   Watchers actifs: ${config.watchers.filter((w) => w.enabled !== false).length}/${config.watchers.length}`);
  console.log(`   Intervalle: ${config.app.intervalSec}s\n`);

  // ─── SIGHUP: Config Reload ──────────────────────────────────────

  process.on('SIGHUP', () => {
    console.log('\n♻️  SIGHUP reçu — rechargement de la config...');
    try {
      const newConfig = loadConfig(CONFIG_PATH);
      const errors = validateConfig(newConfig);
      if (errors.length > 0) {
        logger.error('config_reload_failed', { errors });
        console.error('❌ Nouvelle config invalide, conserve l\'ancienne.');
        return;
      }
      config = newConfig;
      setConfig(config);
      logger.info('config_reload', {
        path: CONFIG_PATH,
        watcherCount: config.watchers.length,
      });
      console.log('✅ Config rechargée avec succès.');
    } catch (err) {
      logger.error('config_reload_failed', { error: err.message });
      console.error('❌ Échec du rechargement:', err.message);
    }
  });

  // ─── Graceful Shutdown ──────────────────────────────────────────

  let running = true;

  async function shutdown(signal) {
    console.log(`\n🛑 ${signal} reçu — arrêt propre...`);
    running = false;
    stateStore.save();
    await stopServer();
    logger.info('service_stop', { signal });
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // ─── Main Loop ──────────────────────────────────────────────────

  if (FLAG_ONCE) {
    // Single cycle mode
    try {
      await runCycle(config);
    } catch (err) {
      logger.fatal('fatal', { error: err.message, stack: err.stack });
      console.error('❌ Erreur fatale:', err.message);
      process.exit(1);
    }
    stateStore.save();
    await stopServer();
    process.exit(0);
  }

  // Continuous mode
  while (running) {
    try {
      await runCycle(config);
    } catch (err) {
      logger.error('cycle_error', { error: err.message, stack: err.stack });
      console.error('⚠️  Erreur de cycle:', err.message);
    }

    // Wait for next cycle (interruptible)
    const intervalMs = (config.app.intervalSec || 60) * 1000;
    await sleep(intervalMs);
  }
}

main().catch((err) => {
  logger.fatal('fatal', { error: err.message, stack: err.stack });
  console.error('💀 Erreur fatale non capturée:', err.message);
  process.exit(1);
});
