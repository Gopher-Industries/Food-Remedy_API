#!/usr/bin/env bash
set -euo pipefail

# Entrypoint for pipeline container
# Respects env vars:
#  - CONFIG (path to pipeline config inside container)
#  - FORCE (if 'true', adds --force)

CONFIG=${CONFIG:-/app/database/pipeline/pipeline.config.json}
FORCE_FLAG=""
if [[ "${FORCE:-}" == "true" ]]; then
  FORCE_FLAG="--force"
fi

# Ensure checkpoint directory exists and is writeable
mkdir -p /data/pipeline
touch /data/pipeline/pipeline_checkpoints.json || true

echo "Running pipeline with config: ${CONFIG}"
exec python -m database.pipeline.run_pipeline -c "${CONFIG}" ${FORCE_FLAG}
