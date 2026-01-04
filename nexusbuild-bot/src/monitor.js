/**
 * Monitor de builds NexusBuild
 * Détection des builds échoués et orchestration des corrections
 */

const path = require('path');
const config = require('../config');
const nexusBuildApi = require('./nexusbuild-api');
const githubApi = require('./github-api');
const claudeRunner = require('./claude-runner');
const { logInfo, logError, logWarn, logDebug, sleep } = require('./utils');

// Set pour tracker les builds déjà traités
const processedBuilds = new Set();

// Map pour tracker les itérations par build
const buildIterations = new Map();

/**
 * Récupère les builds échoués non encore traités
 * @returns {Promise<Array>} Liste des builds échoués à traiter
 */
async function getFailedBuilds() {
  try {
    const builds = await nexusBuildApi.listBuilds();
    const failedBuilds = builds.filter(build => {
      const buildId = build.id || build._id;
      return build.status === 'failed' && !processedBuilds.has(buildId);
    });

    if (failedBuilds.length > 0) {
      logInfo(`Found ${failedBuilds.length} failed build(s) to process`);
    }

    return failedBuilds;
  } catch (error) {
    logError('Failed to get builds', error);
    return [];
  }
}

/**
 * Marque un build comme traité (ne sera plus repris)
 * @param {string} buildId - ID du build
 */
function markAsProcessed(buildId) {
  processedBuilds.add(buildId);
  logDebug(`Build ${buildId} marked as processed`);
}

/**
 * Incrémente et retourne le nombre d'itérations pour un build
 * @param {string} buildId - ID du build original
 * @returns {number} Nombre d'itérations actuelles
 */
function incrementIteration(buildId) {
  const current = buildIterations.get(buildId) || 0;
  const next = current + 1;
  buildIterations.set(buildId, next);
  return next;
}

/**
 * Réinitialise les itérations d'un build (en cas de succès)
 * @param {string} buildId - ID du build
 */
function resetIterations(buildId) {
  buildIterations.delete(buildId);
}

/**
 * Traite un build échoué
 * @param {Object} build - Objet build de l'API NexusBuild
 * @param {string} [originalBuildId] - ID du build original (pour le suivi des itérations)
 * @returns {Promise<boolean>} True si le fix a réussi et le nouveau build aussi
 */
