#!/usr/bin/env node

/**
 * NexusBuild Bot - Point d'entrée principal
 * Bot d'automatisation de build mobile self-hosted
 *
 * Surveille les builds échoués sur NexusBuild et utilise
 * Claude Code CLI pour diagnostiquer et corriger automatiquement.
 */

const config = require('./config');
const { startMonitoring, stopMonitoring } = require('./src/monitor');
const { logInfo, logError } = require('./src/utils');

// Afficher la configuration au démarrage
logInfo('=================================================');
logInfo('       NexusBuild Bot - Mobile Build Automation  ');
logInfo('=================================================');
logInfo(`NexusBuild API: ${config.NEXUSBUILD_API}`);
logInfo(`NexusBuild Repo: ${config.NEXUSBUILD_REPO_PATH}`);
logInfo(`Storage Repos: ${config.STORAGE_REPOS}`);
logInfo(`Poll Interval: ${config.POLL_INTERVAL_MS}ms`);
logInfo(`Max Iterations: ${config.MAX_ITERATIONS}`);
logInfo(`Claude Timeout: ${config.CLAUDE_TIMEOUT_MS}ms`);
logInfo(`GitHub Token: ${config.GITHUB_TOKEN ? 'configured' : 'NOT configured'}`);
logInfo('=================================================');

// Gestion des signaux pour arrêt propre
process.on('SIGINT', () => {
  logInfo('Received SIGINT signal');
  stopMonitoring();
});

process.on('SIGTERM', () => {
  logInfo('Received SIGTERM signal');
  stopMonitoring();
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  logError('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled rejection at: ${promise}, reason: ${reason}`);
});

// Démarrer le monitoring
startMonitoring().catch((error) => {
  logError('Fatal error in monitoring', error);
  process.exit(1);
});
