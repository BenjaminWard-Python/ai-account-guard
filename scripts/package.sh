#!/bin/sh
# Builds the Chrome Web Store upload: dist/ai-account-guard-<version>.zip
set -eu
cd "$(dirname "$0")/.."
version=$(python3 -c 'import json; print(json.load(open("extension/manifest.json"))["version"])')
out="dist/ai-account-guard-$version.zip"
mkdir -p dist
rm -f "$out"
(cd extension && zip -qr -X "../$out" . -x '*.DS_Store')
echo "$out"
unzip -l "$out" | tail -1
