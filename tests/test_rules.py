"""Business rules from the brief: partial months, like-for-like comparison, honest cohorts."""
import pytest

from tests.conftest import ALL
from api.analytics import FULL_END, FULL_START, _add_months


def test_no_month_over_month_for_partial_months(client):
    rows = client.get("/api/sales/monthly", params={"start": "2016-09", "end": "2018-10"}).json()
    assert any(r["is_partial"] for r in rows)
    for prev, cur in zip(rows, rows[1:]):
        if cur["is_partial"] or prev["is_partial"]:
            assert cur["gmv_mom_pct"] is None, cur["month"]


def test_partial_flag_matches_complete_range(client):
    rows = client.get("/api/sales/monthly", params={"start": "2016-09", "end": "2018-10"}).json()
    for r in rows:
        assert r["is_partial"] == (r["month"] < FULL_START or r["month"] > FULL_END)


def test_year_on_year_uses_same_complete_months(client):
    c = client.get("/api/sales/comparison", params={"start": "2017-01", "end": "2018-08"}).json()
    assert c["available"] is True
    assert c["label"] == "Jan\u2013Aug 2018 vs Jan\u2013Aug 2017"
    assert c["months"] == 8


def test_year_on_year_unavailable_for_one_month(client):
    c = client.get("/api/sales/comparison", params={"start": "2017-11", "end": "2017-11"}).json()
    assert c["available"] is False


def test_cohort_cells_not_observed_are_null_not_zero(client):
    data = client.get("/api/customers/cohorts", params={"start": "2017-01", "end": "2018-08"}).json()
    assert data["rows"]
    for row in data["rows"]:
        for k, cell in enumerate(row["cells"], start=1):
            observed = _add_months(row["cohort"], k) <= FULL_END
            assert (cell is None) == (not observed), (row["cohort"], k)
            if cell is not None:
                assert 0 <= cell <= 100


def test_repeat_rate_is_consistent(client):
    k = client.get("/api/customers/kpis", params=ALL).json()
    assert k["repeat_rate"] == pytest.approx(100 * k["repeat_customers"] / k["customers"], abs=1e-6)


def test_opportunity_quadrants_follow_medians(client):
    d = client.get("/api/products/categories", params=ALL).json()
    for c in d["categories"]:
        high = c["gmv"] >= d["median_gmv"]
        good = c["avg_review"] >= d["median_review"]
        expected = {(True, False): "investigate", (True, True): "protect",
                    (False, True): "grow", (False, False): "monitor"}[(high, good)]
        assert c["quadrant"] == expected
        assert c["orders"] >= d["min_orders"]
