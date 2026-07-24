#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${GITHUB_WORKSPACE}/test-results/ci"
ARCHIVE_NAME="worldforge-portable-node-modules-linux-x64-node24.tar.gz"
ARCHIVE_PATH="${OUT_DIR}/${ARCHIVE_NAME}"

mkdir -p "${OUT_DIR}"
cp .npmrc "${RUNNER_TEMP}/worldforge-original-npmrc"
cat >> .npmrc <<'EOF'
node-linker=hoisted
package-import-method=copy
verify-deps-before-run=false
EOF

rm -rf node_modules
find apps packages -type d -name node_modules -prune -exec rm -rf '{}' +

pnpm install --frozen-lockfile --force
node node_modules/electron/install.js

PRETTIER_VERSION="$(./node_modules/.bin/prettier --version)"
ESLINT_VERSION="$(./node_modules/.bin/eslint --version | sed 's/^v//')"
TYPESCRIPT_VERSION="$(./node_modules/.bin/tsc --version | awk '{print $2}')"
VITEST_VERSION="$(./node_modules/.bin/vitest --version | sed -E 's#^vitest/([^ ]+).*$#\1#')"
PLAYWRIGHT_VERSION="$(./node_modules/.bin/playwright --version | awk '{print $2}')"
ESBUILD_VERSION="$(./node_modules/.bin/esbuild --version)"
ELECTRON_VERSION="$(node -p "require('./node_modules/electron/package.json').version")"
PNPM_VERSION="$(pnpm --version)"

printf '%s\n' \
  "prettier=${PRETTIER_VERSION}" \
  "eslint=${ESLINT_VERSION}" \
  "typescript=${TYPESCRIPT_VERSION}" \
  "vitest=${VITEST_VERSION}" \
  "playwright=${PLAYWRIGHT_VERSION}" \
  "esbuild=${ESBUILD_VERSION}" \
  "electron=${ELECTRON_VERSION}" \
  "pnpm=${PNPM_VERSION}" | tee "${OUT_DIR}/portable-node-modules-versions.txt"

[[ "${PRETTIER_VERSION}" == "3.9.5" ]]
[[ "${ESLINT_VERSION}" == "10.7.0" ]]
[[ "${TYPESCRIPT_VERSION}" == "6.0.3" ]]
[[ "${VITEST_VERSION}" == "4.1.10" ]]
[[ "${PLAYWRIGHT_VERSION}" == "1.61.1" ]]
[[ "${ESBUILD_VERSION}" == "0.28.1" ]]
[[ "${ELECTRON_VERSION}" == "43.1.1" ]]
[[ "${PNPM_VERSION}" == "11.13.0" ]]

test -f node_modules/prettier/package.json
test -x node_modules/.bin/prettier
test -x node_modules/electron/dist/electron

mapfile -d '' WORKSPACE_MODULES < <(find apps packages -type d -name node_modules -prune -print0)
TAR_PATHS=(node_modules)
for path in "${WORKSPACE_MODULES[@]}"; do
  TAR_PATHS+=("${path}")
done

tar -I 'gzip -1' -cf "${ARCHIVE_PATH}" "${TAR_PATHS[@]}"
sha256sum "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.sha256"
ls -lh "${ARCHIVE_PATH}" "${ARCHIVE_PATH}.sha256"

exit 1
