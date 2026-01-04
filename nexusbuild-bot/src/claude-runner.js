/**
 * Runner Claude Code CLI
 * Lance Claude Code CLI et parse les réponses
 */

const { spawn, execSync } = require('child_process');
const config = require('../config');
const { logInfo, logError, logDebug, extractLastThirdOfLogs, parseClaudeDiagnostic, sshToHttpsWithToken } = require('./utils');

/**
 * Configure le remote Git pour utiliser HTTPS avec token (permet le push)
 * @param {string} repoPath - Chemin vers le repo
 * @param {string} sshUrl - URL SSH originale du repo
 * @returns {boolean} True si configuré avec succès
 */
function configureGitRemoteWithToken(repoPath, sshUrl) {
  const token = config.GITHUB_TOKEN;

  if (!token) {
    logDebug('No GitHub token configured, keeping SSH remote (requires SSH key)');
    return false;
  }

  const httpsUrl = sshToHttpsWithToken(sshUrl, token);
  if (!httpsUrl) {
    logError(`Could not convert SSH URL to HTTPS: ${sshUrl}`);
    return false;
  }

  try {
    // Changer le remote origin pour utiliser HTTPS avec token
    execSync(`git remote set-url origin "${httpsUrl}"`, {
      cwd: repoPath,
      stdio: 'pipe',
    });
    logInfo(`Configured git remote with HTTPS token for push`);
    return true;
  } catch (error) {
    logError('Failed to configure git remote', error);
    return false;
  }
}

/**
 * Exécute une commande Claude Code CLI
 * @param {string} cwd - Répertoire de travail
 * @param {string} prompt - Prompt à envoyer à Claude
 * @param {boolean} [printMode=false] - Si true, utilise --print pour une réponse simple
 * @returns {Promise<string>} Réponse de Claude
 */
function runClaude(cwd, prompt, printMode = false) {
  return new Promise((resolve, reject) => {
    const args = ['--dangerously-skip-permissions'];

    if (printMode) {
      args.push('--print');
    }

    args.push(prompt);

    logInfo(`Running Claude Code CLI in ${cwd} (print mode: ${printMode})`);
    logDebug(`Prompt length: ${prompt.length} chars`);

    const claude = spawn('claude', args, {
      cwd,
      shell: true,
      timeout: config.CLAUDE_TIMEOUT_MS,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      logDebug(`Claude stdout: ${chunk.substring(0, 200)}...`);
    });

    claude.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      logDebug(`Claude stderr: ${chunk.substring(0, 200)}...`);
    });

    claude.on('error', (error) => {
      logError('Claude Code CLI spawn error', error);
      reject(error);
    });

    claude.on('close', (code) => {
      if (code === 0) {
        logInfo(`Claude Code CLI completed successfully`);
        resolve(stdout);
      } else {
        logError(`Claude Code CLI exited with code ${code}`);
        logError(`Stderr: ${stderr}`);
        // On retourne quand même stdout car Claude peut avoir fait des corrections
        resolve(stdout || stderr);
      }
    });

    // Timeout manuel
    setTimeout(() => {
      claude.kill('SIGTERM');
      reject(new Error(`Claude Code CLI timeout after ${config.CLAUDE_TIMEOUT_MS}ms`));
    }, config.CLAUDE_TIMEOUT_MS);
  });
}

/**
 * Diagnostique la source d'un échec de build (BUILDER ou APP)
 * @param {string} logs - Logs complets du build échoué
 * @returns {Promise<{ source: 'BUILDER' | 'APP' | null, explanation: string }>}
 */
async function diagnoseBuildFailure(logs) {
  const lastThirdLogs = extractLastThirdOfLogs(logs);

  const prompt = `Voici les logs d'un build échoué. Analyse et dis-moi si le problème vient de NexusBuild (le builder) ou de l'application mobile.

Réponds EXACTEMENT dans ce format:
SOURCE:BUILDER ou SOURCE:APP
EXPLICATION: [une ligne]

Logs:
${lastThirdLogs}`;

  try {
    logInfo('Diagnosing build failure with Claude Code CLI...');
    const response = await runClaude(config.NEXUSBUILD_REPO_PATH, prompt, true);
    const diagnostic = parseClaudeDiagnostic(response);

    logInfo(`Diagnostic result: SOURCE:${diagnostic.source}`);
    logInfo(`Explanation: ${diagnostic.explanation}`);

    return diagnostic;
  } catch (error) {
    logError('Failed to diagnose build failure', error);
    return { source: null, explanation: error.message };
  }
}

/**
 * Corrige un problème dans NexusBuild (le builder)
 * @param {string} logs - Logs du build échoué
 * @returns {Promise<boolean>} True si la correction a réussi
 */
async function fixBuilderIssue(logs) {
  const lastThirdLogs = extractLastThirdOfLogs(logs);

  const prompt = `Le build a échoué à cause d'un problème dans NexusBuild. Voici les logs. Analyse et corrige le problème.

Logs:
${lastThirdLogs}`;

  try {
    logInfo('Fixing NexusBuild issue with Claude Code CLI...');
    const response = await runClaude(config.NEXUSBUILD_REPO_PATH, prompt, false);

    logInfo('Claude Code CLI finished fixing NexusBuild');
    logDebug(`Response: ${response.substring(0, 500)}...`);

    return true;
  } catch (error) {
    logError('Failed to fix NexusBuild issue', error);
    return false;
  }
}

/**
 * Corrige un problème dans l'application mobile
 * @param {string} repoPath - Chemin vers le repo de l'app clonée
 * @param {string} logs - Logs du build échoué
 * @param {string} [repositoryUrl] - URL SSH du repo (pour configurer le push avec token)
 * @returns {Promise<boolean>} True si la correction a réussi
 */
async function fixAppIssue(repoPath, logs, repositoryUrl = null) {
  const lastThirdLogs = extractLastThirdOfLogs(logs);

  // Configurer le remote avec le token si disponible
  if (repositoryUrl) {
    configureGitRemoteWithToken(repoPath, repositoryUrl);
  }

  const prompt = `Voici les logs d'erreur de build d'une app mobile. Analyse et corrige le problème puis commit et push sur la branche d'origine. Ne crée PAS de Pull Request, push directement.

Logs:
${lastThirdLogs}`;

  try {
    logInfo(`Fixing app issue in ${repoPath} with Claude Code CLI...`);
    const response = await runClaude(repoPath, prompt, false);

    logInfo('Claude Code CLI finished fixing app');
    logDebug(`Response: ${response.substring(0, 500)}...`);

    return true;
  } catch (error) {
    logError('Failed to fix app issue', error);
    return false;
  }
}

module.exports = {
  runClaude,
  configureGitRemoteWithToken,
  diagnoseBuildFailure,
  fixBuilderIssue,
  fixAppIssue,
};
