from sqlalchemy import create_engine, inspect

from app.db import Base
from app import models  # noqa: F401


def test_schema_has_mvp_tables() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    assert set(inspect(engine).get_table_names()) == {
        "documents",
        "clauses",
        "legal_sources",
        "legal_findings",
    }
