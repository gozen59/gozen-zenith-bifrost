#!/usr/bin/env bash
set -e

echo "🔧 Configuration de pm2-logrotate"
echo "=================================="

# Check PM2
if ! command -v pm2 &> /dev/null; then
  echo "❌ PM2 n'est pas installé. Installez-le avec : npm install -g pm2"
  exit 1
fi

# Install pm2-logrotate
echo "📦 Installation de pm2-logrotate..."
pm2 install pm2-logrotate

# Configure
echo "⚙️  Configuration..."
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

echo ""
echo "✅ pm2-logrotate configuré !"
echo ""
echo "📊 Paramètres appliqués :"
pm2 conf pm2-logrotate
echo ""
