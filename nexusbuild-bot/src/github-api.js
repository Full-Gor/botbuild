/**
 * Client API GitHub
 * Vérification des PR et merge automatique
 */

const axios = require('axios');
const config = require('../config');
const { logInfo, logError, logDebug, parseGitSshUrl } = require('./utils');

// Instance axios configurée pour GitHub API
const api = axios.create({
  baseURL: 'https://api.github.com',
  timeout: 30000,
  headers: {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'NexusBuild-Bot',
  },
});

// Ajouter le token si disponible
if (config.GITHUB_TOKEN) {
  api.defaults.headers.Authorization = `token ${config.GITHUB_TOKEN}`;
}

/**
 * Vérifie si un token GitHub est configuré
 * @returns {boolean}
 */
function hasToken() {
  return !!config.GITHUB_TOKEN;
}

/**
 * Liste les Pull Requests ouvertes pour un repo
 * @param {string} owner - Propriétaire du repo
 * @param {string} repo - Nom du repo
 * @param {string} [head] - Filtre par branche head (format: owner:branch)
 * @returns {Promise<Array>} Liste des PRs
 */
async function listPullRequests(owner, repo, head = null) {
  try {
    const params = { state: 'open' };
    if (head) {
      params.head = head;
    }

    const response = await api.get(`/repos/${owner}/${repo}/pulls`, { params });
    logDebug(`Found ${response.data.length} open PRs for ${owner}/${repo}`);
    return response.data;
  } catch (error) {
    logError(`Failed to list PRs for ${owner}/${repo}`, error);
    throw error;
  }
}

/**
 * Récupère les détails d'une Pull Request
 * @param {string} owner - Propriétaire du repo
 * @param {string} repo - Nom du repo
 * @param {number} prNumber - Numéro de la PR
 * @returns {Promise<Object>} Détails de la PR
 */
async function getPullRequest(owner, repo, prNumber) {
  try {
    const response = await api.get(`/repos/${owner}/${repo}/pulls/${prNumber}`);
    logDebug(`Got PR #${prNumber}: ${response.data.title}`);
    return response.data;
  } catch (error) {
    logError(`Failed to get PR #${prNumber} for ${owner}/${repo}`, error);
    throw error;
  }
}

/**
 * Merge une Pull Request
 * @param {string} owner - Propriétaire du repo
 * @param {string} repo - Nom du repo
 * @param {number} prNumber - Numéro de la PR
 * @param {string} [commitMessage] - Message de commit optionnel
 * @param {string} [mergeMethod='merge'] - Méthode de merge (merge, squash, rebase)
 * @returns {Promise<Object>} Résultat du merge
 */
async function mergePullRequest(owner, repo, prNumber, commitMessage = null, mergeMethod = 'merge') {
  try {
    if (!hasToken()) {
      throw new Error('GitHub token required to merge PRs');
    }

    const data = { merge_method: mergeMethod };
    if (commitMessage) {
      data.commit_message = commitMessage;
    }

    logInfo(`Merging PR #${prNumber} in ${owner}/${repo} (method: ${mergeMethod})`);
    const response = await api.put(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, data);
    logInfo(`PR #${prNumber} merged successfully`);
    return response.data;
  } catch (error) {
    logError(`Failed to merge PR #${prNumber} for ${owner}/${repo}`, error);
    throw error;
  }
}

/**
 * Vérifie les derniers commits sur une branche
 * @param {string} owner - Propriétaire du repo
 * @param {string} repo - Nom du repo
 * @param {string} branch - Nom de la branche
 * @param {number} [perPage=5] - Nombre de commits à récupérer
 * @returns {Promise<Array>} Liste des commits récents
 */
async function getRecentCommits(owner, repo, branch, perPage = 5) {
  try {
    const response = await api.get(`/repos/${owner}/${repo}/commits`, {
      params: { sha: branch, per_page: perPage },
    });
    logDebug(`Got ${response.data.length} recent commits for ${owner}/${repo}@${branch}`);
    return response.data;
  } catch (error) {
    logError(`Failed to get commits for ${owner}/${repo}@${branch}`, error);
    throw error;
  }
}

