# Guide de Déploiement : Zenith Bifrost

Ce document détaille les procédures recommandées pour déployer et maintenir le bot **Zenith Bifrost** sur un serveur de production (VPS, dédié, etc.).

## Gestion de Processus avec PM2

PM2 est le gestionnaire de processus recommandé pour exécuter l'application en arrière-plan, la maintenir en vie en cas de crash, et gérer ses journaux d'exécution.

### 1. Démarrage Initial

Assurez-vous d'avoir exécuté `npm install` (ou préférentiellemnt `npm ci`), et que votre fichier `.env` ainsi que le dossier `config/` sont prêts.

```bash
# Démarrer le daemon via le fichier de configuration PM2
pm2 start ecosystem.config.cjs

# Sauvegarder la liste des processus pour qu'ils redémarrent automatiquement au boot
pm2 save
```

Si le serveur vient d'être installé, vous devrez peut-être générer le script de démarrage automatique au boot :
```bash
pm2 startup
# (Suivez les instructions affichées par la commande)
```

### 2. Surveillance et Logs

PM2 gère nativement la redirection de la console vers des fichiers de logs dédiés intégrés.

```bash
# Vérifier l'état de l'application (Statut, RAM, CPU)
pm2 status

# Suivre les logs en direct (stdout & stderr)
pm2 logs zenith-bifrost
```

### 3. Mise à Jour et Redémarrage

Lors d'une modification du code source (ex: après un `git pull`) ou des variables d'environnement dans le `.env` :

```bash
# Met à jour les variables d'environnement et redémarre le processus proprement
pm2 restart zenith-bifrost --update-env
```

*Note: Si vous mettez à jour votre fichier de variables métier `config/watcher.config.json`, vous n'avez pas besoin de redémarrer PM2 ! Envoyez simplement le signal SIGHUP pour un rechargement à chaud :*
```bash
pm2 sendSignal SIGHUP zenith-bifrost
```

### 4. Rotation des Logs (pm2-logrotate)

L'application produit des événements de surveillance réguliers, ce qui fera grossir les fichiers log avec le temps. Un script automatisé est fourni pour installer et configurer `pm2-logrotate` (rotation quotidienne, compression, et conservation sur 14 jours).

```bash
# 1. Donner les droits d'exécution au script
chmod +x scripts/setup-pm2-logrotate.sh

# 2. Exécuter le setup
./scripts/setup-pm2-logrotate.sh
```

---

## Journaux applicatifs annexes

En plus des logs systèmes de PM2, Zenith Bifrost maintient :
- Un fichier structuré **JSONL** (`logs/events.jsonl`) tracé par l'application pour de l'analyse, utile pour la supervision ou l'ingestion externe (Elastic...).
- Le **Health Server HTTP** (actif par défaut sur le port `:8787`) pour contrôler l'état courant des paires en direct sans avoir à se connecter sur le serveur.
