"""
api/main.py
RetailIQ REST API. Every input is validated before it reaches SQL.

Run (from the project root):
    .venv/Scripts/python.exe -m uvicorn api.main:app --reload --port 8000
Docs:  http://localhost:8000/docs
"""
import os
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.responses import RedirectResponse

def _load_env(path: Path) -> None:
    """Read KEY=value lines from .env into the environment (real environment variables win)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env(Path(__file__).resolve().parent.parent / ".env")   # must run before the agent reads its settings

from api import agent                # noqa: E402
from api import analytics as a      # noqa: E402

app = FastAPI(
    title="RetailIQ API",
    description="Read-only analytics over the Olist e-commerce dataset.",
    version="1.0.0",
)

# ---------------------------------------------------------------- shared, validated filters
Month = Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")]
Regions = Annotated[list[str], Query(description="State code, repeatable: ?region=SP&region=RJ")]


def _validate(start: str, end: str, region: list[str]) -> tuple[str, ...]:
    if start > end:
        raise HTTPException(status_code=400, detail="start must be before or equal to end")
    unknown = [r for r in region if r not in a.REGION_NAMES]
    if unknown:
        raise HTTPException(status_code=400, detail=f"unknown region code(s): {unknown}")
    return tuple(sorted(set(region)))   # sorted + unique -> better cache hits


# ---------------------------------------------------------------- general
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/filters")
def filters():
    return a.filter_options()


# ---------------------------------------------------------------- overview
@app.get("/api/kpis")
def kpis(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.kpis(start, end, _validate(start, end, region))


@app.get("/api/monthly-trend")
def monthly_trend(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.monthly_trend(start, end, _validate(start, end, region))


@app.get("/api/top-categories")
def top_categories(start: Month = "2017-01", end: Month = "2018-08", region: Regions = [],
                   limit: Annotated[int, Query(ge=1, le=50)] = 10):
    return a.top_categories(start, end, _validate(start, end, region), limit)


@app.get("/api/orders-by-region")
def orders_by_region(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.orders_by_region(start, end, _validate(start, end, region))


@app.get("/api/orders-by-city")
def orders_by_city(start: Month = "2017-01", end: Month = "2018-08", region: Regions = [],
                   limit: Annotated[int, Query(ge=1, le=50)] = 10):
    return a.orders_by_city(start, end, _validate(start, end, region), limit)


@app.get("/api/geo")
def geo(start: Month = "2017-01", end: Month = "2018-08", region: Regions = [],
        cell: Annotated[float, Query(ge=0.05, le=2.0, description="Grid size in degrees")] = 0.1):
    return a.geo_points(start, end, _validate(start, end, region), cell)


# ---------------------------------------------------------------- delivery & experience
@app.get("/api/delivery/kpis")
def delivery_kpis(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.delivery_kpis(start, end, _validate(start, end, region))


@app.get("/api/delivery/review-by-status")
def review_by_status(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.review_by_status(start, end, _validate(start, end, region))


@app.get("/api/delivery/review-by-days")
def review_by_days(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.review_by_days(start, end, _validate(start, end, region))


@app.get("/api/delivery/late-by-region")
def late_by_region(start: Month = "2017-01", end: Month = "2018-08", region: Regions = [],
                   min_orders: Annotated[int, Query(ge=1, le=5000)] = 300):
    return a.late_by_region(start, end, _validate(start, end, region), min_orders)


# ---------------------------------------------------------------- products
@app.get("/api/products/categories")
def category_performance(start: Month = "2017-01", end: Month = "2018-08", region: Regions = [],
                         min_orders: Annotated[int, Query(ge=1, le=5000)] = 100):
    return a.category_performance(start, end, _validate(start, end, region), min_orders)


@app.get("/api/products/category-monthly")
def category_monthly(category: Annotated[str, Query(max_length=80)],
                     start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    if category not in a.all_categories():   # allow-list: only real category names reach SQL
        raise HTTPException(status_code=400, detail=f"unknown category: {category}")
    return a.category_monthly(start, end, _validate(start, end, region), category)


# ---------------------------------------------------------------- sales
@app.get("/api/sales/monthly")
def sales_monthly(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.sales_monthly(start, end, _validate(start, end, region))


@app.get("/api/sales/comparison")
def period_comparison(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.period_comparison(start, end, _validate(start, end, region))


@app.get("/api/sales/top-products")
def top_products(start: Month = "2017-01", end: Month = "2018-08", region: Regions = [],
                 limit: Annotated[int, Query(ge=1, le=100)] = 20):
    return a.top_products(start, end, _validate(start, end, region), limit)


@app.get("/api/sales/payment-mix")
def payment_mix(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.payment_mix(start, end, _validate(start, end, region))


# ---------------------------------------------------------------- customers
@app.get("/api/customers/kpis")
def customer_kpis(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.customer_kpis(start, end, _validate(start, end, region))


@app.get("/api/customers/segments")
def repeat_vs_one_time(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.repeat_vs_one_time(start, end, _validate(start, end, region))


@app.get("/api/customers/frequency")
def order_frequency(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.order_frequency(start, end, _validate(start, end, region))


@app.get("/api/customers/heatmap")
def purchase_heatmap(start: Month = "2017-01", end: Month = "2018-08", region: Regions = []):
    return a.purchase_heatmap(start, end, _validate(start, end, region))


@app.get("/api/customers/cohorts")
def cohort_retention(start: Month = "2017-01", end: Month = "2018-08", region: Regions = [],
                     max_k: Annotated[int, Query(ge=1, le=12)] = 6):
    return a.cohort_retention(start, end, _validate(start, end, region), max_k)


# ---------------------------------------------------------------- AI assistant
class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskBody(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    start: str = Field("2017-01", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    end: str = Field("2018-08", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    regions: list[str] = Field(default_factory=list, max_length=27)
    history: list[Turn] = Field(default_factory=list, max_length=12)


@app.get("/api/agent/status")
def agent_status():
    return agent.status()


@app.post("/api/agent/ask")
def agent_ask(body: AskBody):
    regions = _validate(body.start, body.end, body.regions)
    defaults = {"start": body.start, "end": body.end, "regions": list(regions)}
    return agent.ask(body.question.strip(), [t.model_dump() for t in body.history], defaults)
