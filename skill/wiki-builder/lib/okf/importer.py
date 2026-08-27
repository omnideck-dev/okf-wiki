"""OKF Importer — convert source files into OKF concept documents.

This is the core deterministic pipeline. Given a source file,
it:
1. Reads the content
2. Generates appropriate YAML frontmatter (type, title, tags)
3. Wraps body content in structural markdown
4. Writes to the bundle with proper path
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .bundle import Bundle
from .source import FileInfo, classify_file, SourceTree


def _slugify(name: str) -> str:
    """Convert a filename or string into a URL-friendly slug."""
    name = re.sub(r"[^\w\s-]", "", name.lower())
    name = re.sub(r"[-\s]+", "-", name).strip("-")
    return name or "untitled"


def _derive_title(rel_path: str) -> str:
    """Derive a human-readable title from a relative file path."""
    stem = Path(rel_path).stem
    # Replace hyphens/underscores with spaces, capitalize words
    title = re.sub(r"[-_]+", " ", stem)
    title = re.sub(r"\s+", " ", title).strip()
    # Capitalize first letter of each word
    return title.title() if title else "Untitled"


def _derive_type(file_info: FileInfo) -> str:
    """Derive an OKF concept type from file classification and name."""
    cat = classify_file(file_info.path)
    name_lower = file_info.path.stem.lower()

    # Special-case common filenames
    type_map: dict[str, str] = {
        "readme": "Documentation",
        "readme.md": "Documentation",
        "index": "Index",
        "changelog": "Changelog",
        "license": "License",
        "contributing": "Guide",
        "contributors": "Guide",
        "setup": "Guide",
        "installation": "Guide",
        "configuration": "Configuration",
        "config": "Configuration",
        "getting-started": "Guide",
        "quickstart": "Guide",
        "tutorial": "Tutorial",
        "api": "API Reference",
        "reference": "Reference",
        "overview": "Overview",
        "faq": "FAQ",
        "glossary": "Glossary",
        "roadmap": "Roadmap",
    }

    if name_lower in type_map:
        return type_map[name_lower]

    # Fall back by category
    cat_map: dict[str, str] = {
        "markdown": "Documentation",
        "rst": "Documentation",
        "text": "Documentation",
        "python": "Source Code",
        "javascript": "Source Code",
        "typescript": "Source Code",
        "go": "Source Code",
        "c": "Source Code",
        "c-header": "Source Code",
        "java": "Source Code",
        "yaml": "Configuration",
        "json": "Data",
        "toml": "Configuration",
        "config": "Configuration",
        "shell": "Script",
        "sql": "Query",
        "html": "Documentation",
        "css": "Stylesheet",
    }

    return cat_map.get(cat, "Reference")


def _derive_tags(file_info: FileInfo, source_tree: SourceTree) -> list[str]:
    """Derive tags from file path components and classification."""
    tags: list[str] = []
    parts = Path(file_info.rel_path).parts

    # Tag from parent directory names
    for part in parts[:-1]:
        slug = _slugify(part)
        if slug and slug not in tags:
            tags.append(slug)

    # Tag from file classification
    cat = classify_file(file_info.path)
    if cat and cat != "unknown":
        tags.append(cat)

    # Tag from project name
    project_slug = _slugify(source_tree.name)
    if project_slug:
        tags.append(project_slug)

    return tags


def _read_content(file_info: FileInfo) -> str:
    """Read file content with encoding detection."""
    encodings = ["utf-8", "latin-1", "cp1252"]
    for enc in encodings:
        try:
            return file_info.path.read_text(encoding=enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    # Last resort: read with errors replaced
    return file_info.path.read_text(encoding="utf-8", errors="replace")


def _wrap_body(content: str, file_info: FileInfo) -> str:
    """Wrap raw file content in structural markdown sections."""
    cat = classify_file(file_info.path)
    body_parts: list[str] = []

    if cat == "markdown":
        # Markdown content goes directly — but we transform headings
        # to start at H2 to avoid conflicts with the concept title
        lines = content.split("\n")
        transformed: list[str] = []
        for line in lines:
            if line.startswith("# ") and not line.startswith("## "):
                # Top-level heading becomes H2
                transformed.append("## " + line[2:])
            elif line.startswith("# ") and line.startswith("## "):
                pass
            else:
                transformed.append(line)
        body_parts.append("\n".join(transformed))

    elif cat in ("yaml", "json", "toml", "config"):
        body_parts.append("```" + cat + "\n" + content + "\n```")

        # Try to parse as structured data for schema table
        summary = _summarize_structured(content, cat)
        if summary:
            body_parts.append("\n## Schema\n")
            body_parts.append(summary)

    elif cat == "python":
        body_parts.append("```python\n" + content + "\n```")

    elif cat == "shell":
        body_parts.append("```bash\n" + content + "\n```")

    elif cat in ("c", "c-header", "go", "java", "javascript", "typescript"):
        lang_map = {
            "c": "c",
            "c-header": "c",
            "go": "go",
            "java": "java",
            "javascript": "javascript",
            "typescript": "typescript",
        }
        body_parts.append("```" + lang_map.get(cat, "") + "\n" + content + "\n```")

    elif cat == "sql":
        body_parts.append("```sql\n" + content + "\n```")

    elif cat in ("image", "pdf"):
        body_parts.append(
            f"_Binary file. See [source](/{file_info.rel_path}) for original._\n"
        )

    else:
        body_parts.append("```\n" + content + "\n```")

    return "\n\n".join(body_parts)


def _summarize_structured(content: str, fmt: str) -> str:
    """Try to extract top-level keys from structured data."""
    import json

    try:
        if fmt == "json":
            data = json.loads(content)
        elif fmt == "yaml":
            import yaml

            data = yaml.safe_load(content)
        else:
            return ""
    except Exception:
        return ""

    if isinstance(data, dict):
        rows: list[str] = []
        for key, val in data.items():
            val_type = type(val).__name__ if not isinstance(val, (dict, list)) else (
                "object" if isinstance(val, dict) else "array"
            )
            rows.append(f"| `{key}` | {val_type} |")
        if rows:
            header = "| Key | Type |\n|-----|------|\n"
            return header + "\n".join(rows)
    elif isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        rows = []
        for key in data[0].keys():
            rows.append(f"| `{key}` | {type(next(iter(data[0].values()))).__name__} |")
        if rows:
            header = "| Key | Type |\n|-----|------|\n"
            return header + "\n".join(rows)
    return ""


def _compute_concept_path(
    file_info: FileInfo, source_tree: SourceTree, subdir: str = "sources"
) -> Path:
    """Compute the concept path within the bundle.

    Maps source file hierarchy to bundle hierarchy:
    - source_root/README.md → sources/readme.md
    - source_root/docs/getting-started.md → sources/docs/getting-started.md
    """
    rel = Path(file_info.rel_path)
    # Remove single top-level dir if it matches project name
    parts = rel.parts
    if len(parts) > 1 and _slugify(parts[0]) == _slugify(source_tree.name):
        parts = parts[1:]

    # Drop index.md / README.md to the root level if at top
    stem_lower = rel.stem.lower()
    if len(parts) <= 1 and stem_lower in ("readme", "index", "readme.md", "index.md"):
        return Path(f"{stem_lower}.md")

    return Path(subdir) / rel.with_suffix(".md")


def import_file(
    file_info: FileInfo,
    bundle: Bundle,
    source_tree: SourceTree,
    subdir: str = "sources",
) -> tuple[Optional[Path], bool]:
    """Import a single source file into the bundle as an OKF concept.

    Returns (concept_path, was_created) — was_created is True if the
    concept file did not exist before this import, or None if skipped.
    """
    # Read and process the file
    try:
        content = _read_content(file_info)
    except Exception as e:
        print(f"  [skip] {file_info.rel_path}: cannot read ({e})")
        return (None, False)

    # Check for empty files
    if not content.strip():
        return (None, False)

    # Derive concept metadata
    type_name = _derive_type(file_info)
    title = _derive_title(file_info.rel_path)
    tags = _derive_tags(file_info, source_tree)
    now = datetime.now(timezone.utc)

    # Compute concept path — check existence BEFORE writing
    concept_rel = _compute_concept_path(file_info, source_tree, subdir)
    concept_path = bundle.root / concept_rel
    was_created = not concept_path.exists()

    # Ensure parent dir exists
    concept_path.parent.mkdir(parents=True, exist_ok=True)

    # Wrap body content
    body = _wrap_body(content, file_info)

    # Build YAML frontmatter
    tags_yaml = ", ".join(tags) if tags else ""
    tags_line = f"\ntags: [{tags_yaml}]" if tags else ""

    frontmatter = (
        "---\n"
        f'type: {type_name}\n'
        f'title: "{title}"\n'
        f'description: "{title} — imported from {file_info.rel_path}"\n'
        f'resource: "/{file_info.rel_path}"\n'
        f'{tags_line}\n'
        f'generated: {{ by: okf-importer/1.0, at: {now.isoformat()} }}\n'
        "status: draft\n"
        "---\n"
    )

    # Write concept file
    concept_path.write_text(frontmatter + body + "\n", encoding="utf-8")
    return (concept_path, was_created)


def import_all(
    files: list[FileInfo],
    bundle: Bundle,
    source_tree: SourceTree,
    subdir: str = "sources",
) -> tuple[int, int]:
    """Import multiple files.

    Returns (created_count, updated_count).
    """
    created = 0
    updated = 0

    for fi in files:
        concept_path, was_created = import_file(fi, bundle, source_tree, subdir)
        if concept_path is None:
            continue

        if was_created:
            created += 1
        else:
            updated += 1

        # Record in manifest
        bundle.manifest.record(fi.path, concept_path)

    return created, updated