#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(readlink -f "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/..")"

echo "ℹ️ patch package"

# shellcheck disable=SC2154
name="$(echo "$npm_package_name" | sed 's/@//;s:/:-:')"
# shellcheck disable=SC2154
pack_path_stem="${ROOT_DIR}/packs/${name}-${npm_package_version}"

if [[ ! -f "${pack_path_stem}.tgz" ]]; then
    echo "⚠️ Package tarball not found at ${pack_path_stem}.tgz" >&2
    exit 0
fi

tmp_dir=$(mktemp -d)

cleanup() {
    rm -rf "$tmp_dir"
}

trap cleanup EXIT

tar -xzf "${pack_path_stem}.tgz" -C "$tmp_dir"

perl -i -pe 's#SKILL\.md`\]\(\./skills#SKILL.md`](https://github.com/andreas-timm/cli-table-ts/tree/main/skills#g' "$tmp_dir/package/README.md"
perl -i -0777 -pe 's/\n## Agent skill.*//sg' "$tmp_dir/package/README.md"

tar -czf "${pack_path_stem}.tgz" -C "$tmp_dir" package
