#!/usr/bin/env bash
set -e

#########################################
# 1) ENV mit OpenAI-Key laden
#########################################

if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

#########################################
# 2) Git-Änderungen stagen
#########################################

git add .

DIFF=$(git diff --cached)

if [ -z "$DIFF" ]; then
  echo "Keine Änderungen zum Commit."
  exit 0
fi

#########################################
# 3) Commit-Message aus Dateiliste + Timestamp
#########################################

# erste 3 geänderte Dateien holen
FILE_SUMMARY=$(git diff --cached --name-only | head -n 3 | sed 's/\..*//' | tr '/\n' ' ' | xargs)

# Timestamp bauen
TS=$(date +"%Y-%m-%d_%H-%M-%S")

MESSAGE="${FILE_SUMMARY:-update} ${TS}"

#########################################
# 5) Commit + Push
#########################################

echo "💬 Commit-Message: \"$MESSAGE\""

git commit -m "$MESSAGE"
git push

echo "✔ Erfolgreich gepusht!"
