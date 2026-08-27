#!/usr/bin/env bash
# wiki-builder Skill Installer
# Installs the OKF Wiki Builder CLI tools, library, skill registration, and SKILL.md.
#
# Usage: bash install.sh [--prefix ~/custom-path]
set -euo pipefail

PREFIX="${HOME}"
SKILL_DIR="${PREFIX}/.claude/skills/wiki-builder"
SKILL_REG_DIR="/var/lib/omnideck/skills"
BIN_DIR="${PREFIX}/.local/bin"
LIB_DIR="${PREFIX}/.local/lib/okf"

# Parse optional --prefix
if [[ "${1:-}" == "--prefix" && -n "${2:-}" ]]; then
    PREFIX="$2"
    SKILL_DIR="${PREFIX}/.claude/skills/wiki-builder"
    BIN_DIR="${PREFIX}/.local/bin"
    LIB_DIR="${PREFIX}/.local/lib/okf"
fi

echo "=== wiki-builder Skill Installer ==="
echo "  Prefix:     ${PREFIX}"
echo "  Bin dir:    ${BIN_DIR}"
echo "  Lib dir:    ${LIB_DIR}"
echo "  Skill dir:  ${SKILL_DIR}"
echo "  Reg dir:    ${SKILL_REG_DIR}"
echo ""

# 1. Install CLI binaries
echo "[1/4] Installing CLI tools to ${BIN_DIR}..."
mkdir -p "${BIN_DIR}"
for tool in okf-list okf-bundle okf-update okf-import okf-index okf-validate okf-concepts okf-crosslink; do
    cp "bin/${tool}" "${BIN_DIR}/${tool}"
    chmod +x "${BIN_DIR}/${tool}"
    echo "  ✓ ${tool}"
done

# 2. Install Python library
echo "[2/4] Installing Python library to ${LIB_DIR}..."
mkdir -p "${LIB_DIR}"
for mod in __init__.py bundle.py importer.py indexer.py registry.py source.py validator.py; do
    cp "lib/okf/${mod}" "${LIB_DIR}/${mod}"
    echo "  ✓ okf/${mod}"
done

# 3. Install SKILL.md
echo "[3/4] Installing SKILL.md to ${SKILL_DIR}..."
mkdir -p "${SKILL_DIR}"
cp SKILL.md "${SKILL_DIR}/SKILL.md"
echo "  ✓ SKILL.md"

# 4. Register skill with Omnideck
echo "[4/4] Registering skill with Omnideck..."
mkdir -p "${SKILL_REG_DIR}"
cp wiki-builder.json "${SKILL_REG_DIR}/wiki-builder.json"
echo "  ✓ wiki-builder.json"

# Ensure bin dir is on PATH
if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
    echo ""
    echo "NOTE: Add ${BIN_DIR} to your PATH to use the CLI tools."
    echo "  echo 'export PATH=\"\$PATH:${BIN_DIR}\"' >> ~/.bashrc"
fi

echo ""
echo "=== Installation complete! ==="
echo "Run 'okf-list' to verify."