import json
from pathlib import Path
from collections import defaultdict
from datetime import datetime
from sqlalchemy import select


def build_catalogue(db) -> dict:
    """Build the published catalogue JSON from the database.

    Rules:
    - Only published shows/episodes appear
    - content_group variants collapse into one entry with a languages list
    - Grouped by section, deterministic ordering
    """
    from .models import Show, Season, Episode, Artwork

    # 1. Fetch only published shows
    stmt = select(Show).where(Show.status == "published")
    shows_result = db.execute(stmt)
    shows = shows_result.scalars().all()

    # 2. Pre-load all artworks for episodes of published shows
    # Get all episode IDs from published shows
    ep_ids = []
    for show in shows:
        stmt_eps = select(Episode.id).where(Episode.show_id == show.id)
        for (ep_id,) in db.execute(stmt_eps).all():
            ep_ids.append(ep_id)

    # Get all artworks for these episodes
    if ep_ids:
        artwork_stmt = select(Artwork).where(Artwork.episode_id.in_(ep_ids))
        artwork_result = db.execute(artwork_stmt)
        all_artworks = artwork_result.scalars().all()
    else:
        all_artworks = []

    artwork_by_episode: dict[int, list] = defaultdict(list)
    for aw in all_artworks:
        if aw.episode_id:
            artwork_by_episode[aw.episode_id].append(aw)

    # 3. Build catalogue sections
    catalogue_sections = []
    total_shows = 0
    total_episodes = 0
    total_artwork = 0

    for show in sorted(shows, key=lambda s: s.name):
        total_shows += 1

        section_name = show.section or "General"

        # Collect trailer episodes (Season 0 / is_trailer) separately so the
        # viewer can show them outside the normal season rows.
        trailers = []
        trailer_eps = db.execute(
            select(Episode).where(
                Episode.show_id == show.id,
                Episode.is_trailer.is_(True),
            )
        ).scalars().all()
        for ep in trailer_eps:
                ep_artworks = artwork_by_episode.get(ep.id, [])
                poster = None
                thumb = None
                for aw in ep_artworks:
                    if aw.kind == "poster":
                        poster = aw.path
                    elif aw.kind == "thumbnail":
                        thumb = aw.path
                trailers.append(
                    {
                        "episode_id": ep.id,
                        "title": ep.title,
                        "duration": ep.duration,
                        "languages": [ep.language],
                        "poster_path": poster,
                        "banner_path": None,
                        "thumbnail_path": thumb,
                    }
                )

        # Collect seasons with non-trailer episodes
        seasons_with_episodes = []
        for season in sorted(show.seasons, key=lambda s: (s.is_trailer, s.number)):
            # Only include non-trailer episodes in the catalogue UI
            episodes = [ep for ep in season.episodes if not ep.is_trailer]

            if not episodes:
                continue

            # Group episodes by content_group
            grouped = {}  # content_group -> {episode, languages}

            for ep in episodes:
                cg = ep.content_group
                lang = ep.language

                if cg and cg not in grouped:
                    grouped[cg] = {"episode": ep, "languages": {lang}}
                elif cg and cg in grouped:
                    grouped[cg]["languages"].add(lang)
                else:
                    # No content_group — standalone
                    key = f"standalone_{ep.id}"
                    grouped[key] = {"episode": ep, "languages": {lang}}

            # Build season entry with episodes
            season_episodes = []
            for cg, data in grouped.items():
                ep = data["episode"]
                languages = sorted(data["languages"])

                # Get artwork
                ep_artworks = artwork_by_episode.get(ep.id, [])
                poster_path = None
                banner_path = None
                thumbnail_path = None
                for aw in ep_artworks:
                    if aw.kind == "poster":
                        poster_path = aw.path
                    elif aw.kind == "banner":
                        banner_path = aw.path
                    elif aw.kind == "thumbnail":
                        thumbnail_path = aw.path

                season_episodes.append(
                    {
                        "episode_id": ep.id,
                        "title": ep.title,
                        "languages": languages,
                        "content_group": cg if cg else None,
                        "duration": ep.duration,
                        "poster_path": poster_path,
                        "banner_path": banner_path,
                        "thumbnail_path": thumbnail_path,
                    }
                )

            total_episodes += len(episodes)
            # Count artwork
            for ep in episodes:
                for aw in artwork_by_episode.get(ep.id, []):
                    total_artwork += 1

            seasons_with_episodes.append(
                {
                    "season_number": season.number,
                    "season_title": season.title or f"Season {season.number}",
                    "is_trailer": season.is_trailer,
                    "episodes": season_episodes,
                }
            )

        catalogue_sections.append(
            {
                "section": section_name,
                "show_title": show.name,
                "show_id": show.id,
                "seasons": seasons_with_episodes,
                "trailers": trailers,
            }
        )

    metadata = {
        "total_shows": total_shows,
        "total_episodes": total_episodes,
        "total_artwork": total_artwork,
        "generated_at": datetime.utcnow().isoformat(),
    }

    catalogue = {
        "metadata": metadata,
        "sections": catalogue_sections,
    }

    return catalogue