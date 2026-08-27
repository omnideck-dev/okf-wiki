"""OKF Source Scanner — walk a source tree and detect changed files."""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class FileInfo:
    """Metadata about a source file."""

    path: Path
    rel_path: str  # relative to source root
    mtime: float
    size: int
    suffix: str
    is_binary: bool = False


CLASSIFICATION = {
    ".md": "markdown",
    ".markdown": "markdown",
    ".rst": "rst",
    ".txt": "text",
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".go": "go",
    ".c": "c",
    ".h": "c-header",
    ".java": "java",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".toml": "toml",
    ".cfg": "config",
    ".conf": "config",
    ".ini": "config",
    ".html": "html",
    ".css": "css",
    ".sh": "shell",
    ".bash": "shell",
    ".sql": "sql",
    ".xml": "xml",
    ".svg": "svg",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".gif": "image",
    ".webp": "image",
    ".pdf": "pdf",
}

TEXT_SUFFIXES = frozenset(
    s for s, cat in CLASSIFICATION.items() if cat != "image" and cat != "pdf"
)
BINARY_SUFFIXES = frozenset(
    s for s, cat in CLASSIFICATION.items() if cat in ("image", "pdf")
)

EXCLUDE_DIRS = frozenset({
    ".git",
    "__pycache__",
    "node_modules",
    ".venv",
    "venv",
    ".tox",
    ".egg-info",
    ".mypy_cache",
    ".pytest_cache",
    ".DS_Store",
    "dist",
    "build",
    ".idea",
    ".vscode",
})


def classify_file(path: Path) -> str:
    """Return a human-readable category for a file."""
    return CLASSIFICATION.get(path.suffix.lower(), "unknown")


def is_binary_file(path: Path) -> bool:
    """Quick binary detection by reading first 8KB."""
    try:
        with open(path, "rb") as f:
            chunk = f.read(8192)
        return b"\0" in chunk
    except OSError:
        return True


@dataclass
class SourceTree:
    """A source directory or repository to scan for wiki-importable files."""

    root: Path
    name: str  # project name, used for wiki dir name
    is_git_repo: bool = False
    files: list[FileInfo] = field(default_factory=list)

    @classmethod
    def from_path(cls, path: str | Path, name: Optional[str] = None) -> "SourceTree":
        root = Path(path).resolve()
        project_name = name or root.name
        is_git = (root / ".git").is_dir()
        return cls(root=root, name=project_name, is_git_repo=is_git)

    def walk(self, include_extras: tuple[str, ...] = ()) -> None:
        """Walk the source tree and collect importable files."""
        self.files = []
        allowed = TEXT_SUFFIXES | frozenset(include_extras)
        for entry in sorted(self.root.rglob("*")):
            # Skip excluded dirs
            if entry.is_dir():
                continue
            rel = entry.relative_to(self.root)
            if any(p.name in EXCLUDE_DIRS for p in rel.parents) or rel.parent.name in EXCLUDE_DIRS:
                continue
            if rel.name in EXCLUDE_DIRS:
                continue
            if entry.suffix.lower() not in allowed:
                continue
            if is_binary_file(entry):
                continue
            self.files.append(
                FileInfo(
                    path=entry,
                    rel_path=str(rel),
                    mtime=os.path.getmtime(entry),
                    size=entry.stat().st_size,
                    suffix=entry.suffix.lower(),
                )
            )

    def find_last_commit(self) -> Optional[str]:
        """Get the last commit hash for git-based change detection."""
        if not self.is_git_repo:
            return None
        try:
            result = subprocess.run(
                ["git", "log", "-1", "--format=%H"],
                cwd=self.root,
                capture_output=True,
                text=True,
                timeout=30,
            )
            return result.stdout.strip() or None
        except (subprocess.SubprocessError, FileNotFoundError):
            return None

    def git_changed_files(self, since: Optional[str] = None) -> list[str]:
        """Return paths of files changed since a commit.

        If since is None, returns all tracked files.
        """
        if not self.is_git_repo:
            return []
        try:
            if since:
                cmd = ["git", "diff", "--name-only", f"{since}..HEAD"]
            else:
                cmd = ["git", "ls-files"]
            result = subprocess.run(
                cmd, cwd=self.root, capture_output=True, text=True, timeout=30
            )
            return [l.strip() for l in result.stdout.splitlines() if l.strip()]
        except (subprocess.SubprocessError, FileNotFoundError):
            return []


def scan_changed_files(
    source: SourceTree,
    manifest: dict[str, dict],
    method: str = "auto",
    last_commit: Optional[str] = None,
) -> tuple[list[FileInfo], list[str]]:
    """Return (changed_files, deleted_rel_paths) since last run.

    Args:
        source: The source tree to scan.
        manifest: The .okf_manifest data dict.
        method: 'mtime', 'git', or 'auto' (default: auto).
        last_commit: Required for git mode. Previous commit hash.

    Returns:
        (files_to_process, deleted_rel_paths)
    """
    if method == "git" or (method == "auto" and source.is_git_repo and last_commit):
        return _scan_git(source, last_commit, manifest)
    return _scan_mtime(source, manifest)


def _scan_mtime(
    source: SourceTree, manifest: dict[str, dict]
) -> tuple[list[FileInfo], list[str]]:
    """Check every file against manifest mtimes."""
    source.walk()
    changed: list[FileInfo] = []
    tracked_keys = set(manifest.keys())

    for fi in source.files:
        key = str(fi.path.resolve())
        prev = manifest.get(key)
        if prev is None or abs(prev.get("mtime", 0) - fi.mtime) > 0.001:
            changed.append(fi)
        tracked_keys.discard(key)

    # Anything still in tracked_keys was deleted
    deleted = [k for k in tracked_keys if not Path(k).exists()]
    return changed, deleted


def _scan_git(
    source: SourceTree,
    last_commit: Optional[str],
    manifest: dict[str, dict],
) -> tuple[list[FileInfo], list[str]]:
    """Use git to find changed files."""
    changed_git = source.git_changed_files(since=last_commit)
    changed: list[FileInfo] = []
    deleted: list[str] = []

    for rel in changed_git:
        full = source.root / rel
        if full.exists():
            if full.suffix.lower() in TEXT_SUFFIXES:
                changed.append(
                    FileInfo(
                        path=full,
                        rel_path=rel,
                        mtime=os.path.getmtime(full),
                        size=full.stat().st_size,
                        suffix=full.suffix.lower(),
                    )
                )
        else:
            deleted.append(str(full.resolve()))

    return changed, deleted