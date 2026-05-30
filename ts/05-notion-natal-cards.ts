/**
 * Notion: birthday → natal data on the page.
 *
 * Reads a Notion DB of "People" with birth-data properties (Date, Time,
 * City). For each row without a `Natal Synced` checkbox, fetches the
 * natal chart and writes Sun/Moon/Asc back to the page, then ticks the
 * checkbox. Run on cron (e.g. hourly) to auto-enrich.
 *
 * Deps: npm install @astroway/sdk @notionhq/client
 * Env:  ASTROWAY_API_KEY, NOTION_TOKEN, NOTION_DB_ID
 *
 * Notion DB columns required:
 *   Birth Date (date), Birth Time (text "HH:MM"), Birth City (text)
 *   Sun (text), Moon (text), Asc (text), Natal Synced (checkbox)
 */
import { Client as Notion } from '@notionhq/client';
import { Astroway } from '@astroway/sdk';

const aw = new Astroway({ apiKey: process.env.ASTROWAY_API_KEY! });
const notion = new Notion({ auth: process.env.NOTION_TOKEN! });
const DB = process.env.NOTION_DB_ID!;

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const fmt = (lon: number) => `${SIGNS[Math.floor(lon / 30) % 12]} ${(lon % 30).toFixed(1)}°`;

interface Chart {
  planets: { name: string; longitude: number }[];
  houses: { cusps: number[] };
}

// AstroWay needs coordinates + UTC offset, not a city name — resolve it with
// Open-Meteo's free geocoder (the IANA zone gives the offset for that date).
async function geocode(city: string, dateISO: string) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
  const g = (await res.json() as { results?: { latitude: number; longitude: number; timezone: string }[] }).results?.[0];
  if (!g) throw new Error(`City not found: ${city}`);
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: g.timezone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${dateISO}T12:00:00Z`)).find((p) => p.type === 'timeZoneName')!.value;
  const m = tzName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  const timezoneOffset = m ? Number(m[1]) + (m[2] ? Math.sign(Number(m[1])) * Number(m[2]) / 60 : 0) : 0;
  return { latitude: g.latitude, longitude: g.longitude, timezoneOffset };
}

const pages = await notion.databases.query({
  database_id: DB,
  filter: { property: 'Natal Synced', checkbox: { equals: false } },
  page_size: 25,
});

for (const p of pages.results as any[]) {
  const date = p.properties['Birth Date']?.date?.start;
  const time = p.properties['Birth Time']?.rich_text?.[0]?.plain_text;
  const city = p.properties['Birth City']?.rich_text?.[0]?.plain_text;
  if (!date || !time || !city) continue;

  const loc = await geocode(city, date);
  const chart = (await aw.chart.compute({
    name: 'Person', date, time: `${time}:00`, city, ...loc, houseSystem: 'P',
  })) as Chart;

  const sun = chart.planets.find((x) => x.name === 'Sun');
  const moon = chart.planets.find((x) => x.name === 'Moon');
  const asc = chart.houses.cusps[0];

  await notion.pages.update({
    page_id: p.id,
    properties: {
      Sun: { rich_text: [{ text: { content: sun ? fmt(sun.longitude) : '—' } }] },
      Moon: { rich_text: [{ text: { content: moon ? fmt(moon.longitude) : '—' } }] },
      Asc: { rich_text: [{ text: { content: fmt(asc) } }] },
      'Natal Synced': { checkbox: true },
    },
  });
  console.log(`✓ ${p.id}`);
}
