#!/bin/bash

DUMP_DIR="/opt/car-engine/deploy-dumps"

inotifywait -m -e create "$DUMP_DIR" | while read path action file; do
    if [[ "$file" == deploy_dump_*.zip ]]; then
        /opt/car-engine/dump-handler.sh "$file"
    fi
done
