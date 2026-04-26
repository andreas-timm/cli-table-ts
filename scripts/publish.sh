#!/usr/bin/env bash

set -euo pipefail

npm run pack

name="$(jq -r .name package.json | sed 's/@//;s:/:-:')"
version="$(jq -r .version package.json)"

args=(--access public)

[ -n "${npm_config_registry:-}" ] && args+=(--registry "$npm_config_registry")
[ -n "${npm_config_otp:-}" ] && args+=(--otp "$npm_config_otp")

npm publish "./packs/${name}-${version}.tgz" "${args[@]}" "$@"
