from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    func,
    CheckConstraint,
    Index,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship
from .config import settings


Base = declarative_base()


class Show(Base):
    __tablename__ = "shows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    section = Column(String, nullable=False, default="General")
    status = Column(String, nullable=False, default="draft")  # draft | published
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # One-to-many: Show -> Seasons
    # back_populates="show" means Season.show will reference this
    seasons = relationship("Season", back_populates="show", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_shows_section_status", "section", "status"),
    )


class Season(Base):
    __tablename__ = "seasons"

    id = Column(Integer, primary_key=True, index=True)
    show_id = Column(Integer, ForeignKey("shows.id"), nullable=False, index=True)
    number = Column(Integer, nullable=False)
    title = Column(String, nullable=True)
    is_trailer = Column(Boolean, default=False, nullable=False)  # Season 0 = trailers
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Many-to-one: Season -> Show
    # back_populates="seasons" means Show.seasons will reference this
    show = relationship("Show", back_populates="seasons")

    # One-to-many: Season -> Episodes
    # back_populates="season" means Episode.season will reference this
    episodes = relationship("Episode", back_populates="season")

    __table_args__ = (
        Index("ix_seasons_show_number", "show_id", "number"),
        CheckConstraint("number > 0", name="ck_seasons_number_positive"),
    )


class Episode(Base):
    __tablename__ = "episodes"

    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=True, index=True)
    show_id = Column(Integer, ForeignKey("shows.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    duration = Column(Integer, nullable=False)  # seconds
    language = Column(String, nullable=False, default="en")
    content_group = Column(String, nullable=True)  # groups language variants
    is_trailer = Column(Boolean, default=False, nullable=False)
    season_number = Column(Integer, nullable=True)  # denormalized for sorting
    episode_number = Column(Integer, nullable=True)  # denormalized for sorting

    # Many-to-one: Episode -> Season
    # back_populates="season" means Season.episodes will reference this
    season = relationship("Season", back_populates="episodes")

    # Many-to-one: Episode -> Show (unidirectional convenience for search
    # and validation report). No back_populates to avoid naming conflicts.
    show = relationship("Show")

    __table_args__ = (
        CheckConstraint("duration > 0", name="ck_episodes_duration_positive"),
    )


class Artwork(Base):
    __tablename__ = "artwork"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"), nullable=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=True, index=True)
    show_id = Column(Integer, ForeignKey("shows.id"), nullable=False, index=True)
    kind: str = Column(String, nullable=False)  # poster, banner, thumbnail
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    size_bytes = Column(Integer, nullable=False, default=0)
    path = Column(String, nullable=False)  # storage path
    mime_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Ensure only one kind per episode-season combination
    __table_args__ = (
        CheckConstraint(
            "(episode_id IS NOT NULL AND season_id IS NULL) OR (episode_id IS NULL AND season_id IS NOT NULL)",
            name="ck_artwork_episode_or_season",
        ),
    )


class PublishRun(Base):
    __tablename__ = "publish_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_by = Column(String, nullable=False)  # email or username
    run_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, nullable=False, default="running")  # running | completed | failed
    total_shows = Column(Integer, nullable=False, default=0)
    total_episodes = Column(Integer, nullable=False, default=0)
    total_artwork = Column(Integer, nullable=False, default=0)
    catalogue_path = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True, server_default=func.now())

    __table_args__ = (
        Index("ix_publish_runs_run_at", "run_at"),
    )