async function processFailedBuild(build, originalBuildId = null) {
  const buildId = build.id || build._id;
  const trackingId = originalBuildId || buildId;

  const iteration = incrementIteration(trackingId);
  logInfo(`=== Processing failed build ${buildId} (iteration ${iteration}/${config.MAX_ITERATIONS}) ===`);

  if (iteration > config.MAX_ITERATIONS) {
    logError(`Max iterations (${config.MAX_ITERATIONS}) reached for build ${trackingId}. Abandoning.`);
    markAsProcessed(trackingId);
    resetIterations(trackingId);
    return false;
  }

  try {
    // Étape 2 : Récupérer les logs
    logInfo('Step 2: Fetching build logs...');
    const logs = await nexusBuildApi.getBuildLogs(buildId);

    if (!logs || logs.length === 0) {
      logError('No logs available for this build');
      markAsProcessed(buildId);
      return false;
    }

    logInfo(`Got ${logs.length} characters of logs`);

    // Étape 3 : Diagnostic avec Claude Code CLI
    logInfo('Step 3: Diagnosing with Claude Code CLI...');
    const diagnostic = await claudeRunner.diagnoseBuildFailure(logs);

    if (!diagnostic.source) {
      logError('Could not determine the source of the problem');
      markAsProcessed(buildId);
      return false;
    }

    let fixSuccess = false;

    if (diagnostic.source === 'BUILDER') {
      // Étape 4a : Fix NexusBuild
      logInfo('Step 4a: Fixing NexusBuild (builder) issue...');
      fixSuccess = await claudeRunner.fixBuilderIssue(logs);
    } else if (diagnostic.source === 'APP') {
      // Étape 4b : Fix App
      logInfo('Step 4b: Fixing App issue...');

      // Trouver le chemin du repo cloné
      const repoPath = path.join(config.STORAGE_REPOS, buildId);
      logInfo(`App repo path: ${repoPath}`);

      fixSuccess = await claudeRunner.fixAppIssue(repoPath, logs);

      if (fixSuccess) {
        // Attendre un peu pour laisser le temps au push
        logInfo('Waiting 10s for push to complete...');
        await sleep(10000);

        // Vérifier sur GitHub si un push direct a été fait ou si une PR a été créée
        logInfo('Checking GitHub for push or PR...');

        const repository = build.repository;
        const branch = build.branch;

        // Vérifier si un push direct a été fait
        const directPush = await githubApi.checkDirectPush(repository, branch);

        if (directPush) {
          logInfo('Direct push detected on GitHub');
        } else {
          // Chercher et merger une PR si elle existe
          logInfo('No direct push detected, checking for PR...');
          const prResult = await githubApi.findAndMergeClaudePR(repository, branch);

          if (prResult.found) {
            if (prResult.merged) {
              logInfo(`PR #${prResult.prNumber} found and merged`);
            } else {
              logWarn(`PR #${prResult.prNumber} found but could not be merged (missing token?)`);
            }
          } else {
            logWarn('No PR found, the fix may not have been pushed');
          }
        }
      }
    }

    if (!fixSuccess) {
      logError('Fix failed');
      markAsProcessed(buildId);
      return false;
    }

    // Relancer le build
    logInfo('Relaunching build...');
    const newBuild = await nexusBuildApi.createBuild(
      build.repository,
      build.branch,
      build.buildType || 'debug'
    );

    const newBuildId = newBuild.id || newBuild._id;
    logInfo(`New build created: ${newBuildId}`);

    // Marquer l'ancien build comme traité
    markAsProcessed(buildId);

    // Attendre que le nouveau build soit terminé
    logInfo('Waiting for new build to complete...');
    const completedBuild = await nexusBuildApi.waitForBuildCompletion(newBuildId);

    if (completedBuild.status === 'success') {
      logInfo(`=== Build ${newBuildId} SUCCEEDED! ===`);
      resetIterations(trackingId);
      markAsProcessed(newBuildId);
      return true;
    } else if (completedBuild.status === 'failed') {
      logWarn(`Build ${newBuildId} failed again, will retry...`);
      // Récursion pour traiter le nouveau build échoué
      return processFailedBuild(completedBuild, trackingId);
    } else {
      logWarn(`Build ${newBuildId} ended with status: ${completedBuild.status}`);
      markAsProcessed(newBuildId);
      return false;
    }
  } catch (error) {
    logError(`Error processing build ${buildId}`, error);
    markAsProcessed(buildId);
    return false;
  }
}

/**
 * Boucle principale de monitoring
 * Poll l'API toutes les POLL_INTERVAL_MS
 */
async function startMonitoring() {
  logInfo('=== NexusBuild Bot started ===');
  logInfo(`Polling interval: ${config.POLL_INTERVAL_MS}ms`);
  logInfo(`Max iterations per build: ${config.MAX_ITERATIONS}`);
  logInfo(`Claude timeout: ${config.CLAUDE_TIMEOUT_MS}ms`);

  // Vérifier la santé de l'API
  const healthy = await nexusBuildApi.healthCheck();
  if (!healthy) {
    logError('NexusBuild API is not healthy, will retry...');
  } else {
    logInfo('NexusBuild API is healthy');
  }

  // Vérifier le token GitHub
  if (!githubApi.hasToken()) {
    logWarn('No GitHub token configured. PR merge will not work.');
  } else {
    logInfo('GitHub token configured');
  }

  // Boucle infinie de polling
  while (true) {
    try {
      // Étape 1 : Surveillance
      const failedBuilds = await getFailedBuilds();

      // Traiter chaque build échoué séquentiellement
      for (const build of failedBuilds) {
        await processFailedBuild(build);
      }
    } catch (error) {
      logError('Error in monitoring loop', error);
    }

    // Attendre avant le prochain poll
    await sleep(config.POLL_INTERVAL_MS);
  }
}

/**
 * Arrête proprement le monitoring
 */
function stopMonitoring() {
  logInfo('=== NexusBuild Bot stopping ===');
  process.exit(0);
}

module.exports = {
  getFailedBuilds,
  processFailedBuild,
  startMonitoring,
  stopMonitoring,
};
