"""Seed the database with 8 shows / ~95 episodes that mirror the challenge's
seed data shape, generate placeholder artwork (validated sizes), and publish
the catalogue so the viewer has real content.

Run from the project root:  python3 -m backend.seed
"""

import io
import json
from pathlib import Path

from PIL import Image, ImageDraw

from .db import SessionLocal
from .models import Show, Season, Episode, Artwork
from .storage import get_storage
from .publish import build_catalogue

# (name, section, description, n_seasons, episodes_per_season)
SHOWS = [
    ("The Jungle Crew", "Children", "A group of animal friends explores the rainforest.", 2, 6),
    ("Tales of the Deep", "Children", "Underwater adventures beneath the waves.", 2, 6),
    ("Little Scientists", "Children", "Curious kids run fun experiments at home.", 2, 6),
    ("Space Rovers", "Adventure", "Robot explorers journey across the solar system.", 2, 6),
    ("The Lost Kingdom", "Drama", "A young prince searches for his family's ancient realm.", 2, 7),
    ("Comedy Canvas", "Comedy", "A sketch show for the whole family.", 2, 6),
    ("Wonder Woods", "Children", "Magical creatures protect their forest home.", 2, 6),
    ("Ocean Detectives", "Documentary", "Real ocean mysteries explained for kids.", 2, 5),
]

LANGUAGES = ["en", "hi"]


def _make_artwork_bytes(kind: str, size: tuple[int, int], label: str, color: tuple[int, int, int]) -> bytes:
    img = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(img)
    # Simple two-tone diagonal for visual distinction
    for i in range(0, size[0], 40):
        draw.line([(i, 0), (i + size[1], size[1])], fill=tuple(min(255, c + 12) for c in color), width=4)
    draw.text((size[0] * 0.08, size[1] * 0.4), label, fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="WEBP")
    return buf.getvalue()


def seed() -> None:
    db = SessionLocal()
    storage = get_storage()

    # Wipe existing content for a clean, deterministic seed
    db.query(Episode).delete()
    db.query(Season).delete()
    db.query(Show).delete()
    db.query(Artwork).delete()
    db.commit()

    ARTWORK_SIZES = {
        "poster": (600, 900),
        "banner": (1280, 720),
        "thumbnail": (640, 360),
    }
    COLORS = [(220, 60, 60), (60, 120, 220), (40, 180, 120), (220, 140, 40)]

    total_episodes = 0
    for si, (name, section, desc, n_seasons, eps_per_season) in enumerate(SHOWS):
        color = COLORS[si % len(COLORS)]
        show = Show(name=name, description=desc, section=section, status="published")
        db.add(show)
        db.flush()  # get show.id

        for sn in range(1, n_seasons + 1):
            season = Season(
                show_id=show.id,
                number=sn,
                title=f"Season {sn}",
                is_trailer=False,
            )
            db.add(season)
            db.flush()  # get season.id

            # Add a trailer episode in season 0 area (Season 0 = trailers)
            if sn == 1:
                trailer = Episode(
                    season_id=None,
                    show_id=show.id,
                    title=f"{name} — Official Trailer",
                    description="Trailer.",
                    duration=90,
                    language="en",
                    content_group=None,
                    is_trailer=True,
                    season_number=0,
                )
                db.add(trailer)

            for en in range(1, eps_per_season + 1):
                group = f"{name.lower().replace(' ', '_')}_{sn}_{en}"
                for li, lang in enumerate(LANGUAGES):
                    suffix = "" if li == 0 else f" ({lang.upper()})"
                    ep = Episode(
                        season_id=season.id,
                        show_id=show.id,
                        title=f"{name} S{sn}E{en}{suffix}",
                        description=f"Episode {en} of {name}.",
                        duration=300 + (en * 60),
                        language=lang,
                        content_group=group,
                        is_trailer=False,
                        season_number=sn,
                        episode_number=en,
                    )
                    db.add(ep)
                    db.flush()  # get ep.id
                    total_episodes += 1

                    # Generate artwork for the "canonical" language variant only
                    if li == 0:
                        for kind, size in ARTWORK_SIZES.items():
                            label_kind = {"poster": "P", "banner": "B", "thumbnail": "T"}[kind]
                            data = _make_artwork_bytes(kind, size, f"{name} {label_kind}", color)
                            if len(data) > 200 * 1024:
                                # Reduce quality if image is too large
                                img = Image.open(io.BytesIO(data))
                                buf = io.BytesIO()
                                img.save(buf, format="WEBP", quality=70)
                                data = buf.getvalue()
                            store_path = f"artwork/{kind}/{show.name.lower().replace(' ', '_')}_{season.number}_{ep.episode_number}_{kind}.webp"
                            storage.upload(store_path, data)
                            db.add(
                                Artwork(
                                    episode_id=ep.id,
                                    show_id=show.id,
                                    kind=kind,
                                    width=size[0],
                                    height=size[1],
                                    size_bytes=len(data),
                                    path=store_path,
                                    mime_type="WEBP",
                                )
                            )

    db.commit()

    # Build the catalogue file so the viewer has content immediately
    catalogue = build_catalogue(db)

    def _default(obj):
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        raise TypeError(obj)

    with open("catalogue.json", "w") as f:
        json.dump(catalogue, f, indent=2, default=_default)

    # Record a publish run
    from .models import PublishRun
    from sqlalchemy import func

    run = PublishRun(
        run_by="seed",
        status="completed",
        total_shows=catalogue["metadata"]["total_shows"],
        total_episodes=catalogue["metadata"]["total_episodes"],
        total_artwork=catalogue["metadata"]["total_artwork"],
        catalogue_path="catalogue.json",
        completed_at=func.now(),
    )
    db.add(run)
    db.commit()

    db.close()
    print(
        f"Seeded {catalogue['metadata']['total_shows']} shows, "
        f"{catalogue['metadata']['total_episodes']} episodes, "
        f"{catalogue['metadata']['total_artwork']} artwork items."
    )


if __name__ == "__main__":
    seed()