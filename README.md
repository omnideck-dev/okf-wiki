# OKF Wiki Pack

**Build, browse, and curate Open Knowledge Format (OKF) v0.2 knowledge bundles.**

This pack gives you everything you need to work with OKF wikis in Omnideck:

| Component | Purpose |
|-----------|---------|
| **wiki-builder skill** | 8 deterministic CLI tools for generating wikis from source datasets |
| **okf-wiki app** | Web UI for browsing, editing, searching, and visualizing wikis |
| **wiki-curator profile** | Agent profile combining both — build wikis, then browse them |

## What's Inside

### wiki-builder skill (`skill/wiki-builder/`)

8 CLI tools at `~/.local/bin/okf-*`:

| Tool | Purpose |
|------|---------|
| `okf-list` | List all registered wiki bundles |
| `okf-bundle <path>` | Create a fresh bundle skeleton |
| `okf-update <source> [-b <bundle>]` | **Primary entry point** — scan, import, index |
| `okf-import <source> -b <bundle>` | Import source files into an existing bundle |
| `okf-index <bundle>` | Regenerate index.md files |
| `okf-validate <bundle>` | Check OKF v0.2 conformance |
| `okf-concepts <bundle>` | Extract higher-level concept files |
| `okf-crosslink <bundle_a> <bundle_b>` | Add cross-links between bundles |

### okf-wiki app (`app/okf-wiki/`)

A full web app (Python backend + vanilla JS frontend) that provides:

- **Bundle browser** — list all wikis with concept counts
- **File explorer** — navigate wiki directories with concept previews
- **Concept editor** — edit YAML frontmatter and markdown body
- **Search** — full-text search across titles, tags, and bodies
- **Backlinks** — see where each concept is referenced
- **Knowledge graph** — visualize the wiki as an interactive graph
- **Validation** — check concepts against OKF spec
- **Templates** — cascading `_template.md` support
- **Import/Export** — JSON bundle snapshots

### wiki-curator agent profile (`profile/wiki-curator.json`)

A dedicated agent profile that:

- Loads the wiki-builder skill (okf-* CLI tools)
- Knows about the okf-wiki app for visual browsing
- Can enrich wikis with LLM-generated descriptions, cross-links, and concept extraction
- Follows the workflow: discover → build/update → validate → browse → enrich

## Installation

```bash
# Navigate to the pack directory
cd ~/packs/okf-wiki

# Run the installer
bash install.sh
```

## Quick Start

```bash
# 1. List existing bundles
okf-list

# 2. Build a wiki from a documentation folder
okf-update /path/to/docs --name "My Project"

# 3. Validate it
okf-validate ~/wiki/My-Project

# 4. Browse it in the web app
#    Open Omnideck → OKF Wiki app

# 5. Enrich with LLM (via wiki-curator agent)
#    spawn_agent(profile="wiki-curator", instructions="...")
```

## Architecture

All components share the same `~/wiki/` directory. Bundles you create with CLI tools
are immediately visible in the web app, and vice versa.

```
~/wiki/[PROJECTNAME]/
├── index.md           # Bundle root
├── log.md             # Change history
├── sources/           # Imported source concepts
├── concepts/          # Higher-level synthesized concepts
└── references/        # External references
```

## Dependencies

- Python 3.10+
- PyYAML
- Standard library only for CLI tools (pathlib, json, re, datetime)

## Pack Metadata

- **Format**: Pack System RFC v1.0
- **Version**: 1.0.0
- **Author**: Omnideck
