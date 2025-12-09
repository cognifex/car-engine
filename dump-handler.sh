#!/bin/bash

DUMP_DIR="/opt/car-engine/deploy-dumps"
COUNTER_FILE="/opt/car-engine/autofix-fail-counter"
CONFIG_FILE="/opt/car-engine/autofix.conf"

# Config laden
source "$CONFIG_FILE"

# Sicherstellen, dass Counter existiert
if [ ! -f "$COUNTER_FILE" ]; then
    echo "0" > "$COUNTER_FILE"
fi

COUNTER=$(cat "$COUNTER_FILE")

# Parameter: ZIP-Dateiname, z.B. deploy_dump_<uuid>.zip
ZIPFILE="$1"
UUID=$(echo "$ZIPFILE" | sed -E 's/deploy_dump_(.*)\.zip/\1/')

EXTRACT_DIR="$DUMP_DIR/$UUID"
mkdir -p "$EXTRACT_DIR"

echo "[INFO] Neuer Deploy-Dump erkannt: $ZIPFILE"

# Unzip
unzip -o "$DUMP_DIR/$ZIPFILE" -d "$EXTRACT_DIR"

echo "[INFO] Dump entpackt nach $EXTRACT_DIR"

# Counter erhöhen
COUNTER=$((COUNTER + 1))
echo "$COUNTER" > "$COUNTER_FILE"

echo "[INFO] Fehlversuche in Serie: $COUNTER (Limit: $MAX_AUTOFIX)"

# Codex Analyse
codex api messages.create \
  --model gpt-5.1 \
  --input "Es gab ein Problem beim Deploy. Hier ist der Dump. Bitte analysiere den Fehler, finde die Ursache, behebe sie und führe anschließend ./smart-commit.sh aus. Du hast full access." \
  --files "$EXTRACT_DIR/info.txt" \
  --files "$EXTRACT_DIR/docker-logs.txt" \
  --files "$EXTRACT_DIR/docker-compose.txt" \
  --files "$EXTRACT_DIR/system-info.txt" \
  --files "$EXTRACT_DIR/git-status.txt" \
  --files "$EXTRACT_DIR/deploy.log" \
  > "$EXTRACT_DIR/analysis.txt"

echo "[INFO] Analyse gespeichert: $EXTRACT_DIR/analysis.txt"

# Notification statt Auto-Fix
echo "[INFO] Starte Notification-Skript smart-commit.sh…"
/opt/car-engine/smart-notification.sh "$EXTRACT_DIR"
