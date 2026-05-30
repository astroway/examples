/**
 * Slack bot — `/synastry` slash command.
 *
 * Two team members can compare birth charts. The command takes both
 * birth strings, hits /v1/synastry, posts a 0–100 compatibility score
 * and the top 3 cross-aspects back to the channel.
 *
 * Deps: npm install @astroway/sdk @slack/bolt
 * Env:  ASTROWAY_API_KEY, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET
 *
 * Slack app config:
 *   - Slash command /synastry → request URL https://your.host/slack/events
 *   - Bot scope: commands, chat:write
 */
import { App } from '@slack/bolt';
import { Astroway } from '@astroway/sdk';

const aw = new Astroway({ apiKey: process.env.ASTROWAY_API_KEY! });
const slack = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

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

// "1990-05-15 14:30 Kyiv" → a fully-resolved birth body.
async function parseBirth(s: string, name: string) {
  const [date, time, ...city] = s.trim().split(/\s+/);
  const loc = await geocode(city.join(' '), date!);
  return { name, date: date!, time: `${time}:00`, city: city.join(' '), ...loc, houseSystem: 'P' };
}

interface Synastry {
  compatibility: { score: number; label: string };
  crossAspects: { planet1: string; planet2: string; orb: number; type: { name: string } }[];
}

slack.command('/synastry', async ({ command, ack, respond }) => {
  await ack();
  // Expected text: "1990-05-15 14:30 Kyiv | 1992-07-20 09:00 Lviv"
  const parts = command.text.split('|').map((s) => s.trim());
  if (parts.length !== 2) {
    return respond({ text: 'Format: `/synastry YYYY-MM-DD HH:MM City | YYYY-MM-DD HH:MM City`' });
  }
  try {
    const r = (await aw.synastry.compute({
      chart1: await parseBirth(parts[0]!, 'Person A'),
      chart2: await parseBirth(parts[1]!, 'Person B'),
    })) as Synastry;

    const top = r.crossAspects.slice(0, 3)
      .map((x) => `• ${x.planet1} ${x.type.name} ${x.planet2} (orb ${x.orb.toFixed(1)}°)`)
      .join('\n');

    await respond({
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `Compatibility: ${r.compatibility.score} / 100 (${r.compatibility.label})` } },
        { type: 'section', text: { type: 'mrkdwn', text: `*Top aspects:*\n${top || 'no major aspects'}` } },
      ],
    });
  } catch (e) {
    await respond(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
  }
});

await slack.start(Number(process.env.PORT ?? 3000));
console.log('✓ Slack bot listening');
