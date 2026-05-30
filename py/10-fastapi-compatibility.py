"""FastAPI compatibility-scoring service.

Drop-in HTTP service for dating apps: POST two births, get back a
compatibility score, label, and the strongest cross-aspects. Wraps
/v1/synastry. Designed to sit behind your own auth — this service has
none, so mount it inside your VPC or add API-key auth.

Deps:  pip install astroway fastapi uvicorn pydantic
Env:   ASTROWAY_API_KEY

Run:   uvicorn 10-fastapi-compatibility:app --host 0.0.0.0 --port 8080
Test:  curl -X POST localhost:8080/score -H 'content-type: application/json' \\
            -d '{"a":{"date":"1990-05-15","time":"14:30:00","city":"Kyiv"},
                 "b":{"date":"1992-07-20","time":"09:00:00","city":"Lviv"}}'
"""
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

from astroway import Astroway, BirthData, SynastryRequest
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

aw = Astroway(api_key=os.environ["ASTROWAY_API_KEY"])
app = FastAPI(title="Compatibility scoring", version="1.0")


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
        "timezone_offset": dt.utcoffset().total_seconds() / 3600,
    }


class Birth(BaseModel):
    date: str   # YYYY-MM-DD
    time: str   # HH:MM:SS
    city: str


class ScoreReq(BaseModel):
    a: Birth
    b: Birth


def to_birth_data(b: Birth) -> BirthData:
    return BirthData(date=b.date, time=b.time, city=b.city, house_system="P", **geocode(b.city, b.date))


@app.post("/score")
def score(req: ScoreReq):
    try:
        result = aw.synastry.compute(SynastryRequest(
            chart1=to_birth_data(req.a),
            chart2=to_birth_data(req.b),
        ))
        compat = result.get("compatibility", {})
        aspects = result.get("crossAspects", [])
        return {
            "score": compat.get("score"),
            "label": compat.get("label"),
            "harmony": compat.get("harmony"),
            "tension": compat.get("tension"),
            "top_aspects": [
                {
                    "from": x.get("planet1"),
                    "to": x.get("planet2"),
                    "aspect": x.get("type", {}).get("name"),
                    "orb": round(x.get("orb", 0), 2),
                }
                for x in aspects[:5]
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok"}
