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
  --model gpt-4.1 \
  --input "Es gab ein Problem beim Deploy. Hier ist der Dump. Bitte analysiere den Fehler und liefere Verbesserungsvorschläge. Führe KEINE unbestätigten Aktionen aus. Maximaler Auto-Fix-Level: $MAX_AUTOFIX. Aktuelle Fehler-Serie: $COUNTER." \
  --files "$EXTRACT_DIR/info.txt" \
  --files "$EXTRACT_DIR/docker-logs.txt" \
  --files "$EXTRACT_DIR/docker-compose.txt" \
  --files "$EXTRACT_DIR/system-info.txt" \
  --files "$EXTRACT_DIR/git-status.txt" \
  --files "$EXTRACT_DIR/deploy.log" \
  > "$EXTRACT_DIR/analysis.txt"

echo "[INFO] Analyse gespeichert: $EXTRACT_DIR/analysis.txt"

# Smart-Commit nur wenn innerhalb des Limits
if [ "$COUNTER" -le "$MAX_AUTOFIX" ]; then
    echo "[INFO] Auto-Fix erlaubt. Starte Smart-Commit."
    /opt/car-engine/smart-commit.sh "$EXTRACT_DIR/analysis.txt"
else
    echo "[WARN] Auto-Fix NICHT erlaubt (Limit überschritten)."
    echo "[WARN] Bitte Entwickler informieren."
fi
