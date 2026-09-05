import sqlite3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from .config import settings

if "sqlite" in settings.postgres_dsn:
    engine = create_engine(settings.postgres_dsn, pool_size=5, max_overflow=10, echo=False)
else:
    engine = create_engine(settings.postgres_dsn, pool_size=5, max_overflow=10, echo=False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """Dependency to get a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()