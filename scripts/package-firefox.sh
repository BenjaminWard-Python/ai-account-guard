#!/bin/sh
# Builds the Firefox (AMO / self-distribution) upload: dist/ai-account-guard-firefox-<version>.zip
# Same source as the Chrome build; only the manifest differs, so it is derived here.
set -eu
cd "$(dirname "$0")/.."
stage=dist/firefox
rm -rf "$stage"
mkdir -p "$stage"
cp -R extension/. "$stage/"
find "$stage" -name .DS_Store -delete

python3 - "$stage/manifest.json" <<'PY'
import json, sys
path = sys.argv[1]
m = json.load(open(path))
m.pop("minimum_chrome_version", None)
m.pop("storage", None)  # Firefox reads managed settings from policies.json without a schema
m["background"] = {"scripts": ["shared/providers.js", "shared/config.js", "shared/dashboard.js", "shared/rules.js", "background.js"]}
m["browser_specific_settings"] = {
    "gecko": {
        # Set once, never change: the ID is what policies.json and users' data are keyed to.
        "id": "ai-account-guard@stratitsolutions.com",
        "strict_min_version": "142.0",
        "data_collection_permissions": {"required": ["none"]},
    },
    "gecko_android": {"strict_min_version": "142.0"},
}
json.dump(m, open(path, "w"), indent=2)
PY

version=$(python3 -c 'import json; print(json.load(open("'"$stage"'/manifest.json"))["version"])')
out="dist/ai-account-guard-firefox-$version.zip"
rm -f "$out"
(cd "$stage" && zip -qr -X "../../$out" .)
echo "$out"
unzip -l "$out" | tail -1
