"""OKF Wiki — backend actions for managing OKF-compliant markdown collections."""

import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import yaml
from custom_apps import action


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

WIKI_ROOT = Path("/home/omnideck/wiki")  # Main wiki directory


def _ensure_wiki_root():
    """Ensure the wiki root directory exists."""
    WIKI_ROOT.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize(obj):
    """Recursively convert non-JSON-serializable types to JSON-safe values."""
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, timedelta):
        return str(obj)
    if isinstance(obj, set):
        return list(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    return obj


class _SafeDumper(yaml.SafeDumper):
    """Custom YAML dumper that handles dates as plain strings."""
    pass


def _repr_date(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:str', data.isoformat())


_SafeDumper.add_representer(date, _repr_date)
_SafeDumper.add_representer(datetime, _repr_date)


def _bundle_path(bundle_id: str) -> Path:
    """Get the path for a bundle (collection)."""
    return WIKI_ROOT / bundle_id


def _read_frontmatter(text: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from a markdown string. Returns (fm_dict, body)."""
    fm: dict = {}
    body = text
    match = re.match(r"^---\s*\n(.*?\n)?---\s*\n(.*)", text, re.DOTALL)
    if match:
        try:
            fm = yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError:
            fm = {}
        body = match.group(2)
    return fm, body


def _write_frontmatter(fm: dict, body: str) -> str:
    """Serialize frontmatter + body back to markdown."""
    header = "---\n" + yaml.dump(fm, allow_unicode=True, default_flow_style=False, sort_keys=False, Dumper=_SafeDumper) + "---\n"
    header = header.rstrip("\n") + "\n"
    return header + body


def _list_md_files(dirpath: Path) -> list[str]:
    """List .md files in a directory (non-recursive)."""
    if not dirpath.is_dir():
        return []
    return sorted(f.name for f in dirpath.iterdir() if f.is_file() and f.suffix == ".md")


def _find_all_md(root: Path, prefix: str = "") -> list[dict]:
    """Recursively find all .md files under root, returning path info."""
    results = []
    dirpath = root / prefix
    if not dirpath.is_dir():
        return results
    for entry in sorted(dirpath.iterdir()):
        if entry.is_dir():
            new_prefix = entry.name if not prefix else f"{prefix}/{entry.name}"
            results.extend(_find_all_md(root, new_prefix))
        elif entry.suffix == ".md":
            rel = entry.name if not prefix else f"{prefix}/{entry.name}"
            results.append({"path": rel})
    return results


def _get_type_icon(type_value: str | None) -> str:
    """Map OKF type values to Bootstrap Icons."""
    icons = {
        "Concept": "bi-circle-fill",
        "Reference": "bi-book",
        "How-to": "bi-tools",
        "Decision": "bi-check-circle",
        "Metric": "bi-graph-up",
        "Playbook": "bi-journal-bookmark",
        "Glossary": "bi-list-ol",
        "Daily Note": "bi-calendar-event",
        "Template": "bi-file-earmark-plus",
        "Directory": "bi-folder2-open",
        "Log": "bi-clock-history",
    }
    return icons.get(type_value, "bi-file-earmark-text")


def _trust_tier(fm: dict) -> str:
    """Derive trust tier string from frontmatter."""
    if fm.get("verified"):
        return "human-reviewed"
    if fm.get("generated"):
        return "machine-confirmed"
    return "unverified"


# ---------------------------------------------------------------------------
# Bundle Discovery
# ---------------------------------------------------------------------------

@action
def list_bundles() -> list[dict]:
    """Return all bundles (subdirectories) in the wiki root with their concept counts."""
    _ensure_wiki_root()
    result = []
    if not WIKI_ROOT.is_dir():
        return result
    
    for d in sorted(WIKI_ROOT.iterdir()):
        if not d.is_dir():
            continue
        
        md_files = _find_all_md(d)
        index_md = d / "index.md"
        has_index = index_md.exists()
        
        created_time = datetime.fromtimestamp(d.stat().st_ctime, tz=timezone.utc).isoformat()
        
        result.append({
            "id": d.name,
            "name": d.name,
            "concept_count": len(md_files),
            "has_index": has_index,
            "created": created_time,
        })
    
    return result


# ---------------------------------------------------------------------------
# Concept CRUD
# ---------------------------------------------------------------------------

@action
def get_concept(bundle: str, path: str) -> dict:
    """Get a concept file's content and frontmatter."""
    bundle_dir = _bundle_path(bundle)
    filepath = bundle_dir / path
    if not filepath.exists():
        return {"error": "Concept not found."}
    
    text = filepath.read_text(encoding="utf-8")
    fm, body = _read_frontmatter(text)
    
    return {
        "path": path,
        "frontmatter": _sanitize(fm),
        "body": body,
        "raw": text,
    }


@action
def save_concept(bundle: str, path: str, frontmatter: dict, body: str, raw: str | None = None) -> dict:
    """Save a concept. If raw is provided, use it directly; otherwise rebuild from fm+body."""
    bundle_dir = _bundle_path(bundle)
    filepath = bundle_dir / path
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    if raw is not None:
        filepath.write_text(raw, encoding="utf-8")
    else:
        filepath.write_text(_write_frontmatter(frontmatter, body), encoding="utf-8")
    
    parent_path = Path(path).parent
    if parent_path == Path("."):
        _rebuild_index(bundle, "")
    else:
        _rebuild_index(bundle, str(parent_path))
    
    return {"saved": True}


@action
def delete_concept(bundle: str, path: str) -> dict:
    """Delete a concept file."""
    bundle_dir = _bundle_path(bundle)
    filepath = bundle_dir / path
    
    if not filepath.exists():
        return {"error": "Concept not found."}
    
    filepath.unlink()
    
    parent_rel = str(Path(path).parent)
    if parent_rel != ".":
        _rebuild_index(bundle, parent_rel)
    
    return {"deleted": True}


@action
def create_concept(bundle: str, path: str, frontmatter: dict | None = None, body: str = "", template: str | None = None) -> dict:
    """Create a new concept file, optionally applying a folder template."""
    bundle_dir = _bundle_path(bundle)
    filepath = bundle_dir / path
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    if template:
        tpl = _load_template(bundle, str(Path(path).parent))
        if tpl:
            frontmatter = {**tpl, **(frontmatter or {})}
    
    fm = frontmatter or {}
    if "type" not in fm:
        fm["type"] = "Concept"
    if "title" not in fm:
        fm["title"] = Path(path).stem.replace("-", " ").replace("_", " ").title()
    if "description" not in fm:
        fm["description"] = ""
    if "tags" not in fm:
        fm["tags"] = []
    
    text = _write_frontmatter(fm, body)
    filepath.write_text(text, encoding="utf-8")
    
    parent_path = Path(path).parent
    if parent_path == Path("."):
        _rebuild_index(bundle, "")
    else:
        _rebuild_index(bundle, str(parent_path))
    
    return {"saved": True}


# ---------------------------------------------------------------------------
# File Explorer
# ---------------------------------------------------------------------------

@action
def list_directory(bundle: str, path: str = "") -> dict:
    """List contents of a directory within a bundle (files + subdirectories)."""
    bundle_dir = _bundle_path(bundle)
    dirpath = bundle_dir / path
    
    if not dirpath.is_dir():
        return {"error": "Directory not found."}
    
    dirs = []
    files = []
    
    for entry in sorted(dirpath.iterdir()):
        if entry.is_dir():
            dirs.append(entry.name)
        elif entry.suffix == ".md":
            files.append(entry.name)
    
    file_previews = []
    for fname in files:
        fpath = dirpath / fname
        text = fpath.read_text(encoding="utf-8")
        fm, body = _read_frontmatter(text)
        file_previews.append({
            "name": fname,
            "type": fm.get("type", ""),
            "title": fm.get("title", ""),
            "description": fm.get("description", ""),
            "tags": fm.get("tags", []),
            "trust_tier": _trust_tier(fm),
        })
    
    return {
        "path": path,
        "directories": dirs,
        "files": file_previews,
    }


# ---------------------------------------------------------------------------
# Backlinks
# ---------------------------------------------------------------------------

@action
def find_backlinks(bundle: str, target_path: str) -> list[dict]:
    """Find all concepts that link to the given target path."""
    bundle_dir = _bundle_path(bundle)
    all_md = _find_all_md(bundle_dir)
    backlinks = []
    target_url = "/{}".format(target_path)
    
    for info in all_md:
        fpath = bundle_dir / info["path"]
        if fpath.name == target_path or info["path"] == target_path:
            continue
        
        text = fpath.read_text(encoding="utf-8")
        escaped_url = re.escape(target_url)
        pattern = rf'\[([^\]]+)\]\({escaped_url}\)'
        matches = re.findall(pattern, text)
        
        if matches:
            for m in matches:
                escaped_anchor = re.escape(m)
                snippet_pattern = rf'.{{0,60}}\[ {escaped_anchor} \]\({escaped_url}\).{{0,60}}'
                line_match = re.search(snippet_pattern, text)
                snippet = line_match.group(0).strip() if line_match else ""
                backlinks.append({
                    "source": info["path"],
                    "anchor": m,
                    "snippet": snippet[:120],
                })
    
    return backlinks


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

@action
def search_concepts(bundle: str, query: str, scope: str = "all") -> list[dict]:
    """Search across concepts in a bundle."""
    bundle_dir = _bundle_path(bundle)
    all_md = _find_all_md(bundle_dir)
    results = []
    q_lower = query.lower()
    
    for info in all_md:
        fpath = bundle_dir / info["path"]
        text = fpath.read_text(encoding="utf-8")
        fm, body = _read_frontmatter(text)
        
        score = 0
        title = fm.get("title", "").lower()
        tags = [t.lower() for t in fm.get("tags", [])]
        
        if scope in ("all", "title") and q_lower in title:
            score += 10
        if scope in ("all", "body") and q_lower in body.lower():
            score += 5
        if scope in ("all", "tags") and any(q_lower in t for t in tags):
            score += 8
        
        if score > 0:
            results.append({
                "path": info["path"],
                "title": fm.get("title", ""),
                "type": fm.get("type", ""),
                "score": score,
                "description": fm.get("description", ""),
            })
    
    results.sort(key=lambda x: -x["score"])
    return results


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------

@action
def collect_tags(bundle: str) -> list[dict]:
    """Collect all unique tags across a bundle."""
    bundle_dir = _bundle_path(bundle)
    all_md = _find_all_md(bundle_dir)
    tag_counts: dict[str, int] = {}
    
    for info in all_md:
        fpath = bundle_dir / info["path"]
        text = fpath.read_text(encoding="utf-8")
        fm, _ = _read_frontmatter(text)
        for tag in fm.get("tags", []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    
    return [{"tag": k, "count": v} for k, v in sorted(tag_counts.items(), key=lambda x: -x[1])]


# ---------------------------------------------------------------------------
# Graph Data
# ---------------------------------------------------------------------------

@action
def get_graph_data(bundle: str) -> dict:
    """Build graph data: nodes (concepts) and edges (links between them)."""
    bundle_dir = _bundle_path(bundle)
    all_md = _find_all_md(bundle_dir)
    nodes = []
    edges = []
    node_map: dict[str, int] = {}
    
    for i, info in enumerate(all_md):
        fpath = bundle_dir / info["path"]
        text = fpath.read_text(encoding="utf-8")
        fm, body = _read_frontmatter(text)
        node_id = info["path"]
        node_map[node_id] = i
        nodes.append({
            "id": node_id,
            "label": fm.get("title", Path(node_id).stem),
            "type": fm.get("type", ""),
            "tags": fm.get("tags", []),
            "trust_tier": _trust_tier(fm),
        })
    
    link_pattern = r"\[([^\]]+)\]\(([^)]+)\)"
    for info in all_md:
        fpath = bundle_dir / info["path"]
        text = fpath.read_text(encoding="utf-8")
        for title, url in re.findall(link_pattern, text):
            clean_url = url.lstrip("/")
            if clean_url in node_map:
                edges.append({
                    "source": info["path"],
                    "target": clean_url,
                    "label": title,
                })
    
    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@action
def validate_concept(bundle: str, path: str) -> dict:
    """Validate a concept against OKF spec rules. Advisory only."""
    bundle_dir = _bundle_path(bundle)
    filepath = bundle_dir / path
    issues = []
    
    if not filepath.exists():
        return {"valid": False, "issues": ["File not found."]}
    
    text = filepath.read_text(encoding="utf-8")
    fm, body = _read_frontmatter(text)
    
    basename = filepath.name
    if basename.lower() == "index.md" and fm.get("type") != "Directory":
        issues.append({
            "level": "warning",
            "message": "Reserved filename 'index.md' should have type: Directory",
            "field": "type",
        })
    if basename.lower() == "log.md" and fm.get("type") != "Log":
        issues.append({
            "level": "warning",
            "message": "Reserved filename 'log.md' should have type: Log",
            "field": "type",
        })
    
    if "type" not in fm or not fm.get("type"):
        issues.append({
            "level": "error",
            "message": "Missing required field: type",
            "field": "type",
        })
    
    if "title" not in fm:
        issues.append({
            "level": "warning",
            "message": "Recommended field missing: title",
            "field": "title",
        })
    
    if "description" not in fm:
        issues.append({
            "level": "info",
            "message": "Optional but recommended: description",
            "field": "description",
        })
    
    wiki_link_pattern = r"\[\[[^\]]+\]\]"
    if re.search(wiki_link_pattern, body):
        issues.append({
            "level": "warning",
            "message": "Found wikilinks [[...]]. OKF uses standard markdown links [title](/path.md)",
            "field": "body",
        })
    
    return {
        "valid": len([i for i in issues if i["level"] == "error"]) == 0,
        "issues": issues,
    }


@action
def validate_bundle(bundle: str) -> dict:
    """Validate all concepts in a bundle."""
    bundle_dir = _bundle_path(bundle)
    all_md = _find_all_md(bundle_dir)
    total = len(all_md)
    errors = 0
    warnings = 0
    details = []
    
    for info in all_md:
        result = validate_concept(bundle, info["path"])
        for issue in result.get("issues", []):
            if issue["level"] == "error":
                errors += 1
            elif issue["level"] == "warning":
                warnings += 1
            details.append({
                "path": info["path"],
                "issue": issue["message"],
                "level": issue["level"],
            })
    
    return {
        "total": total,
        "errors": errors,
        "warnings": warnings,
        "details": details,
    }


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@action
def list_templates(bundle: str, path: str = "") -> list[dict]:
    """List available templates for a directory, including cascaded ones."""
    bundle_dir = _bundle_path(bundle)
    templates = []
    
    parts = Path(path).parts if path else ()
    for i in range(len(parts), -1, -1):
        p = "/".join(parts[:i]) if i > 0 else ""
        tpl_path = bundle_dir / p / "_template.md"
        if tpl_path.exists():
            text = tpl_path.read_text(encoding="utf-8")
            fm, _ = _read_frontmatter(text)
            if fm:
                templates.append({
                    "path": str(tpl_path.relative_to(bundle_dir)),
                    "frontmatter": _sanitize(fm),
                })
    
    return templates


def _load_template(bundle: str, dir_path: str) -> dict:
    """Load the nearest _template.md frontmatter for a directory."""
    bundle_dir = _bundle_path(bundle)
    parts = Path(dir_path).parts if dir_path else ()
    for i in range(len(parts), -1, -1):
        p = "/".join(parts[:i]) if i > 0 else ""
        tpl_path = bundle_dir / p / "_template.md"
        if tpl_path.exists():
            text = tpl_path.read_text(encoding="utf-8")
            fm, _ = _read_frontmatter(text)
            if fm:
                return fm
    return {}


# ---------------------------------------------------------------------------
# Index.md Rebuilder
# ---------------------------------------------------------------------------

def _rebuild_index(bundle: str, dir_relative: str):
    """Rebuild index.md for a directory based on its concept files."""
    bundle_dir = _bundle_path(bundle)
    target_dir = bundle_dir / dir_relative
    index_path = target_dir / "index.md"
    
    if not target_dir.is_dir():
        return
    
    md_files = _list_md_files(target_dir)
    lines = ["---", "type: Directory", "auto-generated: true", "---", ""]
    
    for fname in md_files:
        if fname.lower() == "index.md":
            continue
        fpath = target_dir / fname
        text = fpath.read_text(encoding="utf-8")
        fm, _ = _read_frontmatter(text)
        title = fm.get("title", Path(fname).stem)
        desc = fm.get("description", "")
        type_val = fm.get("type", "")
        lines.append("- [{}]({})".format(title, fname))
        if desc:
            lines.append("  > {}".format(desc))
        if type_val:
            lines.append("  `type: {}`".format(type_val))
    
    index_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Import / Export
# ---------------------------------------------------------------------------

@action
def export_bundle(bundle: str) -> dict:
    """Export a bundle as a JSON snapshot."""
    bundle_dir = _bundle_path(bundle)
    if not bundle_dir.exists():
        return {"error": "Bundle not found."}
    
    all_md = _find_all_md(bundle_dir)
    concepts = []
    for info in all_md:
        fpath = bundle_dir / info["path"]
        text = fpath.read_text(encoding="utf-8")
        fm, body = _read_frontmatter(text)
        concepts.append({
            "path": info["path"],
            "frontmatter": _sanitize(fm),
            "body": body,
        })
    
    return {
        "bundle": bundle,
        "concept_count": len(concepts),
        "concepts": concepts,
    }


@action
def import_bundle(data: dict) -> dict:
    """Import a bundle from JSON snapshot data."""
    bundle_name = data.get("bundle", "imported-bundle")
    concepts = data.get("concepts", [])
    
    bundle_dir = _bundle_path(bundle_name)
    bundle_dir.mkdir(parents=True, exist_ok=True)
    
    imported = 0
    for c in concepts:
        fpath = bundle_dir / c["path"]
        fpath.parent.mkdir(parents=True, exist_ok=True)
        text = _write_frontmatter(c.get("frontmatter", {}), c.get("body", ""))
        fpath.write_text(text, encoding="utf-8")
        imported += 1
    
    return {"imported": imported, "bundle": bundle_name}
