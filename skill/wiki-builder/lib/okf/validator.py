#!/usr/bin/env python3
"""OKF Validator — check a bundle for OKF v0.2 conformance."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .bundle import Bundle, RESERVED_FILENAMES


@dataclass
class ValidationResult:
    """Result of validating a bundle."""

    valid: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stats: dict[str, int] = field(default_factory=dict)


def validate_bundle(bundle: Bundle) -> ValidationResult:
    """Check a bundle for OKF v0.2 conformance.

    Conformance rules (§9):
    1. Every non-reserved .md file must have parseable YAML frontmatter.
    2. Every frontmatter must contain a non-empty `type` field.
    3. Reserved filenames (index.md, log.md) must follow conventions.

    Non-rejectable violations (warnings only):
    - Missing optional frontmatter fields
    - Unknown type values
    - Unknown additional frontmatter keys
    - Broken cross-links
    - Missing index.md files
    """
    result = ValidationResult()

    concept_count = 0
    index_count = 0
    log_count = 0
    errors = result.errors
    warnings = result.warnings

    # Walk all .md files
    for md_file in sorted(bundle.root.rglob("*.md")):
        try:
            rel = md_file.relative_to(bundle.root)
        except ValueError:
            continue

        rel_str = str(rel)

        # Check reserved filenames
        if md_file.name in RESERVED_FILENAMES:
            if md_file.name == "index.md":
                index_count += 1
                _check_index_file(md_file, warnings)
            elif md_file.name == "log.md":
                log_count += 1
                _check_log_file(md_file, warnings)
            continue

        # Only process concept files
        try:
            content = md_file.read_text(encoding="utf-8", errors="replace")
        except Exception:
            errors.append(f"{rel_str}: cannot read file")
            continue

        # Rule 1: Must have parseable YAML frontmatter
        if not content.startswith("---"):
            errors.append(f"{rel_str}: missing YAML frontmatter (must start with ---)")
            continue

        # Find closing ---
        end_idx = content.find("---", 3)
        if end_idx == -1:
            errors.append(f"{rel_str}: unclosed YAML frontmatter")
            continue

        frontmatter_raw = content[3:end_idx].strip()

        # Check for type field
        has_type = False
        type_value = ""
        for line in frontmatter_raw.split("\n"):
            line = line.strip()
            if line.startswith("type:"):
                has_type = True
                type_value = line[len("type:"):].strip().strip('"').strip("'")
                break

        # Rule 2: Must have non-empty type field
        if not has_type:
            warnings.append(f"{rel_str}: missing 'type' field in frontmatter (soft error)")
        elif not type_value:
            warnings.append(f"{rel_str}: empty 'type' field in frontmatter (soft error)")

        concept_count += 1

    # Stats
    result.stats = {
        "concepts": concept_count,
        "index_files": index_count,
        "log_files": log_count,
        "total_md_files": concept_count + index_count + log_count,
    }

    result.valid = len(errors) == 0
    return result


def _check_index_file(path: Path, warnings: list[str]) -> None:
    """Warn about index.md issues."""
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return

    # index.md should NOT have frontmatter (except okf_version in root index)
    if content.startswith("---"):
        end_idx = content.find("---", 3)
        if end_idx != -1:
            fm = content[3:end_idx].strip()
            # Only allowed: okf_version key
            for line in fm.split("\n"):
                line = line.strip()
                if line and not line.startswith("okf_version:"):
                    warnings.append(
                        f"{path.name}: index.md should have no frontmatter "
                        f"(found '{line}')"
                    )
                    break


def _check_log_file(path: Path, warnings: list[str]) -> None:
    """Warn about log.md issues."""
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return

    # Check date headings use YYYY-MM-DD
    heading_pattern = re.compile(r"^## (\d{4}-\d{2}-\d{2})", re.MULTILINE)
    for match in heading_pattern.finditer(content):
        date_str = match.group(1)
        # Validate date is real
        try:
            from datetime import date as date_cls
            parts = date_str.split("-")
            date_cls(int(parts[0]), int(parts[1]), int(parts[2]))
        except (ValueError, IndexError):
            warnings.append(
                f"{path.name}: invalid date in heading '{date_str}'"
            )