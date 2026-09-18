#!/usr/bin/env python3
"""Register an official law PDF in DATA_SOURCES.md by computing its SHA-256.

Usage:
  python scripts/register_official_law.py path/to/indian_contract_act_1872.pdf \
    --url "https://indiacode.gov.in/..." --title "The Indian Contract Act, 1872"

This appends a small entry to DATA_SOURCES.md with checksum and metadata.
"""
from __future__ import annotations
import argparse
import hashlib
import datetime
import os
import sys


def sha256_of_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def append_data_source(md_path: str, title: str, url: str, file_path: str, checksum: str, date: str) -> None:
    entry_lines = [
        f"- **Title**: {title}",
        f"  - **URL**: {url}",
        f"  - **Local file**: {file_path}",
        f"  - **SHA256**: {checksum}",
        f"  - **Recorded**: {date}",
        "",
    ]
    content = "\n".join(entry_lines)
    header = "# DATA SOURCES\n\nEntries below are added by scripts/register_official_law.py\n\n"

    if os.path.exists(md_path):
        with open(md_path, "a", encoding="utf-8") as f:
            f.write(content)
    else:
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(header)
            f.write(content)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Register official law PDF in DATA_SOURCES.md")
    parser.add_argument("file", help="Path to the PDF file to register")
    parser.add_argument("--url", required=True, help="Source URL where the PDF was downloaded from")
    parser.add_argument("--title", default=None, help="Short title for the law (optional)")
    parser.add_argument("--md", default="DATA_SOURCES.md", help="Path to DATA_SOURCES.md to update")

    args = parser.parse_args(argv)
    file_path = os.path.abspath(args.file)

    if not os.path.exists(file_path):
        print(f"Error: file not found: {file_path}", file=sys.stderr)
        return 2

    checksum = sha256_of_file(file_path)
    title = args.title or os.path.basename(file_path)
    date = datetime.date.today().isoformat()

    append_data_source(args.md, title, args.url, file_path, checksum, date)

    print("Registered law entry:")
    print(f"  Title: {title}")
    print(f"  File: {file_path}")
    print(f"  SHA256: {checksum}")
    print(f"  DATA_SOURCES.md: {os.path.abspath(args.md)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
