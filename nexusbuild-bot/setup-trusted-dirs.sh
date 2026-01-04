#!/bin/bash
# Script de configuration des répertoires trusted pour Claude Code CLI
# Exécuter une fois avant de lancer le bot en mode automatique

set -e

NEXUSBUILD_PATH="${NEXUSBUILD_REPO_PATH:-/home/arnaud/sdk/nexusbuild-web}"
STORAGE_REPOS="${STORAGE_REPOS:-/home/arnaud/sdk/nexusbuild-web/storage/repos}"

echo "=== Configuration des répertoires trusted pour Claude Code CLI ==="
echo ""
echo "Ce script va :"
echo "1. Exécuter Claude CLI dans le répertoire NexusBuild pour le marquer comme trusted"
echo "2. Créer le dossier storage/repos s'il n'existe pas"
echo ""

# Vérifier que claude est installé
if ! command -v claude &> /dev/null; then
    echo "ERREUR: Claude Code CLI n'est pas installé ou pas dans le PATH"
    exit 1
fi

# 1. Trust le répertoire NexusBuild
echo ">>> Étape 1: Trust du répertoire NexusBuild ($NEXUSBUILD_PATH)"
if [ -d "$NEXUSBUILD_PATH" ]; then
    cd "$NEXUSBUILD_PATH"
    echo "Exécution de: claude --dangerously-skip-permissions -p 'echo test'"
    echo ""
    echo "⚠️  Si un prompt 'workspace trust' apparaît, réponds 'yes' pour autoriser."
    echo ""
    claude --dangerously-skip-permissions -p "Réponds juste OK" || true
    echo ""
    echo "✅ Répertoire NexusBuild trusted"
else
    echo "⚠️  Le répertoire $NEXUSBUILD_PATH n'existe pas"
fi

# 2. Créer le dossier storage/repos
echo ""
echo ">>> Étape 2: Création du dossier storage/repos"
mkdir -p "$STORAGE_REPOS"
echo "✅ Dossier $STORAGE_REPOS créé"

echo ""
echo "=== Configuration terminée ==="
echo ""
echo "Note importante pour l'automatisation complète:"
echo "Les repos clonés dans $STORAGE_REPOS auront des IDs dynamiques."
echo "Chaque nouveau build créera un sous-dossier qui devra être trusted."
echo ""
echo "Solutions possibles:"
echo "1. Ajouter manuellement le dossier parent dans ~/.claude/settings.json"
echo "2. Utiliser l'API Anthropic directement au lieu de Claude CLI"
echo ""
echo "Pour ajouter manuellement les trusted dirs:"
echo "  1. Ouvrir ~/.claude/settings.json"
echo "  2. Ajouter dans 'trustedDirectories': ['$NEXUSBUILD_PATH', '$STORAGE_REPOS']"
