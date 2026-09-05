"""Test isolation: tests run against their own SQLite file in /tmp so they
never clobber the developer's live database."""

import os

os.environ.setdefault("PEBLO_POSTGRES_DSN", "sqlite:////tmp/peblo_tv_test.db")
os.environ.setdefault("PEBLO_SEED_ON_STARTUP", "false")