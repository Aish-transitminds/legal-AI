from dataclasses import dataclass

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


INSUFFICIENT_LEGAL_EVIDENCE = "INSUFFICIENT_LEGAL_EVIDENCE"


@dataclass(frozen=True)
class SourceRecord:
    source_id: str
    title: str
    citation: str
    text: str
    source_url: str
    authority_level: str


@dataclass(frozen=True)
class RetrievalResult:
    status: str
    sources: tuple[SourceRecord, ...]


_AUTHORITY_RANK = {
    "official_legislation": 0,
    "official_rule": 1,
    "official_judgment": 2,
    "verified_secondary": 3,
    "research": 4,
}


class HybridRetriever:
    """Local retrieval contract with TF-IDF fallback and authority-aware ranking."""

    def __init__(self, sources: list[SourceRecord]) -> None:
        self.sources = sources
        self.vectorizer = TfidfVectorizer(stop_words="english")
        self.matrix = self.vectorizer.fit_transform([source.text for source in sources])

    def search(self, query: str, limit: int = 5) -> RetrievalResult:
        if not query.strip() or not self.sources:
            return RetrievalResult(INSUFFICIENT_LEGAL_EVIDENCE, ())

        scored = self.search_with_scores(query, limit)
        matches = tuple(source for score, source in scored if score > 0)[:limit]
        if not matches:
            return RetrievalResult(INSUFFICIENT_LEGAL_EVIDENCE, ())
        return RetrievalResult("RETRIEVED", matches)

    def search_with_scores(self, query: str, limit: int = 5) -> list[tuple[float, SourceRecord]]:
        """Return ranked (score, SourceRecord) tuples for debugging and inspection.

        Scores are TF-IDF cosine similarities; results are authority-aware sorted.
        """
        if not query.strip() or not self.sources:
            return []

        query_vector = self.vectorizer.transform([query])
        scores = cosine_similarity(query_vector, self.matrix)[0]
        ranked = sorted(
            zip(scores, self.sources),
            key=lambda item: (-item[0], _AUTHORITY_RANK.get(item[1].authority_level, 99)),
        )
        return [(float(score), source) for score, source in ranked][:limit]
