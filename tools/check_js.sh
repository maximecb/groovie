#!/bin/bash

# Checks that every .js file in the project parses as an ES module.
#
# Note that `node --check foo.js` silently succeeds on files that Node detects
# as ES modules, so each file is copied to a .mjs temp file first, which makes
# Node parse it as a module for real.

set -u

# Paths are relative to the repo root, so the script can be run from anywhere.
cd "$(dirname "$0")/.." || exit 1

if ! command -v node &> /dev/null; then
    echo "Error: node is not installed. Please install it first."
    exit 1
fi

temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT

checked=0
failures=0

while read -r file; do
    checked=$((checked + 1))
    temp_file="$temp_dir/check.mjs"
    cp "$file" "$temp_file"

    if ! output=$(node --check "$temp_file" 2>&1); then
        echo "FAIL $file"
        # Report the real path rather than the temp file's.
        echo "$output" | sed "s|[^ ]*check\.mjs|$file|g"
        failures=$((failures + 1))
    fi
done < <(find . -type f -name "*.js" -not -path "./.git/*" -not -path "./node_modules/*" | sort)

echo "Checked $checked JavaScript files, $failures failure(s)."

if [ "$failures" -ne 0 ]; then
    exit 1
fi
