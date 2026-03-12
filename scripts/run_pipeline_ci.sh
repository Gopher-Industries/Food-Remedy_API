#!/usr/bin/env bash
set -euo pipefail

# CI wrapper for running the repository pipeline
# Reads optional env vars:
#  - CONFIG (path to pipeline config file, default database/pipeline/pipeline.config.json)
#  - FORCE  (if set to 'true', passes --force to the pipeline runner)

CONFIG=${CONFIG:-database/pipeline/pipeline.config.json}
FORCE_FLAG=""
if [[ "${FORCE:-}" == "true" ]]; then
  FORCE_FLAG="--force"
fi

echo "Running pipeline with config: ${CONFIG}"
python -m database.pipeline.run_pipeline -c "${CONFIG}" ${FORCE_FLAG}

echo "Pipeline run finished."
