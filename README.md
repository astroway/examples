# AstroWay astrology API — examples gallery

Ten copy-paste integration recipes for the [AstroWay astrology API](https://api.astroway.info) — chat bots, LLM tools, edge caching, data export and drop-in services. Each file is self-contained: install one or two deps, set `ASTROWAY_API_KEY`, run.

Get a key at [api.astroway.info/dashboard/sign-up](https://api.astroway.info/dashboard/sign-up) — **10,000 credits/month free**, no card.

| # | Recipe | Stack | File |
|---|---|---|---|
| 1 | Daily horoscope SMS via Twilio | Node + `@astroway/sdk` + twilio | [`ts/01-daily-horoscope-twilio.ts`](ts/01-daily-horoscope-twilio.ts) |
| 2 | Discord bot — `/chart` slash command | Node + discord.js | [`ts/02-discord-bot.ts`](ts/02-discord-bot.ts) |
| 3 | OpenAI function-calling: GPT reads charts | Node + openai | [`ts/03-openai-function-calling.ts`](ts/03-openai-function-calling.ts) |
| 4 | Slack bot — `/synastry` compatibility | Node + @slack/bolt | [`ts/04-slack-bot-synastry.ts`](ts/04-slack-bot-synastry.ts) |
| 5 | Notion: birthday → natal data on the page | Node + @notionhq/client | [`ts/05-notion-natal-cards.ts`](ts/05-notion-natal-cards.ts) |
| 6 | Cloudflare Worker: edge chart cache | Cloudflare Workers | [`ts/06-cloudflare-worker.ts`](ts/06-cloudflare-worker.ts) |
| 7 | Claude MCP tool wrapper | `@astroway/mcp` | [`ts/07-claude-mcp-tools.ts`](ts/07-claude-mcp-tools.ts) |
| 8 | Daily forecast CSV export | Python + pandas | [`py/08-forecast-csv-export.py`](py/08-forecast-csv-export.py) |
| 9 | Streamlit: birth-time rectification UI | Python + Streamlit | [`py/09-streamlit-rectification.py`](py/09-streamlit-rectification.py) |
| 10 | FastAPI compatibility-scoring service | Python + FastAPI | [`py/10-fastapi-compatibility.py`](py/10-fastapi-compatibility.py) |

## Setup

TypeScript examples use the official SDK [`@astroway/sdk`](https://www.npmjs.com/package/@astroway/sdk):

```bash
npm install @astroway/sdk
export ASTROWAY_API_KEY=aw_live_yourkey   # or an aw_test_ sandbox key
npx tsx ts/01-daily-horoscope-twilio.ts
```

Python examples use [`astroway`](https://pypi.org/project/astroway/):

```bash
pip install astroway
export ASTROWAY_API_KEY=aw_live_yourkey
python py/08-forecast-csv-export.py 1990-05-15 14:30 Kyiv 2026
```

Per-example dependencies (twilio, discord.js, pandas, …) are listed at the top of each file.

## A note on cities and timezones

AstroWay computes from **coordinates and a UTC offset**, not city names — it does not geocode. The recipes that take a city resolve it themselves with [Open-Meteo's geocoder](https://open-meteo.com/en/docs/geocoding-api) (free, no key) and derive the historically-correct offset from the IANA timezone, so a 1990 Kyiv birth gets UTC+4, a 2000 New York birth gets UTC−5, and so on. Copy that `geocode()` helper into your own code, or pass `latitude` / `longitude` / `timezoneOffset` directly if you already have them.

## Conventions

- Every example is one file, no build step (run TypeScript with `tsx`).
- Inputs come from env vars or CLI args — the only hardcoded data is the demo birth (1990-05-15, Kyiv).
- Planet positions come back as absolute ecliptic longitude (0–360°); convert to sign + degree with `floor(lon / 30)` → sign index, `lon % 30` → degree-in-sign.
- The Ascendant is the first house cusp: `chart.houses.cusps[0]`.

## Contributing

PRs welcome. Keep new examples self-contained, numbered (`11-…`), commented on *why* not *what*, and verified against a free-tier key before submitting.

## Links

- 📘 API docs: <https://api.astroway.info/docs/>
- 📦 TypeScript SDK: [`@astroway/sdk`](https://www.npmjs.com/package/@astroway/sdk)
- 🐍 Python SDK: [`astroway`](https://pypi.org/project/astroway/)
- 🤖 MCP server: [`@astroway/mcp`](https://www.npmjs.com/package/@astroway/mcp)
- 💰 Pricing: <https://api.astroway.info/pricing/>
