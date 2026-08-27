# wiki-builder Skill — OKF Wiki Generator & Maintainer

A ready-to-import Omnideck skill that generates and maintains **Open Knowledge Format (OKF) v0.2** knowledge bundles from source datasets, repos, or document collections.

## What's Included

| Component | Description |
|-----------|-------------|
| **8 CLI tools** | `okf-list`, `okf-bundle`, `okf-update`, `okf-import`, `okf-index`, `okf-validate`, `okf-concepts`, `okf-crosslink` |
| **Python library** | `okf` package — Bundle, Manifest, SourceTree, Importer, Indexer, Validator, Registry |
| **SKILL.md** | Agent instructions for the Omnideck AI orchestrator |
| **Skill registration** | `wiki-builder.json` — registers the skill with Omnideck |
| **Installer** | `install.sh` — one-command install to another Omnideck instance |

## Installation

On the target Omnideck instance:

```bash
# 1. Transfer the package
# (scp, rsync, curl, or copy the wiki-builder-skill/ folder)

# 2. Run the installer
cd wiki-builder-skill
bash install.sh
```

## Quick Start

```bash
# List existing bundles
okf-list

# Create a wiki from a documentation folder
okf-update /path/to/docs --name "My Docs"

# Validate the result
okf-validate ~/wiki/My-Docs

# Extract higher-level concepts
okf-concepts ~/wiki/My-Docs
```

## Tools Overview

| Command | Purpose |
|---------|---------|
| `okf-list [--json] [--refresh]` | List all registered bundles |
| `okf-update <source> [-b <bundle>] [--match]` | **Primary entry point** — scan, import, index |
| `okf-bundle <path> [--project NAME]` | Create fresh bundle skeleton |
| `okf-import <source> -b <bundle> [--match]` | Import source files into existing bundle |
| `okf-index <bundle>` | Regenerate `index.md` files |
| `okf-validate <bundle>` | Check bundle for OKF v0.2 conformance |
| `okf-concepts <bundle>` | Extract higher-level concept files from sources |
| `okf-crosslink <bundle_a> <bundle_b>` | Add cross-links between two bundles |

## Package Structure

```
wiki-builder-skill/
├── install.sh              # One-command installer
├── SKILL.md                # Agent instructions (for ~/.claude/skills/)
├── wiki-builder.json       # Skill registration (for /var/lib/omnideck/skills/)
├── README.md               # This file
├── bin/                    # CLI tools (8 executables)
│   ├── okf-list
│   ├── okf-bundle
│   ├── okf-update
│   ├── okf-import
│   ├── okf-index
│   ├── okf-validate
│   ├── okf-concepts
│   └── okf-crosslink
└── lib/okf/                # Python library
    ├── __init__.py
    ├── bundle.py
    ├── importer.py
    ├── indexer.py
    ├── registry.py
    ├── source.py
    └── validator.py
```

## Manual Installation Steps (if not using install.sh)

```bash
# 1. Copy CLI tools
mkdir -p ~/.local/bin
cp bin/okf-* ~/.local/bin/
chmod +x ~/.local/bin/okf-*

# 2. Copy Python library
mkdir -p ~/.local/lib/okf
cp lib/okf/*.py ~/.local/lib/okf/

# 3. Copy SKILL.md
mkdir -p ~/.claude/skills/wiki-builder
cp SKILL.md ~/.claude/skills/wiki-builder/

# 4. Register skill
sudo mkdir -p /var/lib/omnideck/skills
sudo cp wiki-builder.json /var/lib/omnideck/skills/
```

## Requirements

- Python 3.10+
- Omnideck instance (for skill registration)
- No external pip packages required (pure Python stdlib)

## Uninstall

```bash
rm -rf ~/.local/bin/okf-*
rm -rf ~/.local/lib/okf
rm -rf ~/.claude/skills/wiki-builder
sudo rm /var/lib/omnideck/skills/wiki-builder.json
rm -f ~/.okf_registry.json
```