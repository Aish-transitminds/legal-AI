import hashlib
import json
from pathlib import Path


class OfficialSourceError(ValueError):
    pass


def load_verified_source(path: Path) -> dict[str, object]:
    """Load an explicitly verified source record; reject unverified legal text."""
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise OfficialSourceError("Official source record could not be read.") from error

    required = {"title", "citation", "text", "source_url", "content_sha256", "verified"}
    if not required.issubset(record):
        raise OfficialSourceError("Official source record is missing provenance fields.")
    if record["verified"] is not True:
        raise OfficialSourceError("Only manually verified official sources may be ingested.")

    actual_hash = hashlib.sha256(record["text"].encode("utf-8")).hexdigest()
    if actual_hash != record["content_sha256"]:
        raise OfficialSourceError("Official source checksum does not match its text.")

    return record
