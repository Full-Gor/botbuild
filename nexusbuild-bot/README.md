# NexusBuild Bot

Bot d'automatisation de build mobile self-hosted pour NexusBuild.

## Description

Ce bot surveille les builds échoués sur NexusBuild et utilise Claude Code CLI pour diagnostiquer et corriger automatiquement les problèmes, que ce soit dans le builder (NexusBuild) ou dans l'application mobile.

## Fonctionnalités

- **Surveillance automatique** : Poll l'API NexusBuild toutes les 10 secondes
- **Diagnostic intelligent** : Utilise Claude Code CLI pour identifier la source du problème (builder ou app)
- **Correction automatique** : Lance Claude Code CLI pour corriger le code
- **Gestion des PR** : Merge automatiquement les PR créées par Claude si nécessaire
- **Retry intelligent** : Jusqu'à 5 tentatives de correction par build échoué

## Installation

```bash
# Cloner le repo
cd /home/arnaud
git clone <repo-url> nexusbuild-bot
cd nexusbuild-bot

# Installer les dépendances
npm install

# Configurer le token GitHub (optionnel mais recommandé)
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
```

## Configuration

Toutes les variables sont configurables via `config.js` ou variables d'environnement :

| Variable | Défaut | Description |
|----------|--------|-------------|
| `GITHUB_TOKEN` | `""` | Token GitHub pour push Git et merger les PR |
| `BOT_API_TOKEN` | `nexusbuild-bot-secret` | Token pour authentification API NexusBuild |
| `NEXUSBUILD_API` | `http://localhost:3001/api` | URL de l'API NexusBuild |
| `NEXUSBUILD_REPO_PATH` | `/home/arnaud/sdk/nexusbuild-web` | Chemin vers le repo NexusBuild |
| `STORAGE_REPOS` | `/home/arnaud/sdk/nexusbuild-web/storage/repos` | Dossier des repos clonés |
| `STORAGE_LOGS` | `/home/arnaud/sdk/nexusbuild-web/storage/logs` | Dossier des logs de build |
| `MAX_ITERATIONS` | `5` | Nombre max de tentatives par build |
| `CLAUDE_TIMEOUT_MS` | `300000` | Timeout Claude CLI (5 min) |
| `POLL_INTERVAL_MS` | `10000` | Intervalle de polling (10 sec) |

### Tokens requis

```bash
# Token GitHub (PAT Classic avec permission "repo")
# https://github.com/settings/tokens
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Token API NexusBuild (doit matcher celui côté serveur)
export BOT_API_TOKEN="nexusbuild-bot-secret"
```

## Exécution

### Mode direct

```bash
node index.js
```

### Avec tmux (recommandé pour les sessions longues)

```bash
# Créer une nouvelle session tmux
tmux new -s nexusbuild-bot

# Lancer le bot
node index.js

# Détacher la session (le bot continue en arrière-plan)
# Appuyer sur: Ctrl+B puis D

# Pour réattacher plus tard
tmux attach -t nexusbuild-bot

# Pour voir les sessions actives
tmux ls

# Pour tuer la session
tmux kill-session -t nexusbuild-bot
```

### Avec systemd (production)

```bash
# Créer le dossier de logs
sudo mkdir -p /var/log/nexusbuild-bot
sudo chown arnaud:arnaud /var/log/nexusbuild-bot

# Copier le fichier service
sudo cp nexusbuild-bot.service /etc/systemd/system/

# Éditer le service pour ajouter le GITHUB_TOKEN
sudo nano /etc/systemd/system/nexusbuild-bot.service
# Modifier la ligne: Environment=GITHUB_TOKEN=ghp_xxxx

# Recharger systemd
sudo systemctl daemon-reload

# Activer le service au démarrage
sudo systemctl enable nexusbuild-bot

# Démarrer le service
sudo systemctl start nexusbuild-bot

# Voir le statut
sudo systemctl status nexusbuild-bot

# Voir les logs
sudo journalctl -u nexusbuild-bot -f

# Arrêter le service
sudo systemctl stop nexusbuild-bot
```

