#!/usr/bin/env bash
set -e

echo "🔧 Installation de Zenith Bifrost"
echo "========================================="

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js n'est pas installé. Installez Node.js >= 18."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js >= 18 requis. Version actuelle: $(node -v)"
  exit 1
fi

echo "✅ Node.js $(node -v) détecté"

# Create directories
echo "📁 Création des dossiers..."
mkdir -p config logs runtime

# Install dependencies
echo "📦 Installation des dépendances..."
npm install

# Copy config files
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📄 .env créé à partir de .env.example"
else
  echo "⏭️  .env existe déjà"
fi

if [ ! -f config/watcher.config.json ]; then
  cp config/watcher.config.example.json config/watcher.config.json
  echo "📄 config/watcher.config.json créé à partir de l'exemple"
else
  echo "⏭️  config/watcher.config.json existe déjà"
fi

echo ""
echo "✅ Installation terminée !"
echo ""
echo "📝 Prochaines étapes :"
echo "   1. Éditez .env et renseignez TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID"
echo "   2. Éditez config/watcher.config.json selon vos besoins"
echo "   3. Testez Telegram : npm run test-telegram"
echo "   4. Lancez un seul cycle : npm run once"
echo "   5. Lancez en continu : npm start"
echo "   6. Ou avec PM2 : pm2 start ecosystem.config.js"
echo ""
