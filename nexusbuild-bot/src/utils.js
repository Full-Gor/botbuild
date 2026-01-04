/**
 * Utilitaires pour le bot NexusBuild
 * Logging et extraction de logs
 */

/**
 * Préfixe un message avec un timestamp ISO
 * @param {string} level - Niveau de log (INFO, ERROR, WARN, DEBUG)
 * @param {string} message - Message à logger
 * @returns {string} Message formaté
 */
function formatLog(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * Log un message d'information
 * @param {string} message - Message à logger
 */
function logInfo(message) {
  console.log(formatLog('INFO', message));
}

/**
 * Log un message d'erreur
 * @param {string} message - Message à logger
 * @param {Error} [error] - Erreur optionnelle
 */
function logError(message, error = null) {
  console.error(formatLog('ERROR', message));
  if (error) {
    console.error(formatLog('ERROR', `  Details: ${error.message}`));
    if (error.stack) {
      console.error(formatLog('ERROR', `  Stack: ${error.stack}`));
    }
  }
}

/**
 * Log un message d'avertissement
 * @param {string} message - Message à logger
 */
function logWarn(message) {
  console.warn(formatLog('WARN', message));
}

/**
 * Log un message de debug
 * @param {string} message - Message à logger
 */
function logDebug(message) {
  if (process.env.DEBUG === 'true') {
    console.log(formatLog('DEBUG', message));
  }
}

/**
 * Extrait le dernier tiers des logs
 * Utilisé pour éviter les prompts trop longs avec Claude Code CLI
 * @param {string} logs - Logs complets
 * @returns {string} Dernier tiers des logs
 */
function extractLastThirdOfLogs(logs) {
  if (!logs || typeof logs !== 'string') {
    return '';
  }

  const lines = logs.split('\n');
  const totalLines = lines.length;

  if (totalLines <= 3) {
    return logs;
  }

  // Calculer l'index du début du dernier tiers
  const startIndex = Math.floor(totalLines * 2 / 3);
  const lastThird = lines.slice(startIndex).join('\n');

  logDebug(`Extracted last third of logs: ${totalLines} lines -> ${lines.length - startIndex} lines`);

  return lastThird;
}

/**
 * Parse la réponse de Claude pour extraire la source du problème
 * @param {string} response - Réponse de Claude Code CLI
 * @returns {{ source: 'BUILDER' | 'APP' | null, explanation: string }}
 */
function parseClaudeDiagnostic(response) {
  if (!response || typeof response !== 'string') {
    return { source: null, explanation: 'No response from Claude' };
  }

  // Chercher SOURCE:BUILDER ou SOURCE:APP
  const sourceMatch = response.match(/SOURCE:(BUILDER|APP)/i);
  const source = sourceMatch ? sourceMatch[1].toUpperCase() : null;

  // Chercher EXPLICATION: ...
  const explanationMatch = response.match(/EXPLICATION:\s*(.+)/i);
  const explanation = explanationMatch ? explanationMatch[1].trim() : 'No explanation provided';

  return { source, explanation };
}

/**
 * Extrait owner et repo d'une URL Git SSH
 * @param {string} sshUrl - URL SSH du repo (git@github.com:user/repo.git)
 * @returns {{ owner: string, repo: string } | null}
 */
function parseGitSshUrl(sshUrl) {
  if (!sshUrl || typeof sshUrl !== 'string') {
    return null;
  }

  // Format: git@github.com:owner/repo.git
  const match = sshUrl.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);

  if (!match) {
    // Essayer format HTTPS aussi
    const httpsMatch = sshUrl.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }
    return null;
  }

  return { owner: match[1], repo: match[2] };
}

/**
 * Pause asynchrone
 * @param {number} ms - Durée en millisecondes
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convertit une URL SSH GitHub en URL HTTPS avec token
 * @param {string} sshUrl - URL SSH (git@github.com:user/repo.git)
 * @param {string} token - Token GitHub
 * @returns {string|null} URL HTTPS avec token ou null si échec
 */
function sshToHttpsWithToken(sshUrl, token) {
  const repoInfo = parseGitSshUrl(sshUrl);
  if (!repoInfo || !token) {
    return null;
  }
  return `https://${token}@github.com/${repoInfo.owner}/${repoInfo.repo}.git`;
}

module.exports = {
  logInfo,
  logError,
  logWarn,
  logDebug,
  extractLastThirdOfLogs,
  parseClaudeDiagnostic,
  parseGitSshUrl,
  sshToHttpsWithToken,
  sleep,
};
