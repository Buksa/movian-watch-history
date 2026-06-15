#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

failures=0

check_pattern() {
  local file="$1"
  local label="$2"
  local pattern="$3"

  if grep -nE "${pattern}" "${file}"; then
    printf 'ERROR: %s uses %s\n' "${file}" "${label}" >&2
    failures=1
  fi
}

while IFS= read -r -d '' file; do
  check_pattern "${file}" "let, const, or class" \
    '(^|[^[:alnum:]_$])(let|const|class)[[:space:]]'
  check_pattern "${file}" "an arrow function" '=>'
  check_pattern "${file}" "a template literal" '`'
  check_pattern "${file}" "optional chaining" '\?\.[[:alnum:]_$[(]'
  check_pattern "${file}" "nullish coalescing" '\?\?'
  check_pattern "${file}" "async or await" \
    '(^|[^[:alnum:]_$])(async|await)([^[:alnum:]_$]|$)'
  check_pattern "${file}" "spread or rest syntax" \
    '\.\.\.[[:space:]]*[[:alnum:]_$[({]'
  check_pattern "${file}" "a for-of loop" \
    'for[[:space:]]*\([^)]*[[:space:]]of[[:space:]]'
done < <(git ls-files -z -- '*.js')

if (( failures )); then
  exit 1
fi

echo "Tracked JavaScript passes the ES5.1 compatibility scan"
