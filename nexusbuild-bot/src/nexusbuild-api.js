/**
 * Client API NexusBuild
 * Gestion des builds via l'API REST
 */

const axios = require('axios');
const config = require('../config');
const { logInfo, logError, logDebug } = require('./utils');

// Instance axios configurée pour NexusBuild
const api = axios.create({
  baseURL: config.NEXUSBUILD_API,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.BOT_API_TOKEN}`,
  },
});

/**
 * Vérifie que l'API NexusBuild est accessible
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  try {
    const response = await api.get('/health');
    logDebug(`Health check response: ${JSON.stringify(response.data)}`);
    return response.status === 200;
  } catch (error) {
    logError('Health check failed', error);
    return false;
  }
}

/**
 * Liste tous les builds
 * @returns {Promise<Array>} Liste des builds
 */
async function listBuilds() {
  try {
    const response = await api.get('/builds');
    // L'API peut retourner { success, count, builds: [] } ou un tableau direct
    const builds = response.data.builds || response.data || [];
    logDebug(`Listed ${builds.length || 0} builds`);
    return builds;
  } catch (error) {
    logError('Failed to list builds', error);
    throw error;
  }
}

/**
 * Récupère les détails d'un build par son ID
 * @param {string} buildId - ID du build
 * @returns {Promise<Object>} Détails du build
 */
async function getBuild(buildId) {
  try {
    const response = await api.get(`/builds/${buildId}`);
    logDebug(`Got build ${buildId}: status=${response.data.status}`);
    return response.data;
  } catch (error) {
    logError(`Failed to get build ${buildId}`, error);
    throw error;
  }
}

/**
 * Récupère les logs d'un build
 * @param {string} buildId - ID du build
 * @returns {Promise<string>} Logs du build
 */
async function getBuildLogs(buildId) {
  try {
    const response = await api.get(`/builds/${buildId}/logs`);
    logDebug(`Got logs for build ${buildId}: ${typeof response.data === 'string' ? response.data.length : 'object'} chars`);

    // Les logs peuvent être retournés sous différents formats
    if (typeof response.data === 'string') {
      return response.data;
    } else if (response.data && response.data.logs) {
      return response.data.logs;
    } else if (response.data && response.data.content) {
      return response.data.content;
    } else {
      return JSON.stringify(response.data, null, 2);
    }
  } catch (error) {
    logError(`Failed to get logs for build ${buildId}`, error);
    throw error;
  }
}

/**
 * Crée un nouveau build
 * @param {string} repository - URL SSH du repo (git@github.com:user/repo.git)
 * @param {string} branch - Branche à builder
 * @param {string} [buildType='debug'] - Type de build (debug/release)
 * @returns {Promise<Object>} Build créé
 */
async function createBuild(repository, branch, buildType = 'debug') {
  try {
    logInfo(`Creating build: ${repository} @ ${branch} (${buildType})`);
    const response = await api.post('/builds', {
      repository,
      branch,
      buildType,
    });
    logInfo(`Build created with ID: ${response.data.id || response.data._id}`);
    return response.data;
  } catch (error) {
    logError('Failed to create build', error);
    throw error;
  }
}

/**
 * Attend qu'un build soit terminé (success, failed, ou cancelled)
 * @param {string} buildId - ID du build
 * @param {number} [timeout=600000] - Timeout en ms (10 minutes par défaut)
 * @param {number} [pollInterval=5000] - Intervalle de polling en ms
 * @returns {Promise<Object>} Build terminé
 */
async function waitForBuildCompletion(buildId, timeout = 600000, pollInterval = 5000) {
  const startTime = Date.now();
  const terminalStatuses = ['success', 'failed', 'cancelled'];

  while (Date.now() - startTime < timeout) {
    const build = await getBuild(buildId);

    if (terminalStatuses.includes(build.status)) {
      logInfo(`Build ${buildId} completed with status: ${build.status}`);
      return build;
    }

    logDebug(`Build ${buildId} status: ${build.status}, waiting...`);
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Build ${buildId} did not complete within ${timeout}ms`);
}

module.exports = {
  healthCheck,
  listBuilds,
  getBuild,
  getBuildLogs,
  createBuild,
  waitForBuildCompletion,
};
