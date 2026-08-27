"""OKF Bundle Registry — deterministic discovery and tracking of bundles.

Stores known bundles in ~/.okf_registry.json and provides scanning,
registration, and lookup utilities.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

REGISTRY_PATH = Path.home() / ".okf_registry.json"
WIKI_DIR = Path.home() / "wiki"
OKF_VERSION = "0.2"


def slugify(name: str) -> str:
    """Convert a name into a URL-friendly slug.

    Must match the implementation in importer.py exactly.
    """
    name = re.sub(r"[^\w\s-]", "", name.lower())
    name = re.sub(r"[\s-]+", "-", name).strip("-")
    return name or "untitled"


@dataclass
class BundleInfo:
    """Information about a registered OKF bundle."""

    path: str
    project: str
    slug: str
    created: str
    last_updated: str
    concept_count: int = 0


@dataclass
class Registry:
    """Deterministic bundle registry backed by ~/.okf_registry.json."""

    okf_version: str = OKF_VERSION
    bundles: dict[str, BundleInfo] = field(default_factory=dict)

    # ------------------------------------------------------------------
    # I/O
    # ------------------------------------------------------------------

    @classmethod
    def load(cls, path: Path | None = None) -> "Registry":
        """Load the registry from disk, or return an empty registry."""
        path = path or REGISTRY_PATH
        if not path.exists():
            return cls()
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return cls()
        bundles = {}
        for slug, info in raw.get("bundles", {}).items():
            bundles[slug] = BundleInfo(**info)
        return cls(
            okf_version=raw.get("okf_version", OKF_VERSION),
            bundles=bundles,
        )

    def save(self, path: Path | None = None) -> None:
        """Write the registry to disk."""
        path = path or REGISTRY_PATH
        data = {
            "okf_version": self.okf_version,
            "bundles": {
                slug: asdict(info) for slug, info in self.bundles.items()
            },
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(data, indent=2, default=str),
            encoding="utf-8",
        )

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, path: str, project: str) -> BundleInfo:
        """Register (or update) a bundle and return its BundleInfo."""
        slug = slugify(project)
        now = datetime.now(timezone.utc).isoformat()
        bundle_path = Path(path).resolve()

        # Count concept files (non-index .md files)
        concept_count = 0
        if bundle_path.exists():
            for f in bundle_path.rglob("*.md"):
                if f.name not in ("index.md", "log.md"):
                    concept_count += 1

        if slug in self.bundles:
            existing = self.bundles[slug]
            existing.path = str(bundle_path)
            existing.project = project
            existing.last_updated = now
            existing.concept_count = concept_count
        else:
            self.bundles[slug] = BundleInfo(
                path=str(bundle_path),
                project=project,
                slug=slug,
                created=now,
                last_updated=now,
                concept_count=concept_count,
            )
        return self.bundles[slug]

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

    def find_by_name(self, name: str) -> Optional[BundleInfo]:
        """Return the bundle whose slug matches *exactly*, or None."""
        slug = slugify(name)
        return self.bundles.get(slug)

    def find_all(self, name: str) -> list[BundleInfo]:
        """Return all bundles whose slug or project name matches.

        Matching is case-insensitive and checks both slug and project
        name for substring containment.
        """
        needle = slugify(name)
        results: list[BundleInfo] = []
        for info in self.bundles.values():
            if needle == info.slug:
                # Exact slug match — highest priority
                results.insert(0, info)
            elif needle in info.slug or needle in slugify(info.project):
                results.append(info)
        return results

    def list_bundles(self) -> list[BundleInfo]:
        """Return all registered bundles, sorted by project name."""
        return sorted(self.bundles.values(), key=lambda b: b.project.lower())


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------


def scan_wiki_dir(wiki_dir: Path | None = None) -> dict[str, BundleInfo]:
    """Walk ~/wiki/ (or a custom dir) and detect OKF bundles.

    A directory is considered a bundle if it contains either:
    - A ``.okf_manifest.json`` file, or
    - An ``index.md`` with ``okf_version`` in its YAML frontmatter.

    Returns a dict mapping slug → BundleInfo.
    """
    wiki_dir = wiki_dir or WIKI_DIR
    if not wiki_dir.exists():
        return {}

    found: dict[str, BundleInfo] = {}
    now = datetime.now(timezone.utc).isoformat()

    for entry in sorted(wiki_dir.iterdir()):
        if not entry.is_dir():
            continue

        project = entry.name
        slug = slugify(project)

        # Check for .okf_manifest.json
        manifest_path = entry / ".okf_manifest.json"
        index_path = entry / "index.md"

        is_bundle = False
        if manifest_path.exists():
            is_bundle = True
        elif index_path.exists():
            # Check frontmatter for okf_version
            try:
                content = index_path.read_text(encoding="utf-8")
                if content.startswith("---"):
                    end = content.find("---", 3)
                    if end != -1:
                        frontmatter = content[3:end]
                        if "okf_version" in frontmatter:
                            is_bundle = True
            except OSError:
                pass

        if not is_bundle:
            continue

        # Count concept files
        concept_count = 0
        for f in entry.rglob("*.md"):
            if f.name not in ("index.md", "log.md"):
                concept_count += 1

        # Determine created time from manifest or index mtime
        created = now
        if manifest_path.exists():
            try:
                raw = json.loads(manifest_path.read_text(encoding="utf-8"))
                files = raw.get("files", {})
                timestamps = [
                    v.get("updated_at", "") for v in files.values()
                    if v.get("updated_at")
                ]
                if timestamps:
                    created = min(timestamps)
            except (json.JSONDecodeError, OSError):
                pass

        found[slug] = BundleInfo(
            path=str(entry.resolve()),
            project=project,
            slug=slug,
            created=created,
            last_updated=now,
            concept_count=concept_count,
        )

    return found


def refresh_registry(
    registry_path: Path | None = None,
    wiki_dir: Path | None = None,
) -> Registry:
    """Load the registry, scan for new bundles, merge, save, and return."""
    reg = Registry.load(path=registry_path)
    scanned = scan_wiki_dir(wiki_dir=wiki_dir)

    # Merge scanned bundles into registry (scanned wins on conflicts)
    merged = False
    for slug, info in scanned.items():
        if slug not in reg.bundles:
            reg.bundles[slug] = info
            merged = True
        else:
            existing = reg.bundles[slug]
            if existing.path != info.path:
                existing.path = info.path
                merged = True
            if existing.concept_count != info.concept_count:
                existing.concept_count = info.concept_count
                merged = True

    if merged:
        reg.save(path=registry_path)
    else:
        # Still save in case the file doesn't exist yet
        reg.save(path=registry_path)

    return reg