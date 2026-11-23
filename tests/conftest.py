"""
Shared test setup.
Run from the project root:   .venv/Scripts/python.exe -m pytest
Needs the built database (run build.py first). Close any running build.py; the API may stay on (read-only).
"""
import os

import pytest

# Tests must never call a paid model: an empty key wins over .env (main.py only fills missing variables).
os.environ["ANTHROPIC_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402

ALL = {"start": "2016-01", "end": "2018-12"}   # covers every order in the dataset


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)