### Avec pm2 (alternative)

```bash
# Installer pm2 globalement
npm install -g pm2

# Lancer le bot
pm2 start index.js --name nexusbuild-bot

# Voir les logs
pm2 logs nexusbuild-bot

# Arrêter
pm2 stop nexusbuild-bot

# Redémarrer
pm2 restart nexusbuild-bot

# Sauvegarder pour redémarrage auto
pm2 save
pm2 startup
```

## Workflow

1. **Surveillance** : Le bot poll `GET /api/builds` toutes les 10 secondes
2. **Détection** : Quand un build passe en `status: "failed"`, il récupère les infos
3. **Logs** : Récupère les logs via `GET /api/builds/:id/logs`
4. **Diagnostic** : Claude Code CLI analyse le dernier tiers des logs et détermine si le problème vient de NexusBuild ou de l'app
5. **Correction** :
   - Si `SOURCE:BUILDER` : Claude corrige NexusBuild
   - Si `SOURCE:APP` : Claude corrige l'app dans le repo cloné et push
6. **Retry** : Relance le build, jusqu'à 5 itérations max

## Structure du projet

```
nexusbuild-bot/
├── config.js              # Configuration
├── index.js               # Point d'entrée
├── package.json           # Dépendances
├── nexusbuild-bot.service # Fichier systemd
├── README.md              # Documentation
└── src/
    ├── monitor.js         # Surveillance et orchestration
    ├── nexusbuild-api.js  # Client API NexusBuild
    ├── github-api.js      # Client API GitHub
    ├── claude-runner.js   # Runner Claude Code CLI
    └── utils.js           # Utilitaires (logs, parsing)
```

## Debug

Pour activer les logs de debug :

```bash
DEBUG=true node index.js
```

## Prérequis

- Node.js >= 18
- Claude Code CLI installé et accessible dans le PATH
- NexusBuild en cours d'exécution sur `localhost:3001`
- Token GitHub avec les permissions `repo` (pour merger les PR)
- Clés SSH configurées pour Git (format `git@github.com:...`)

## Notes importantes

- Le bot utilise `--dangerously-skip-permissions` pour Claude Code CLI
- Les logs sont tronqués au dernier tiers pour éviter les prompts trop longs
- Le timeout par défaut pour Claude est de 5 minutes
- Maximum 5 tentatives de correction par build échoué

## ⚠️ Configuration pour automatisation complète

Claude Code CLI peut demander une confirmation "workspace trust" même avec `--dangerously-skip-permissions`. Pour une automatisation complète sans interaction :

### Option 1 : Pré-approuver les workspaces manuellement

Exécuter le script de setup une fois avant de lancer le bot :

```bash
chmod +x setup-trusted-dirs.sh
./setup-trusted-dirs.sh
```

Ou manuellement :
```bash
# Trust le répertoire NexusBuild
cd /home/arnaud/sdk/nexusbuild-web
claude --dangerously-skip-permissions -p "OK"
# Répondre "yes" au prompt workspace trust
```

### Option 2 : Configurer ~/.claude/settings.json

Ajouter les répertoires dans le fichier de configuration Claude :

```json
{
  "trustedDirectories": [
    "/home/arnaud/sdk/nexusbuild-web",
    "/home/arnaud/sdk/nexusbuild-web/storage/repos"
  ]
}
```

### Option 3 : Utiliser l'API Anthropic directement

Pour éviter complètement les prompts interactifs, remplacer Claude CLI par des appels directs à l'API Anthropic avec `@anthropic-ai/sdk`. Cette approche nécessite de réimplémenter la logique de lecture/écriture de fichiers.

### Problème connu

Les repos d'apps sont clonés dynamiquement dans `/storage/repos/[BUILD_ID]/`. Chaque nouveau build crée un nouveau dossier qui pourrait nécessiter une approbation. La solution 2 (trusted directories parent) devrait résoudre ce problème.
