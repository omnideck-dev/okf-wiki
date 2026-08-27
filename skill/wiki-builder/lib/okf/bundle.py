"""OKF Bundle — directory structure, manifest, and path helpers."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Reserved filenames that cannot be concept documents
RESERVED_FILENAMES: frozenset[str] = frozenset({"index.md", "log.md"})

OKF_VERSION = "0.2"

# Default path for the change-tracking manifest inside the bundle
MANIFEST_NAME = ".okf_manifest.json"


@dataclass
class Manifest:
    """Tracks which source files were imported and when.

    Maps source_file_path → { mtime, concept_path, sha256_prefix }.
    Used by okf-scan to skip unchanged files.
    """

    data: dict[str, dict] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> "Manifest":
        if path.exists():
            raw = json.loads(path.read_text(encoding="utf-8"))
            return cls(data=raw.get("files", {}))
        return cls()

    def save(self, path: Path) -> None:
        path.write_text(
            json.dumps(
                {"okf_version": OKF_VERSION, "files": self.data},
                indent=2,
                default=str,
            ),
            encoding="utf-8",
        )

    def is_changed(self, source_path: Path) -> bool:
        """True if the file is new or its mtime has changed."""
        try:
            current_mtime = os.path.getmtime(source_path)
        except FileNotFoundError:
            return True  # file deleted
        key = str(source_path.resolve())
        prev = self.data.get(key)
        if prev is None:
            return True
        return abs(prev.get("mtime", 0) - current_mtime) > 0.001

    def record(self, source_path: Path, concept_path: Path) -> None:
        key = str(source_path.resolve())
        self.data[key] = {
            "mtime": os.path.getmtime(source_path),
            "concept_path": str(concept_path),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    def remove(self, source_path: Path) -> None:
        key = str(source_path.resolve())
        self.data.pop(key, None)

    def get_all_concepts(self) -> list[Path]:
        seen: set[str] = set()
        result: list[Path] = []
        for entry in self.data.values():
            cp = entry.get("concept_path")
            if cp and cp not in seen:
                seen.add(cp)
                result.append(Path(cp))
        return result


@dataclass
class Bundle:
    """An OKF knowledge bundle on disk."""

    root: Path
    manifest: Manifest = field(default_factory=Manifest)

    @classmethod
    def open_or_create(cls, root: str | Path) -> "Bundle":
        root = Path(root).resolve()
        root.mkdir(parents=True, exist_ok=True)
        manifest_path = root / MANIFEST_NAME
        manifest = Manifest.load(manifest_path)
        return cls(root=root, manifest=manifest)

    def save_manifest(self) -> None:
        self.manifest.save(self.root / MANIFEST_NAME)

    def concept_path(self, *parts: str) -> Path:
        """Return the filesystem path for a concept within the bundle."""
        return self.root.joinpath(*parts).with_suffix(".md")

    def ensure_dir(self, *parts: str) -> Path:
        """Ensure a subdirectory exists in the bundle and return it."""
        d = self.root.joinpath(*parts)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def index_path(self, *parts: str) -> Path:
        return self.root.joinpath(*parts) / "index.md"

    def log_path(self, *parts: str) -> Path:
        return self.root.joinpath(*parts) / "log.md"

    def is_concept_file(self, path: Path) -> bool:
        """Check if a file within the bundle is a concept document."""
        try:
            rel = path.relative_to(self.root)
        except ValueError:
            return False
        if path.name in RESERVED_FILENAMES:
            return False
        return path.suffix == ".md"

    def find_concepts(self, subdir: str = "") -> list[Path]:
        """Return all concept files under a subdirectory (or whole bundle)."""
        base = self.root / subdir if subdir else self.root
        if not base.exists():
            return []
        result: list[Path] = []
        for f in sorted(base.rglob("*.md")):
            if self.is_concept_file(f):
                result.append(f)
        return result


def open_bundle(root: str | Path) -> Bundle:
    """Convenience: open or create a bundle."""
    return Bundle.open_or_create(root)