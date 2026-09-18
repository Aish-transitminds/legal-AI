import hashlib
import json

import pytest

from app.legal_sources.official_loader import OfficialSourceError, load_verified_source


def test_rejects_unverified_official_source(tmp_path) -> None:
    path = tmp_path / "source.json"
    path.write_text(
        json.dumps(
            {
                "title": "Indian Contract Act, 1872",
                "citation": "Section 10",
                "text": "unverified text",
                "source_url": "https://indiacode.gov.in/",
                "content_sha256": hashlib.sha256(b"unverified text").hexdigest(),
                "verified": False,
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(OfficialSourceError, match="verified official"):
        load_verified_source(path)


def test_accepts_verified_source_with_matching_checksum(tmp_path) -> None:
    text = "Manually verified source text."
    path = tmp_path / "source.json"
    path.write_text(
        json.dumps(
            {
                "title": "Indian Contract Act, 1872",
                "citation": "Section 10",
                "text": text,
                "source_url": "https://indiacode.gov.in/",
                "content_sha256": hashlib.sha256(text.encode()).hexdigest(),
                "verified": True,
            }
        ),
        encoding="utf-8",
    )

    assert load_verified_source(path)["citation"] == "Section 10"
