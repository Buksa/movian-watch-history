#!/usr/bin/env bash

set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Not inside a Git repository" >&2
  exit 1
}

command -v project-knowledge >/dev/null 2>&1 || {
  echo "project-knowledge is not available in PATH" >&2
  exit 1
}

exec project-knowledge --project "${ROOT}" context "${1:-}"
