"""Bad input must be rejected before it reaches SQL."""
import pytest


@pytest.mark.parametrize("params, status", [
    ({"start": "2018-13"}, 422),                       # no month 13
    ({"start": "2018-1"}, 422),                        # wrong format
    ({"start": "2018-01; DROP TABLE fct_orders"}, 422),
    ({"start": "2018-05", "end": "2017-01"}, 400),     # start after end
    ({"region": "XX"}, 400),                           # unknown state
    ({"region": "SP' OR '1'='1"}, 400),
])
def test_bad_filters_rejected(client, params, status):
    assert client.get("/api/kpis", params=params).status_code == status


def test_unknown_category_rejected(client):
    r = client.get("/api/products/category-monthly", params={"category": "abc"})
    assert r.status_code == 400


def test_known_category_accepted(client):
    cats = client.get("/api/products/categories").json()["categories"]
    r = client.get("/api/products/category-monthly", params={"category": cats[0]["category"]})
    assert r.status_code == 200 and len(r.json()) > 0


@pytest.mark.parametrize("limit", [0, 51])
def test_limit_bounds(client, limit):
    assert client.get("/api/top-categories", params={"limit": limit}).status_code == 422
