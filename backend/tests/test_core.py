"""Tests for the risky parts: auth, artwork validation, publish, and search."""

import io
import base64

from fastapi.testclient import TestClient

from backend.db import engine
from backend.models import Base, Show, Season, Episode, Artwork
from backend.main import app
from backend.config import settings

client = TestClient(app)

# Admin endpoints require a bearer token; the public catalog/search do not.
admin_headers = {"Authorization": f"Bearer {settings.admin_token}"}


def setup_module():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def _make_show(db_client, **overrides) -> dict:
    payload = {"name": "TestShow", "section": "Children", "description": "A test"}
    payload.update(overrides)
    resp = db_client.post("/admin/shows/", json=payload, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_season(db_client, show_id: int, **overrides) -> dict:
    payload = {"number": 1, "title": "Season One"}
    payload.update(overrides)
    resp = db_client.post(f"/admin/shows/{show_id}/seasons/", json=payload, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_episode(db_client, show_id: int, season_id: int, **overrides) -> dict:
    payload = {
        "title": "Episode 1",
        "description": "desc",
        "duration": 600,
        "language": "en",
    }
    payload.update(overrides)
    resp = db_client.post(
        f"/admin/shows/{show_id}/seasons/{season_id}/episodes/",
        json=payload,
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _jpg_bytes(width: int = 600, height: int = 900) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (width, height), (120, 80, 200)).save(buf, format="JPEG")
    return buf.getvalue()


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


# ─── Auth ────────────────────────────────────────────────────────────

def test_login_success():
    resp = client.post(
        "/admin/login",
        json={"username": "admin", "password": settings.admin_password},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"] == settings.admin_token


def test_login_wrong_password():
    resp = client.post(
        "/admin/login",
        json={"username": "admin", "password": "wrong-password"},
    )
    assert resp.status_code == 401


def test_admin_endpoints_require_token():
    # 401 = no Authorization header at all, 403 = header present but invalid
    resp = client.get("/admin/shows/")
    assert resp.status_code in (401, 403)


def test_public_catalogue_does_not_require_token():
    resp = client.get("/catalog")
    assert resp.status_code == 200


# ─── Artwork validation ──────────────────────────────────────────────

def test_artwork_rejects_oversized_file():
    resp = client.post(
        "/admin/artwork/upload/",
        headers=admin_headers,
        json={
            "kind": "poster",
            "file": _b64(b"a" * (200 * 1024 + 1)),
            "original_filename": "poster.jpg",
            "episode_id": 1,
        },
    )
    assert resp.status_code == 400
    assert "max" in resp.json()["detail"].lower()


def test_artwork_rejects_wrong_ratio():
    from backend.main import validate_artwork_dimensions

    errors = validate_artwork_dimensions("poster", 1280, 720)
    assert any("ratio" in e for e in errors)


def test_artwork_accepts_valid_poster():
    show = _make_show(client)
    season = _make_season(client, show["id"])
    ep = _make_episode(client, show["id"], season["id"])
    from backend.main import validate_artwork_dimensions

    errors = validate_artwork_dimensions("poster", 600, 900)
    assert errors == []

    data = _jpg_bytes(600, 900)
    resp = client.post(
        "/admin/artwork/upload/",
        headers=admin_headers,
        json={
            "kind": "poster",
            "file": _b64(data),
            "original_filename": "poster.jpg",
            "episode_id": ep["id"],
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["kind"] == "poster"
    assert resp.json()["episode_id"] == ep["id"]


# ─── Show / Season / Episode CRUD ───────────────────────────────────

def test_show_crud():
    show = _make_show(client)
    assert show["status"] == "draft"

    resp = client.patch(
        f"/admin/shows/{show['id']}",
        headers=admin_headers,
        json={"status": "published"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "published"

    resp = client.delete(f"/admin/shows/{show['id']}", headers=admin_headers)
    assert resp.status_code == 200
    assert "deleted" in resp.json()["detail"].lower()


def test_episode_update_and_delete():
    show = _make_show(client)
    season = _make_season(client, show["id"])
    ep = _make_episode(client, show["id"], season["id"])

    resp = client.patch(
        f"/admin/shows/{show['id']}/seasons/{season['id']}/episodes/{ep['id']}",
        headers=admin_headers,
        json={"title": "Renamed Episode", "duration": 900},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["title"] == "Renamed Episode"
    assert resp.json()["duration"] == 900

    resp = client.delete(
        f"/admin/shows/{show['id']}/seasons/{season['id']}/episodes/{ep['id']}",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert "deleted" in resp.json()["detail"].lower()


# ─── Search ──────────────────────────────────────────────────────────

def test_search_composition():
    show = _make_show(client)
    season = _make_season(client, show["id"])
    _make_episode(client, show["id"], season["id"], title="The Jungle Mystery")

    resp = client.get("/catalog/search/", params={"q": "jungle"})
    assert resp.status_code == 200
    titles = [r["episode_title"] for r in resp.json()]
    assert any("Jungle" in t for t in titles)