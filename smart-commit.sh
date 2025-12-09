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
# 3) KI-Commit-Message versuchen
#########################################

MESSAGE=""

if [ ! -z "$OPENAI_API_KEY" ]; then
  echo "🧠 Versuche Commit-Message mit KI zu erzeugen…"

  RAW_RESPONSE=$(curl -s https://api.openai.com/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d "{
      \"model\": \"gpt-4o-mini\",
      \"messages\": [
        {
          \"role\": \"system\",
          \"content\": \"Fasse die folgenden Git-Änderungen in max. 10, besser 5 Wörtern zusammen. Nur die Commit-Message, ohne Satzzeichen, ohne Anführungszeichen.\"
        },
        {
          \"role\": \"user\",
          \"content\": ${DIFF@Q}
        }
      ]
    }")

  # JSON response extrahieren
  MESSAGE=$(echo "$RAW_RESPONSE" | jq -r '.choices[0].message.content' 2>/dev/null || echo "")

  # Wenn API error oder kein Ergebnis → MESSAGE bleibt leer
fi

#########################################
# 4) Fallback, wenn KI nicht funktioniert
#########################################

if [ -z "$MESSAGE" ] || [ "$MESSAGE" = "null" ]; then
  echo "⚠️  KI-Antwort fehlgeschlagen, nutze Fallback."

  # erste 3 geänderte Dateien holen
  FILE_SUMMARY=$(git diff --cached --name-only | head -n 3 | sed 's/\..*//' | tr '/\n' ' ' | xargs)

  # Timestamp bauen
  TS=$(date +"%Y-%m-%d_%H-%M-%S")

  MESSAGE="${FILE_SUMMARY:-update} ${TS}"
fi

#########################################
# 5) Commit + Push
#########################################

echo "💬 Commit-Message: \"$MESSAGE\""

git commit -m "$MESSAGE"
git push

echo "✔ Erfolgreich gepusht!"