/**
 * Vérifie si un push a été effectué récemment (dans les dernières minutes)
 * @param {string} owner - Propriétaire du repo
 * @param {string} repo - Nom du repo
 * @param {string} branch - Nom de la branche
 * @param {number} [withinMinutes=5] - Fenêtre de temps en minutes
 * @returns {Promise<boolean>}
 */
async function hasRecentPush(owner, repo, branch, withinMinutes = 5) {
  try {
    const commits = await getRecentCommits(owner, repo, branch, 1);

    if (commits.length === 0) {
      return false;
    }

    const lastCommitDate = new Date(commits[0].commit.author.date);
    const now = new Date();
    const diffMinutes = (now - lastCommitDate) / (1000 * 60);

    logDebug(`Last commit on ${branch} was ${diffMinutes.toFixed(1)} minutes ago`);
    return diffMinutes <= withinMinutes;
  } catch (error) {
    logError(`Failed to check recent push for ${owner}/${repo}@${branch}`, error);
    return false;
  }
}

/**
 * Cherche et merge une PR créée par Claude si elle existe
 * @param {string} sshUrl - URL SSH du repo (git@github.com:user/repo.git)
 * @param {string} branch - Branche cible
 * @returns {Promise<{ found: boolean, merged: boolean, prNumber?: number }>}
 */
async function findAndMergeClaudePR(sshUrl, branch) {
  const repoInfo = parseGitSshUrl(sshUrl);

  if (!repoInfo) {
    logError(`Could not parse repository URL: ${sshUrl}`);
    return { found: false, merged: false };
  }

  const { owner, repo } = repoInfo;

  try {
    // Lister les PRs ouvertes
    const prs = await listPullRequests(owner, repo);

    // Chercher une PR créée récemment (possiblement par Claude)
    // On cherche les PRs qui ciblent notre branche
    const matchingPRs = prs.filter(pr => pr.base.ref === branch);

    if (matchingPRs.length === 0) {
      logInfo(`No open PRs found targeting branch ${branch}`);
      return { found: false, merged: false };
    }

    // Prendre la PR la plus récente
    const latestPR = matchingPRs.sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    // Vérifier si elle a été créée récemment (dans les 10 dernières minutes)
    const prDate = new Date(latestPR.created_at);
    const now = new Date();
    const diffMinutes = (now - prDate) / (1000 * 60);

    if (diffMinutes > 10) {
      logInfo(`PR #${latestPR.number} is too old (${diffMinutes.toFixed(1)} minutes), skipping`);
      return { found: false, merged: false };
    }

    logInfo(`Found recent PR #${latestPR.number}: "${latestPR.title}"`);

    // Merger la PR
    if (hasToken()) {
      await mergePullRequest(owner, repo, latestPR.number, `Auto-merge: ${latestPR.title}`);
      return { found: true, merged: true, prNumber: latestPR.number };
    } else {
      logWarn('No GitHub token configured, cannot merge PR');
      return { found: true, merged: false, prNumber: latestPR.number };
    }
  } catch (error) {
    logError(`Failed to find/merge PR for ${owner}/${repo}`, error);
    return { found: false, merged: false };
  }
}

/**
 * Vérifie si un push direct a été effectué (pas via PR)
 * @param {string} sshUrl - URL SSH du repo
 * @param {string} branch - Branche à vérifier
 * @returns {Promise<boolean>}
 */
async function checkDirectPush(sshUrl, branch) {
  const repoInfo = parseGitSshUrl(sshUrl);

  if (!repoInfo) {
    logError(`Could not parse repository URL: ${sshUrl}`);
    return false;
  }

  return hasRecentPush(repoInfo.owner, repoInfo.repo, branch);
}

module.exports = {
  hasToken,
  listPullRequests,
  getPullRequest,
  mergePullRequest,
  getRecentCommits,
  hasRecentPush,
  findAndMergeClaudePR,
  checkDirectPush,
};
