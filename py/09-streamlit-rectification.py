"""Streamlit UI for birth-time rectification.

Rectification = solving an unknown birth time given a few dated life
events (marriage, career change, parenthood, …) by scanning candidate
times and scoring each against the events. Compute is heavy (10–60s per
call) — Streamlit gives the user a clean loading state and a sortable
results table.

Deps:  pip install astroway streamlit
Env:   ASTROWAY_API_KEY

Run:   streamlit run 09-streamlit-rectification.py
"""
import json
import os
import urllib.parse
import urllib.request
from datetime import date, datetime
from zoneinfo import ZoneInfo

import streamlit as st
from astroway import Astroway


def geocode(city: str, date_iso: str) -> dict:
    """City name → coordinates + UTC offset (AstroWay needs both)."""
    url = "https://geocoding-api.open-meteo.com/v1/search?name=" + urllib.parse.quote(city) + "&count=1"
    results = json.load(urllib.request.urlopen(url)).get("results")
    if not results:
        raise ValueError(f"City not found: {city}")
    g = results[0]
    dt = datetime.fromisoformat(f"{date_iso}T12:00:00").replace(tzinfo=ZoneInfo(g["timezone"]))
    return {
        "latitude": g["latitude"],
        "longitude": g["longitude"],
        "timezoneOffset": dt.utcoffset().total_seconds() / 3600,
    }


st.set_page_config(page_title="Birth-time rectification", layout="centered")
st.title("Birth-time rectification")
st.caption("Solve an unknown or fuzzy birth time from real life events.")

aw = Astroway(api_key=os.environ["ASTROWAY_API_KEY"])

with st.form("rect"):
    bd = st.date_input("Approx birth date", value=date(1990, 5, 15))
    city = st.text_input("Birth city", value="Kyiv")
    st.subheader("Life events")
    st.caption("Major dated events the rectifier fits against. Add 3–7 for best results.")
    events_raw = st.text_area(
        "One per line: YYYY-MM-DD: short label",
        value="2010-06-15: started university\n2018-09-01: married\n2022-04-10: first child\n",
        height=140,
    )
    submitted = st.form_submit_button("Run rectification (10–60 sec)")

if submitted:
    events = []
    for line in events_raw.strip().split("\n"):
        if ":" in line:
            d, label = line.split(":", 1)
            events.append({"date": d.strip(), "label": label.strip()})

    with st.spinner("Scanning candidate birth times…"):
        try:
            loc = geocode(city, str(bd))
            r = aw.rectification.compute({
                "baseInput": {"name": "Subject", "date": str(bd), "time": "12:00:00",
                              "city": city, "houseSystem": "P", **loc},
                "events": events,
            })
            candidates = sorted(
                r.get("candidates", []),
                key=lambda c: (c.get("score") is not None, c.get("score") or 0),
                reverse=True,
            )
            if candidates:
                best = candidates[0]
                st.success(f"Best match: {best['timeFormatted']} (score {best.get('score', '—')}, "
                           f"{len(best.get('hits', []))} event hits)")
                st.dataframe([
                    {"time": c["timeFormatted"], "score": c.get("score"), "hits": len(c.get("hits", []))}
                    for c in candidates[:15]
                ])
            else:
                st.warning("No candidate times scored — try adding more events.")
        except Exception as e:
            st.error(f"Rectification failed: {e}")
