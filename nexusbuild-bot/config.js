/**
 * Configuration du bot NexusBuild
 * Variables d'environnement et chemins
 */

module.exports = {
  // Token GitHub pour l'API (merge PR, vérification push)
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',

  // Token pour l'API NexusBuild (authentification bot)
  BOT_API_TOKEN: process.env.BOT_API_TOKEN || 'nexusbuild-bot-secret',

  // URL de base de l'API NexusBuild
  NEXUSBUILD_API: process.env.NEXUSBUILD_API || 'http://localhost:3001/api',

  // Chemin vers le repo NexusBuild (le builder)
  NEXUSBUILD_REPO_PATH: process.env.NEXUSBUILD_REPO_PATH || '/home/arnaud/sdk/nexusbuild-web',

  // Dossier des repos clonés temporaires
  STORAGE_REPOS: process.env.STORAGE_REPOS || '/home/arnaud/sdk/nexusbuild-web/storage/repos',

  // Dossier des logs de build
  STORAGE_LOGS: process.env.STORAGE_LOGS || '/home/arnaud/sdk/nexusbuild-web/storage/logs',

  // Nombre maximum d'itérations de fix par build échoué
  MAX_ITERATIONS: parseInt(process.env.MAX_ITERATIONS, 10) || 5,

  // Timeout pour Claude Code CLI (5 minutes par défaut)
  CLAUDE_TIMEOUT_MS: parseInt(process.env.CLAUDE_TIMEOUT_MS, 10) || 300000,

  // Intervalle de polling de l'API NexusBuild (10 secondes)
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS, 10) || 10000,
};
