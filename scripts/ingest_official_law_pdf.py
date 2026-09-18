#!/usr/bin/env python3
"""Extract and ingest a manually verified official law PDF."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.db import SessionLocal, create_tables  # noqa: E402
from app.legal_sources.official_loader import load_verified_source  # noqa: E402
from app.models import LegalSource  # noqa: E402


def extract_text(pdf_path: Path) -> str:
    with fitz.open(pdf_path) as document:
        return "\n\n".join(page.get_text() for page in document).strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest a verified official law PDF")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--title", required=True)
    parser.add_argument("--citation", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--record", type=Path, help="Optional JSON provenance record path")
    args = parser.parse_args(argv)

    text = extract_text(args.pdf)
    record_path = args.record or args.pdf.with_suffix(".json")
    record = {
        "title": args.title,
        "citation": args.citation,
        "text": text,
        "source_url": args.url,
        "content_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "verified": True,
    }
    record_path.write_text(json.dumps(record, ensure_ascii=True, indent=2), encoding="utf-8")
    verified = load_verified_source(record_path)

    create_tables()
    with SessionLocal.begin() as session:
        existing = session.query(LegalSource).filter_by(content_sha256=verified["content_sha256"]).one_or_none()
        if existing is None:
            session.add(
                LegalSource(
                    title=verified["title"],
                    citation=verified["citation"],
                    text=verified["text"],
                    source_url=verified["source_url"],
                    content_sha256=verified["content_sha256"],
                )
            )
            action = "inserted"
        else:
            action = "already present"

    print(f"{action}: {verified['title']} ({len(verified['text'])} characters)")
    print(f"record: {record_path}")
    print(f"text SHA256: {verified['content_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
