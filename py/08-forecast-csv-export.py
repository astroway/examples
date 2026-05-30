"""Daily forecast CSV export.

Pulls a 12-month daily forecast for one chart and writes the day-by-day
intensity series to CSV (date, harmonious, tense, total). Useful for
feeding a BI tool, Tableau, or just spotting transit trends in pandas.

Deps:  pip install astroway pandas
Env:   ASTROWAY_API_KEY

Run:   python 08-forecast-csv-export.py 1990-05-15 14:30 Kyiv 2026
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
from astroway import Astroway

if len(sys.argv) < 5:
    print("usage: forecast-csv-export.py YYYY-MM-DD HH:MM City YEAR")
    sys.exit(1)

birth_date, birth_time, city, year = sys.argv[1:5]
year = int(year)


def geocode(city: str, date_iso: str) -> dict:
    """AstroWay computes from coordinates + UTC offset, not city names.
    Open-Meteo's geocoder is free and key-less; the IANA zone gives the
    historically-correct offset (DST included) for the birth date."""
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


aw = Astroway(api_key=os.environ["ASTROWAY_API_KEY"])

natal = {"name": "Subject", "date": birth_date, "time": f"{birth_time}:00",
         "city": city, "houseSystem": "P", **geocode(city, birth_date)}

result = aw.forecast_calendar.compute({"natal": natal, "year": year})

daily = result["dailySummary"]
print(f"Got {len(daily)} daily readings for {year}")

df = pd.DataFrame(daily)[["date", "harmonious", "tense", "total"]]
out = f"forecast-{birth_date}-{year}.csv"
df.to_csv(out, index=False)
print(f"✓ Wrote {out} ({len(df)} rows)")

# The 10 most intense days of the year (highest absolute net pressure).
peak = df.reindex(df["total"].abs().sort_values(ascending=False).index).head(10)
print("\nMost eventful days:")
for _, row in peak.iterrows():
    print(f"  {row['date']}: net {row['total']:+.1f} (harmonious {row['harmonious']:.1f} / tense {row['tense']:.1f})")
