#!/usr/bin/env bash
# okf-wiki Pack Installer
# Installs: wiki-builder skill (CLI tools), okf-wiki app, wiki-curator agent profile
set -euo pipefail

PREFIX="${1:-${HOME}}"
BIN_DIR="${PREFIX}/.local/bin"
SKILL_REG_DIR="/var/lib/omnideck/skills"
PROFILE_DIR="/var/lib/omnideck/agent_profiles"
APP_DIR="${PREFIX}/apps"

echo "=== okf-wiki Pack Installer ==="
echo "  Prefix:     ${PREFIX}"
echo "  Bin dir:    ${BIN_DIR}"
echo "  Profile:    ${PROFILE_DIR}"
echo "  Skill reg:  ${SKILL_REG_DIR}"
echo "  App dir:    ${APP_DIR}"
echo ""

PACK_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Install skill CLI tools
echo "[1/4] Installing wiki-builder CLI tools..."
mkdir -p "${BIN_DIR}"
for tool in okf-list okf-bundle okf-update okf-import okf-index okf-validate okf-concepts okf-crosslink; do
    cp "${PACK_DIR}/skill/wiki-builder/bin/${tool}" "${BIN_DIR}/${tool}"
    chmod +x "${BIN_DIR}/${tool}"
    echo "  ✓ ${tool}"
done

# 2. Install skill Python library
echo "[2/4] Installing wiki-builder Python library..."
LIB_DIR="${PREFIX}/.local/lib/okf"
mkdir -p "${LIB_DIR}"
for mod in __init__.py bundle.py importer.py indexer.py registry.py source.py validator.py; do
    cp "${PACK_DIR}/skill/wiki-builder/lib/okf/${mod}" "${LIB_DIR}/${mod}"
    echo "  ✓ okf/${mod}"
done

# 3. Register skill with Omnideck
echo "[3/4] Registering wiki-builder skill..."
mkdir -p "${SKILL_REG_DIR}"
cp "${PACK_DIR}/skill/wiki-builder/wiki-builder.json" "${SKILL_REG_DIR}/wiki-builder.json"
echo "  ✓ skill registered"

# 4. Install agent profile
echo "[4/4] Installing wiki-curator agent profile..."
mkdir -p "${PROFILE_DIR}"
cp "${PACK_DIR}/profile/wiki-curator.json" "${PROFILE_DIR}/wiki-curator.json"
echo "  ✓ profile installed"

# 5. Install the okf-wiki app
echo "[5/5] Installing okf-wiki app..."
mkdir -p "${APP_DIR}"
if [ -d "${APP_DIR}/okf-wiki" ]; then
    echo "  App already exists at ${APP_DIR}/okf-wiki — skipping copy"
    echo "  Remove it first with: rm -rf ${APP_DIR}/okf-wiki"
else
    cp -r "${PACK_DIR}/app/okf-wiki" "${APP_DIR}/okf-wiki"
    echo "  ✓ app installed to ${APP_DIR}/okf-wiki"
fi

echo ""
echo "=== Installation complete! ==="
echo ""
echo "What was installed:"
echo "  • wiki-builder skill — 8 CLI tools (okf-list, okf-bundle, okf-update, etc.)"
echo "  • wiki-curator agent profile — ready to use with spawn_agent(profile='wiki-curator')"
echo "  • okf-wiki app — a web UI for browsing/editing/visualizing OKF wikis"
echo ""
echo "Quick start:"
echo "  okf-list                          # List existing wiki bundles"
echo "  okf-update /path/to/source --name \"Project\"  # Build a new wiki"
echo "  okf-validate ~/wiki/Project       # Validate it"
echo "  # Then browse the wiki via Omnideck -> OKF Wiki app"