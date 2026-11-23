"""
app.py
RetailIQ dashboard (Streamlit preview).
Run:  .venv/Scripts/python.exe -m streamlit run app.py
"""
import plotly.express as px
import streamlit as st

import queries as q

st.set_page_config(page_title="RetailIQ", page_icon="📊", layout="wide")

# ---------------------------------------------------------------- theme details Streamlit can't set in config.toml
st.markdown("""
<style>
[data-testid="stSidebar"]       { background-color: #131A32; }
[data-testid="stMetric"]        { background-color: #18213C; border: 1px solid #26304F;
                                  border-radius: 12px; padding: 16px 20px; }
[data-testid="stMetricLabel"] p { color: #94A3B8; }
[data-testid="stMetricValue"]   { font-size: 1.7rem; }
.block-container                { padding-top: 2rem; }
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------- colors
GREEN, ORANGE, BLUE = "#0EB582", "#FD7E4C", "#374A86"


# ---------------------------------------------------------------- helpers
def brl(x: float | None, short: bool = False) -> str:
    """Brazilian real. short=True -> R$ 13.2M"""
    if x is None:
        return "–"
    if short and abs(x) >= 1_000_000:
        return f"R$ {x / 1_000_000:,.2f}M"
    if short and abs(x) >= 1_000:
        return f"R$ {x / 1_000:,.1f}K"
    return f"R$ {x:,.2f}"


def num(x) -> str:
    return "–" if x is None else f"{x:,.0f}"


def fmt(x, pattern: str) -> str:
    """Format a number with a pattern like '{:.2f}%', or show a dash if missing."""
    return "–" if x is None else pattern.format(x)


def style(fig, height: int = 340):
    """Apply the RetailIQ dark theme to any Plotly chart."""
    fig.update_layout(
        height=height,
        paper_bgcolor="#18213C",
        plot_bgcolor="#18213C",
        font=dict(color="#FFFFFF", size=13),
        margin=dict(l=10, r=10, t=10, b=10),
        hoverlabel=dict(bgcolor="#11192C", font_color="#FFFFFF"),
        showlegend=False,
    )
    fig.update_xaxes(gridcolor="#26304F", linecolor="#26304F", title=None)
    fig.update_yaxes(gridcolor="#26304F", linecolor="#26304F", title=None)
    return fig


# ---------------------------------------------------------------- sidebar: navigation + filters
st.sidebar.markdown("## 📊 RetailIQ")
st.sidebar.caption("Turn commerce data into confident decisions.")

page = st.sidebar.radio(
    "Navigate",
    ["Overview", "Sales", "Products", "Delivery & experience", "Customers"],
    label_visibility="collapsed",
)

st.sidebar.divider()
st.sidebar.markdown("**Filters**")

months = q.all_months()
start_month, end_month = st.sidebar.select_slider(
    "Purchase month",
    options=months,
    value=("2017-01", "2018-08"),
    help="Default excludes 2016 and Sep–Oct 2018: those months are incomplete in the dataset.",
)
regions = tuple(st.sidebar.multiselect("Customer state", q.all_regions(), placeholder="All states",
                                       format_func=q.region_name))


# ---------------------------------------------------------------- page header
st.title(page)
st.caption(f"Olist marketplace · {start_month} → {end_month} · "
           f"{', '.join(q.region_name(r) for r in regions) if regions else 'all states'}")


# ================================================================ Overview
if page == "Overview":
    k = q.kpis(start_month, end_month, regions)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Delivered GMV", brl(k["gmv"], short=True),
              help="Sum of item prices on delivered orders, excluding freight. Not revenue or profit.")
    c2.metric("Total orders", num(k["total_orders"]),
              help="All orders placed in the period, any status.")
    c3.metric("Delivered orders", num(k["delivered_orders"]),
              help="Orders with status 'delivered'.")
    c4.metric("Average order value", brl(k["aov"]),
              help="Delivered GMV ÷ delivered orders that contain items.")

    c5, c6, c7, c8 = st.columns(4)
    c5.metric("Units sold", num(k["units"]),
              help="Item rows on delivered orders (one row = one unit).")
    c6.metric("Unique customers", num(k["customers"]),
              help="Distinct people (customer_unique_id), not per-order customer IDs.")
    c7.metric("Average review", fmt(k["avg_review"], "{:.2f} / 5"),
              help="Mean review score per order; multiple reviews on one order are averaged first.")
    c8.metric("Late delivery rate", fmt(k["late_rate"], "{:.2f}%"),
              help="Delivered orders that arrived after the estimated date ÷ delivered orders with a delivery date.")

    st.write("")

    # --- monthly trend with a metric switch
    with st.container(border=True):
        head, switch = st.columns([2, 1])
        head.subheader("Monthly trend")
        metric = switch.radio("Metric", ["GMV", "Orders", "Avg order value"],
                              horizontal=True, label_visibility="collapsed")

        trend = q.monthly_trend(start_month, end_month, regions)
        column = {"GMV": "gmv", "Orders": "orders", "Avg order value": "aov"}[metric]

        if trend.empty:
            st.info("No orders match these filters.")
        else:
            fig = px.bar(trend, x="month", y=column, color_discrete_sequence=[GREEN])
            fig.update_traces(hovertemplate="%{x}<br>%{y:,.2f}<extra></extra>")
            st.plotly_chart(style(fig), use_container_width=True)
            st.caption("Delivered orders only. GMV = item prices excluding freight.")

    # --- categories and regions side by side
    left, right = st.columns(2)

    with left, st.container(border=True):
        st.subheader("Top 10 categories by GMV")
        cats = q.top_categories(start_month, end_month, regions)
        if cats.empty:
            st.info("No data for these filters.")
        else:
            fig = px.bar(cats.sort_values("gmv"), x="gmv", y="category", orientation="h",
                         color_discrete_sequence=[GREEN], custom_data=["orders", "units"])
            fig.update_traces(hovertemplate="<b>%{y}</b><br>GMV: R$ %{x:,.2f}"
                                            "<br>Orders: %{customdata[0]:,}"
                                            "<br>Units: %{customdata[1]:,}<extra></extra>")
            st.plotly_chart(style(fig, 400), use_container_width=True)

    with right, st.container(border=True):
        st.subheader("Orders by customer state")
        reg = q.orders_by_region(start_month, end_month, regions)
        if reg.empty:
            st.info("No data for these filters.")
        else:
            fig = px.bar(reg.head(15).sort_values("orders"), x="orders", y="region_name", orientation="h",
                         color_discrete_sequence=[BLUE], custom_data=["gmv"])
            fig.update_traces(hovertemplate="<b>%{y}</b><br>Orders: %{x:,}"
                                            "<br>GMV: R$ %{customdata[0]:,.2f}<extra></extra>")
            st.plotly_chart(style(fig, 400), use_container_width=True)
            st.caption("Top 15 states shown. All statuses counted.")


# ================================================================ Products + Opportunity matrix
elif page == "Products":
    cat = q.category_performance(start_month, end_month, regions)

    if cat.empty:
        st.info("No category has at least 100 delivered orders for these filters. Try a wider date range.")
    else:
        # --- opportunity matrix
        with st.container(border=True):
            st.subheader("Opportunity matrix")
            st.caption("Each bubble is a product category. **Click a bubble** to inspect it below. "
                       "Bubble size = orders · color = late delivery rate · dotted lines = medians.")

            fig = px.scatter(
                cat, x="avg_review", y="gmv", size="orders", color="late_rate",
                color_continuous_scale=[GREEN, "#FBBF24", ORANGE],
                log_y=True, size_max=45,
                custom_data=["category", "orders", "late_rate", "freight_pct"],
            )
            fig.update_traces(
                marker=dict(line=dict(width=1, color="#11192C"), opacity=0.85),
                hovertemplate="<b>%{customdata[0]}</b>"
                              "<br>GMV: R$ %{y:,.0f}"
                              "<br>Avg review: %{x:.2f}"
                              "<br>Orders: %{customdata[1]:,}"
                              "<br>Late: %{customdata[2]:.1f}%"
                              "<br>Freight / GMV: %{customdata[3]:.1f}%<extra></extra>",
            )

            # quadrant guides at the medians
            mid_review, mid_gmv = cat["avg_review"].median(), cat["gmv"].median()
            fig.add_vline(x=mid_review, line_dash="dot", line_color="#94A3B8")
            fig.add_hline(y=mid_gmv, line_dash="dot", line_color="#94A3B8")
            for text, x, y, anchor in [
                ("High GMV · weak reviews → investigate first", 0.01, 0.99, "left"),
                ("High GMV · strong reviews → protect", 0.99, 0.99, "right"),
                ("Low GMV · weak reviews", 0.01, 0.01, "left"),
                ("Low GMV · strong reviews → grow", 0.99, 0.01, "right"),
            ]:
                fig.add_annotation(text=text, x=x, y=y, xref="paper", yref="paper",
                                   xanchor=anchor, yanchor="top" if y > 0.5 else "bottom",
                                   showarrow=False, font=dict(color="#94A3B8", size=12))

            style(fig, 540)                                   # apply theme FIRST, then axis titles
            fig.update_layout(coloraxis_colorbar=dict(title="Late %"))
            fig.update_xaxes(title="Average review score")
            fig.update_yaxes(title="Delivered GMV (R$, log scale)",
                             tickvals=[10_000, 30_000, 100_000, 300_000, 1_000_000],
                             ticktext=["10K", "30K", "100K", "300K", "1M"])

            event = st.plotly_chart(fig, use_container_width=True,
                                    on_select="rerun", selection_mode="points", key="matrix")
            st.caption("Diagnostic tool, not a prediction. Categories with fewer than 100 delivered orders are hidden.")

        # --- which category did the user click?
        options = cat["category"].tolist()
        clicked = None
        if event and event.selection and event.selection.points:
            clicked = event.selection.points[0]["customdata"][0]
        chosen = st.selectbox("Inspect a category", options,
                              index=options.index(clicked) if clicked in options else 0)

        # --- category detail (drill-down)
        row = cat.loc[cat["category"] == chosen].iloc[0]
        with st.container(border=True):
            st.subheader(chosen.replace("_", " ").capitalize())
            c1, c2, c3, c4, c5 = st.columns(5)
            c1.metric("GMV", brl(row["gmv"], short=True))
            c2.metric("Orders", num(row["orders"]))
            c3.metric("Avg review", f"{row['avg_review']:.2f} / 5")
            c4.metric("Late rate", f"{row['late_rate']:.1f}%")
            c5.metric("Freight / GMV", f"{row['freight_pct']:.1f}%",
                      help="Freight paid ÷ item value. High = shipping is expensive relative to the product.")

            trend = q.category_monthly(start_month, end_month, regions, chosen)
            fig = px.line(trend, x="month", y="gmv", markers=True, color_discrete_sequence=[GREEN])
            fig.update_traces(hovertemplate="%{x}<br>GMV: R$ %{y:,.2f}<extra></extra>")
            st.plotly_chart(style(fig, 260), use_container_width=True)

        # --- ranking table
        with st.container(border=True):
            st.subheader("All categories")
            st.caption("Click a column header to sort.")
            st.dataframe(
                cat,
                hide_index=True,
                use_container_width=True,
                column_config={
                    "category":       st.column_config.TextColumn("Category"),
                    "gmv":            st.column_config.NumberColumn("GMV (R$)", format="localized"),
                    "orders":         st.column_config.NumberColumn("Orders", format="localized"),
                    "units":          st.column_config.NumberColumn("Units", format="localized"),
                    "avg_item_price": st.column_config.NumberColumn("Avg item price (R$)", format="%.2f"),
                    "freight_pct":    st.column_config.NumberColumn("Freight / GMV", format="%.1f%%"),
                    "avg_review":     st.column_config.NumberColumn("Avg review", format="%.2f"),
                    "late_rate":      st.column_config.NumberColumn("Late rate", format="%.1f%%"),
                },
            )


# ================================================================ Delivery & experience
elif page == "Delivery & experience":
    d = q.delivery_kpis(start_month, end_month, regions)

    gap = None if d["review_on_time"] is None or d["review_late"] is None \
        else d["review_on_time"] - d["review_late"]

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Late delivery rate", fmt(d["late_rate"], "{:.2f}%"),
              help="Delivered orders that arrived after the estimated date.")
    c2.metric("Avg delivery time", fmt(d["avg_delivery_days"], "{:.1f} days"),
              help="Purchase to customer delivery, delivered orders only.")
    c3.metric("Review: on time", fmt(d["review_on_time"], "{:.2f} / 5"),
              help="Average review score of orders delivered on or before the estimated date.")
    c4.metric("Review: late", fmt(d["review_late"], "{:.2f} / 5"),
              delta=None if gap is None else f"-{gap:.2f} vs on time", delta_color="normal",
              help="Average review score of orders delivered after the estimated date.")

    st.write("")

    left, right = st.columns([1, 2])

    # --- on time vs late comparison
    with left, st.container(border=True):
        st.subheader("Review by delivery status")
        rs = q.review_by_status(start_month, end_month, regions)
        if rs.empty:
            st.info("No delivered, reviewed orders for these filters.")
        else:
            fig = px.bar(rs, x="delivery", y="avg_review", color="delivery",
                         color_discrete_map={"On time / early": GREEN, "Late": ORANGE},
                         custom_data=["orders", "pct_negative"], text_auto=".2f")
            fig.update_traces(hovertemplate="<b>%{x}</b><br>Avg review: %{y:.2f}"
                                            "<br>Orders: %{customdata[0]:,}"
                                            "<br>1–2 star reviews: %{customdata[1]:.1f}%<extra></extra>")
            style(fig, 360)
            fig.update_yaxes(range=[0, 5])
            st.plotly_chart(fig, use_container_width=True)

    # --- the curve: days early / late vs review
    with right, st.container(border=True):
        st.subheader("Review score by days vs. promised date")
        dv = q.review_by_days_vs_promise(start_month, end_month, regions)
        if dv.empty:
            st.info("No delivered, reviewed orders for these filters.")
        else:
            dv["status"] = dv["days_vs_promise"].apply(lambda x: "Late" if x > 0 else "On time / early")
            fig = px.bar(dv, x="days_vs_promise", y="avg_review", color="status",
                         color_discrete_map={"On time / early": GREEN, "Late": ORANGE},
                         custom_data=["orders"])
            fig.update_traces(hovertemplate="%{x} days vs promise<br>Avg review: %{y:.2f}"
                                            "<br>Orders: %{customdata[0]:,}<extra></extra>")
            style(fig, 360)
            fig.update_yaxes(range=[0, 5], title="Average review")
            fig.update_xaxes(dtick=5, title="Days vs. promised date (negative = early)")
            st.plotly_chart(fig, use_container_width=True)
            st.caption("Values beyond ±20 days are grouped at the edges.")

    # --- late rate by state (horizontal: full state names are long)
    with st.container(border=True):
        st.subheader("Late delivery rate by customer state")
        lr = q.late_by_region(start_month, end_month, regions)
        if lr.empty:
            st.info("No state has at least 300 delivered orders for these filters.")
        else:
            fig = px.bar(lr.sort_values("late_rate"), x="late_rate", y="region_name", orientation="h",
                         color_discrete_sequence=[ORANGE],
                         custom_data=["delivered_orders", "avg_delivery_days", "avg_review"])
            fig.update_traces(hovertemplate="<b>%{y}</b><br>Late: %{x:.1f}%"
                                            "<br>Delivered orders: %{customdata[0]:,}"
                                            "<br>Avg delivery: %{customdata[1]:.1f} days"
                                            "<br>Avg review: %{customdata[2]:.2f}<extra></extra>")
            style(fig, 520)
            fig.update_xaxes(title="Late delivery rate (%)")
            st.plotly_chart(fig, use_container_width=True)
            st.caption("States with fewer than 300 delivered orders are hidden: their rates are too unstable to compare.")

    st.info("**Correlation, not causation.** Late orders get lower reviews, but this data can't prove the delay "
            "*caused* the low score: late orders may also differ in product, seller or region.", icon="ℹ️")


# ================================================================ Sales
elif page == "Sales":
    sm = q.sales_monthly(start_month, end_month, regions)

    if sm.empty:
        st.info("No orders match these filters.")
    else:
        last = sm.iloc[-1]
        c1, c2, c3, c4 = st.columns(4)
        c1.metric(f"GMV · {last['month']}", brl(last["gmv"], short=True),
                  delta=None if last["gmv_mom_pct"] is None else f"{last['gmv_mom_pct']:+.1f}% vs previous month",
                  help="Last month in the selected range, compared with the month before it.")
        c2.metric(f"Orders · {last['month']}", num(last["orders"]))
        c3.metric(f"AOV · {last['month']}", brl(last["aov"]))
        c4.metric("Best month (GMV)", sm.loc[sm["gmv"].idxmax(), "month"],
                  help="Month with the highest delivered GMV in the selected range.")

        st.write("")
        left, right = st.columns(2)

        with left, st.container(border=True):
            st.subheader("Monthly GMV")
            fig = px.bar(sm, x="month", y="gmv", color_discrete_sequence=[GREEN], custom_data=["orders", "aov"])
            fig.update_traces(hovertemplate="%{x}<br>GMV: R$ %{y:,.0f}<br>Orders: %{customdata[0]:,}"
                                            "<br>AOV: R$ %{customdata[1]:,.2f}<extra></extra>")
            st.plotly_chart(style(fig), use_container_width=True)

        with right, st.container(border=True):
            st.subheader("Month-over-month GMV change")
            mom = sm.dropna(subset=["gmv_mom_pct"]).copy()
            mom["direction"] = mom["gmv_mom_pct"].apply(lambda x: "Up" if x >= 0 else "Down")
            fig = px.bar(mom, x="month", y="gmv_mom_pct", color="direction",
                         color_discrete_map={"Up": GREEN, "Down": ORANGE})
            fig.update_traces(hovertemplate="%{x}<br>%{y:+.1f}% vs previous month<extra></extra>")
            style(fig)
            fig.update_yaxes(title="% change")
            st.plotly_chart(fig, use_container_width=True)
            st.caption("The first month of the range has no previous month to compare with.")

        left, right = st.columns([3, 2])

        with left, st.container(border=True):
            st.subheader("Top 20 products by GMV")
            tp = q.top_products(start_month, end_month, regions)
            st.dataframe(
                tp, hide_index=True, use_container_width=True,
                column_config={
                    "product":   st.column_config.TextColumn("Product ID", help="First 8 characters of the anonymised ID."),
                    "category":  st.column_config.TextColumn("Category"),
                    "gmv":       st.column_config.NumberColumn("GMV (R$)", format="localized"),
                    "units":     st.column_config.NumberColumn("Units", format="localized"),
                    "orders":    st.column_config.NumberColumn("Orders", format="localized"),
                    "avg_price": st.column_config.NumberColumn("Avg price (R$)", format="%.2f"),
                },
            )
            st.caption("Olist anonymised product names, so products are shown by ID.")

        with right, st.container(border=True):
            st.subheader("Payment mix")
            pmx = q.payment_mix(start_month, end_month, regions)
            fig = px.bar(pmx.sort_values("share_pct"), x="share_pct", y="method", orientation="h",
                         color_discrete_sequence=[BLUE], custom_data=["amount", "payments"], text_auto=".1f")
            fig.update_traces(hovertemplate="<b>%{y}</b><br>Share of value: %{x:.1f}%"
                                            "<br>Amount: R$ %{customdata[0]:,.0f}"
                                            "<br>Payments: %{customdata[1]:,}<extra></extra>")
            style(fig, 320)
            fig.update_xaxes(title="% of payment value")
            st.plotly_chart(fig, use_container_width=True)


# ================================================================ Customers
elif page == "Customers":
    ck = q.customer_kpis(start_month, end_month, regions)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Unique customers", num(ck["customers"]),
              help="Distinct people (customer_unique_id) with at least one order in the range.")
    c2.metric("Repeat customers", num(ck["repeat_customers"]),
              help="People with more than one order inside the selected range.")
    c3.metric("Repeat rate", fmt(ck["repeat_rate"], "{:.2f}%"),
              help="Repeat customers ÷ unique customers. This is NOT cohort retention.")
    c4.metric("Orders per customer", fmt(ck["avg_orders"], "{:.3f}"))

    st.write("")
    left, right = st.columns(2)

    with left, st.container(border=True):
        st.subheader("Repeat vs one-time customers")
        rv = q.repeat_vs_one_time(start_month, end_month, regions)
        if rv.empty:
            st.info("No customers for these filters.")
        else:
            fig = px.bar(rv, x="segment", y="avg_spend_per_customer", color="segment",
                         color_discrete_map={"Repeat": GREEN, "One-time": BLUE},
                         custom_data=["customers", "aov"], text_auto=",.0f")
            fig.update_traces(hovertemplate="<b>%{x}</b><br>Avg spend per customer: R$ %{y:,.2f}"
                                            "<br>Customers: %{customdata[0]:,}"
                                            "<br>Avg order value: R$ %{customdata[1]:,.2f}<extra></extra>")
            style(fig)
            fig.update_yaxes(title="Avg delivered GMV per customer (R$)")
            st.plotly_chart(fig, use_container_width=True)
            st.caption("Repeat customers spend more in total because they order more often. "
                       "Hover to compare their average order value.")

    with right, st.container(border=True):
        st.subheader("Orders per customer")
        of = q.order_frequency(start_month, end_month, regions)
        if of.empty:
            st.info("No customers for these filters.")
        else:
            fig = px.bar(of, x="orders_per_customer", y="customers", color_discrete_sequence=[BLUE],
                         text_auto=",", log_y=True)
            fig.update_traces(hovertemplate="%{x} order(s): %{y:,} customers<extra></extra>")
            style(fig)
            fig.update_xaxes(title="Orders in the selected range")
            fig.update_yaxes(title="Customers (log scale)")
            st.plotly_chart(fig, use_container_width=True)
            st.caption("Log scale: most customers order only once, so the other bars would be invisible.")

    with st.container(border=True):
        st.subheader("When do customers buy?")
        hm = q.purchase_heatmap(start_month, end_month, regions)
        if hm.empty:
            st.info("No orders for these filters.")
        else:
            grid = (hm.pivot(index="weekday", columns="hour", values="orders")
                      .reindex(index=range(1, 8), columns=range(24))
                      .fillna(0))
            grid.index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            fig = px.imshow(grid, aspect="auto", color_continuous_scale=["#18213C", GREEN],
                            labels=dict(x="Hour of day", y="", color="Orders"))
            fig.update_traces(hovertemplate="%{y} %{x}:00<br>Orders: %{z:,}<extra></extra>")
            style(fig, 320)
            fig.update_xaxes(title="Hour of day (Brazil time)", dtick=2)
            st.plotly_chart(fig, use_container_width=True)

    st.info("**Repeat rate is not retention.** Only ~3% of customers ever order twice, and the rate here only "
            "counts orders inside the selected date range. A proper retention analysis would follow monthly "
            "cohorts over time.", icon="ℹ️")


# ================================================================ fallback
else:
    st.info("Page not found.")