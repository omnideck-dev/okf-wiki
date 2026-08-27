"""OKF Indexer — generate index.md and log.md for a bundle."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .bundle import Bundle, RESERVED_FILENAMES


def _read_frontmatter_field(path: Path, field: str) -> Optional[str]:
    """Extract a single field from a concept's YAML frontmatter."""
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None

    if not content.startswith("---"):
        return None

    # Find closing ---
    end_idx = content.find("---", 3)
    if end_idx == -1:
        return None

    frontmatter = content[3:end_idx].strip()
    for line in frontmatter.split("\n"):
        line = line.strip()
        if line.startswith(f"{field}:"):
            val = line[len(field) + 1 :].strip().strip('"').strip("'")
            return val
    return None


def _get_concept_info(path: Path) -> tuple[str, str, str]:
    """Get (title, description, type) from a concept file."""
    title = _read_frontmatter_field(path, "title") or path.stem.replace("-", " ").title()
    desc = _read_frontmatter_field(path, "description") or ""
    ctype = _read_frontmatter_field(path, "type") or "Reference"

    # Truncate long descriptions
    if len(desc) > 120:
        desc = desc[:117] + "..."
    return title, desc, ctype


def _make_relative_link(concept_path: Path, index_dir: Path) -> str:
    """Create a relative markdown link from index_dir to concept_path."""
    try:
        rel = concept_path.relative_to(index_dir.parent)
        return str(rel)
    except ValueError:
        return concept_path.name


def generate_index(bundle: Bundle, subdir: str = "") -> list[Path]:
    """Generate index.md files for every directory in the bundle.

    Scans all concept files and produces index.md with sections
    grouped by type.

    Returns list of index.md paths written.
    """
    base = bundle.root / subdir if subdir else bundle.root
    if not base.exists():
        return []

    # Collect all directories that contain concept files
    dirs: set[Path] = set()
    for concept in bundle.find_concepts(subdir):
        dirs.add(concept.parent)

    # Also ensure any explicit directories exist
    if not dirs:
        dirs.add(base)

    written: list[Path] = []

    for directory in sorted(dirs):
        items: list[tuple[Path, str, str, str]] = []  # (path, title, desc, type)

        for f in sorted(directory.iterdir()):
            if not f.is_file() or f.suffix != ".md":
                continue
            if f.name in RESERVED_FILENAMES:
                continue
            info = _get_concept_info(f)
            items.append((f, *info))

        if not items:
            continue

        # Group by type
        by_type: dict[str, list[tuple[Path, str, str]]] = {}
        for path, title, desc, ctype in items:
            by_type.setdefault(ctype, []).append((path, title, desc))

        # Build index content
        lines: list[str] = []
        rel_path = directory.relative_to(bundle.root)
        dir_label = str(rel_path).replace("/", " / ").title() if str(rel_path) != "." else "Knowledge Base"

        # Section header
        plural_map = {
            "Documentation": "Documentation",
            "Configuration": "Configuration",
            "Reference": "References",
            "Guide": "Guides",
            "Source Code": "Source Code",
            "Data": "Data",
            "Script": "Scripts",
            "Overview": "Overviews",
        }

        for ctype in sorted(by_type.keys(), key=lambda t: sorted(by_type[t])[0][0].name):
            section_label = plural_map.get(ctype, ctype + "s")
            lines.append(f"\n## {section_label}\n")

            for path, title, desc in by_type[ctype]:
                link = _make_relative_link(path, directory / "index.md")
                if desc:
                    lines.append(f"* [{title}]({link}) — {desc}")
                else:
                    lines.append(f"* [{title}]({link})")

        # Add subdirectory links
        subdirs = sorted(
            d for d in directory.iterdir()
            if d.is_dir() and not d.name.startswith(".")
        )
        if subdirs:
            lines.append("\n## Subdirectories\n")
            for d in subdirs:
                # Check if subdirectory has any indexable content
                sub_items = list(d.rglob("*.md"))
                sub_concepts = [s for s in sub_items if s.name not in RESERVED_FILENAMES]
                count = len(sub_concepts)
                label = d.name.replace("-", " ").title()
                lines.append(f"* [{label}]({d.name}/) — {count} concept{'s' if count != 1 else ''}")

        if lines:
            header = f"# {dir_label}\n"
            content = header + "\n".join(lines) + "\n"
            index_path = directory / "index.md"
            index_path.write_text(content, encoding="utf-8")
            written.append(index_path)

    return written


def generate_log_entry(
    bundle: Bundle,
    action: str,
    description: str,
    created: list[str],
    updated: list[str],
    deleted: list[str],
    subdir: str = "",
) -> None:
    """Append an entry to the bundle's log.md.

    Args:
        bundle: The bundle to update.
        action: Short action label (e.g., "Import", "Update", "Enrich").
        description: One-line summary of what happened.
        created: List of concept paths created (relative to bundle root).
        updated: List of concept paths updated.
        deleted: List of concept paths deleted.
        subdir: Optional subdirectory scope for the log.
    """
    base = bundle.root / subdir if subdir else bundle.root
    log_path = base / "log.md"
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Format the entry
    lines = [f"## {today}\n"]

    lines.append(f"* **{action}**: {description}")

    for label, items in [("Created", created), ("Updated", updated), ("Deleted", deleted)]:
        if items:
            for item in sorted(items):
                lines.append(f"  * **{label}**: [{item}](/{item})")

    lines.append("")

    # Prepend to existing log or create new
    existing = ""
    if log_path.exists():
        existing = log_path.read_text(encoding="utf-8")

    # Ensure header
    if not existing.startswith("#"):
        existing = f"# {base.name.title()} Update Log\n\n" + existing

    log_path.write_text(
        existing.rstrip() + "\n\n" + "\n".join(lines) + "\n",
        encoding="utf-8",
    )