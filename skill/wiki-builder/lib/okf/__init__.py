"""OKF Wiki Builder — shared library.

Open Knowledge Format (OKF) v0.2 tools for generating, updating,
and maintaining knowledge bundles from source datasets.
"""

from .bundle import Bundle, Manifest, open_bundle
from .source import scan_changed_files, classify_file, FileInfo, SourceTree
from .importer import import_file
from .indexer import generate_index, generate_log_entry
from .validator import validate_bundle
from .registry import Registry, BundleInfo, slugify, scan_wiki_dir, refresh_registry

__all__ = [
    "Bundle",
    "Manifest",
    "open_bundle",
    "scan_changed_files",
    "classify_file",
    "FileInfo",
    "SourceTree",
    "import_file",
    "generate_index",
    "generate_log_entry",
    "validate_bundle",
    "Registry",
    "BundleInfo",
    "slugify",
    "scan_wiki_dir",
    "refresh_registry",
]