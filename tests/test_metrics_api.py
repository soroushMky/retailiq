"""The API must return the validated baseline numbers (same values as metrics.py)."""
import pytest

from tests.conftest import ALL


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_kpis_match_baseline(client):
    k = client.get("/api/kpis", params=ALL).json()
    assert k["total_orders"] == 99_441
    assert k["delivered_orders"] == 96_478
    assert k["units"] == 110_197
    assert k["gmv"] == pytest.approx(13_221_498.11, abs=0.01)
    assert k["aov"] == pytest.approx(137.04, abs=0.005)
    assert k["late_rate"] == pytest.approx(8.11, abs=0.005)


def test_delivery_review_gap_matches_baseline(client):
    d = client.get("/api/delivery/kpis", params=ALL).json()
    assert d["review_on_time"] == pytest.approx(4.294, abs=0.0005)
    assert d["review_late"] == pytest.approx(2.567, abs=0.0005)


def test_state_filter_is_a_subset(client):
    total = client.get("/api/kpis", params=ALL).json()["total_orders"]
    sp = client.get("/api/kpis", params={**ALL, "region": "SP"}).json()["total_orders"]
    by_state = client.get("/api/orders-by-region", params=ALL).json()
    assert 0 < sp < total
    assert sum(r["orders"] for r in by_state) == total          # states add up to the whole


def test_payment_shares_sum_to_100(client):
    rows = client.get("/api/sales/payment-mix", params=ALL).json()
    assert sum(r["share_pct"] for r in rows) == pytest.approx(100, abs=0.01)
