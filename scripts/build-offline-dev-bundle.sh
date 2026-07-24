#!/usr/bin/env bash
set -euo pipefail
# tooling revision 2: trigger main-routed Actions after base retarget

SOURCE_HEAD="7b99b8c52751ac1e2303cd6001a4cff5e5b92ad1"
OUT_DIR="${GITHUB_WORKSPACE}/test-results/ci"
STAGE_DIR="${RUNNER_TEMP}/worldforge-666-dev"
ARCHIVE_NAME="worldforge-666-dev-linux-x64-node24-pr177.tar.gz"
ARCHIVE_PATH="${OUT_DIR}/${ARCHIVE_NAME}"

rm -rf "${STAGE_DIR}"
mkdir -p "${OUT_DIR}" "${STAGE_DIR}/repo" "${STAGE_DIR}/tooling" "${STAGE_DIR}/cache"

pnpm exec playwright install chromium

PRETTIER_VERSION="$(pnpm exec prettier --version)"
ESLINT_VERSION="$(pnpm exec eslint --version | sed 's/^v//')"
TYPESCRIPT_VERSION="$(pnpm exec tsc --version | awk '{print $2}')"
VITEST_VERSION="$(pnpm exec vitest --version | awk '{print $2}')"
PLAYWRIGHT_VERSION="$(pnpm exec playwright --version | awk '{print $2}')"
ESBUILD_VERSION="$(pnpm exec esbuild --version)"
ELECTRON_VERSION="$(node -p "require('./node_modules/electron/package.json').version")"
PNPM_VERSION="$(pnpm --version)"
NODE_VERSION="$(node --version)"
NPM_VERSION="$(npm --version)"

[[ "${PRETTIER_VERSION}" == "3.9.5" ]]
[[ "${ESLINT_VERSION}" == "10.7.0" ]]
[[ "${TYPESCRIPT_VERSION}" == "6.0.3" ]]
[[ "${VITEST_VERSION}" == "4.1.10" ]]
[[ "${PLAYWRIGHT_VERSION}" == "1.61.1" ]]
[[ "${ESBUILD_VERSION}" == "0.28.1" ]]
[[ "${ELECTRON_VERSION}" == "43.1.1" ]]
[[ "${PNPM_VERSION}" == "11.13.0" ]]

xvfb-run -a node_modules/electron/dist/electron --no-sandbox --version > "${STAGE_DIR}/ELECTRON_BINARY_VERSION.txt"

git fetch --no-tags --depth=1 origin "${SOURCE_HEAD}"
git archive --format=tar "${SOURCE_HEAD}" | tar -xf - -C "${STAGE_DIR}/repo"
cp -a node_modules "${STAGE_DIR}/repo/"

while IFS= read -r -d '' workspace_modules; do
  relative_path="${workspace_modules#./}"
  target_parent="${STAGE_DIR}/repo/$(dirname "${relative_path}")"
  mkdir -p "${target_parent}"
  cp -a "${workspace_modules}" "${target_parent}/"
done < <(find apps packages -type d -name node_modules -prune -print0)

if [[ -d "${HOME}/.cache/ms-playwright" ]]; then
  cp -a "${HOME}/.cache/ms-playwright" "${STAGE_DIR}/cache/"
fi

PNPM_REAL="$(readlink -f "$(command -v pnpm)")"
PNPM_PACKAGE_DIR="$(cd "$(dirname "${PNPM_REAL}")/.." && pwd)"
cp -a "${PNPM_PACKAGE_DIR}" "${STAGE_DIR}/tooling/pnpm"
cp -a "$(command -v gh)" "${STAGE_DIR}/tooling/gh"

cat > "${STAGE_DIR}/VERSIONS.txt" <<EOF
source_head=${SOURCE_HEAD}
node=${NODE_VERSION}
npm=${NPM_VERSION}
pnpm=${PNPM_VERSION}
prettier=${PRETTIER_VERSION}
eslint=${ESLINT_VERSION}
typescript=${TYPESCRIPT_VERSION}
vitest=${VITEST_VERSION}
playwright=${PLAYWRIGHT_VERSION}
electron=${ELECTRON_VERSION}
esbuild=${ESBUILD_VERSION}
os=$(uname -s)
arch=$(uname -m)
glibc=$(ldd --version | head -n 1)
EOF

pnpm list --depth 0 --json > "${STAGE_DIR}/DEPENDENCIES.json"

cat > "${STAGE_DIR}/install-local.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
DESTINATION="${1:-/opt/worldforge-666-dev}"

rm -rf "${DESTINATION}"
mkdir -p "${DESTINATION}"
cp -a "${SOURCE_DIR}/." "${DESTINATION}/"

cat > /usr/local/bin/pnpm <<PNPM_WRAPPER
#!/usr/bin/env bash
exec node "${DESTINATION}/tooling/pnpm/bin/pnpm.mjs" "\$@"
PNPM_WRAPPER
chmod 0755 /usr/local/bin/pnpm

install -m 0755 "${DESTINATION}/tooling/gh" /usr/local/bin/gh

cat > /etc/profile.d/worldforge-dev.sh <<PROFILE
export PLAYWRIGHT_BROWSERS_PATH="${DESTINATION}/cache/ms-playwright"
export WORLDFORGE_DEV_ROOT="${DESTINATION}/repo"
PROFILE
chmod 0644 /etc/profile.d/worldforge-dev.sh

printf 'Installed WorldForge development environment at %s\n' "${DESTINATION}"
EOF
chmod 0755 "${STAGE_DIR}/install-local.sh"

cat > "${STAGE_DIR}/README.txt" <<'EOF'
WorldForge 666 offline development environment

Contents:
- Exact PR #177 source snapshot
- Root and workspace node_modules with Linux x86_64 native binaries
- pnpm 11.13.0 portable package
- Playwright 1.61.1 Chromium browser cache
- Electron 43.1.1 and esbuild 0.28.1 platform resources
- Prettier, ESLint, TypeScript and Vitest exact locked versions
- GitHub CLI binary

Install:
  sudo ./install-local.sh /opt/worldforge-666-dev

Use:
  source /etc/profile.d/worldforge-dev.sh
  cd "$WORLDFORGE_DEV_ROOT"
  pnpm --version
EOF

tar -I 'gzip -1' -cf "${ARCHIVE_PATH}" -C "${RUNNER_TEMP}" worldforge-666-dev
sha256sum "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.sha256"
ls -lh "${ARCHIVE_PATH}" "${ARCHIVE_PATH}.sha256"

exit 1
