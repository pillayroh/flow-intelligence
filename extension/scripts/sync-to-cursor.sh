#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run compile --silent

EXT_DIR="$(ls -d "${HOME}/.cursor/extensions/flow-intelligence.flow-intelligence-"* 2>/dev/null | sort -V | tail -1 || true)"
if [[ -z "${EXT_DIR}" ]]; then
  echo "No Flow Intelligence extension found in ~/.cursor/extensions"
  echo "Install once: Extensions → ... → Install from VSIX → flow-intelligence-0.2.5.vsix"
  exit 1
fi

rsync -a "${ROOT}/out/" "${EXT_DIR}/out/"
cp "${ROOT}/package.json" "${EXT_DIR}/package.json"

echo "Synced dev build → ${EXT_DIR}"
echo "Reload this window: Cmd+Shift+P → Developer: Reload Window"
