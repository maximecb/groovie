#!/bin/bash

# Runs the unit tests under tests/, using the test runner built into Node.
#
# tests/setup.js is loaded ahead of every test file, and has to be: it makes
# the console.assert calls in the model and the audio engine fail the test they
# happen in, including the ones that run while a module is being imported.

set -u

# Paths are relative to the repo root, so the script can be run from anywhere.
cd "$(dirname "$0")/.." || exit 1

if ! command -v node &> /dev/null; then
    echo "Error: node is not installed. Please install it first."
    exit 1
fi

# With no path given, the runner finds the test files on its own
exec node --test --import ./tests/setup.js
