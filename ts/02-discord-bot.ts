/**
 * Discord bot — /chart slash command.
 *
 * Registers a single global slash command that takes birth details
 * and replies with key natal data (Sun/Moon/Asc) plus a chart-wheel SVG.
 * The backend geocodes the city, so callers only type a place name.
 *
 * Deps: npm install @astroway/sdk discord.js
 * Env:  ASTROWAY_API_KEY, DISCORD_TOKEN, DISCORD_APP_ID
 *
 * One-time bootstrap to register the command:
 *   tsx 02-discord-bot.ts --register
 * Then run normally:
 *   tsx 02-discord-bot.ts
 */
import { Astroway } from '@astroway/sdk';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } from 'discord.js';

const aw = new Astroway({ apiKey: process.env.ASTROWAY_API_KEY! });
const TOKEN = process.env.DISCORD_TOKEN!;
const APP_ID = process.env.DISCORD_APP_ID!;

// Planet longitude (0–360) → "Taurus 24.4°"
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const fmt = (lon: number) => `${SIGNS[Math.floor(lon / 30) % 12]} ${(lon % 30).toFixed(1)}°`;

interface Chart {
  planets: { name: string; longitude: number }[];
  houses: { cusps: number[] };
}

// AstroWay computes from coordinates + UTC offset, not city names — resolve the
// city yourself. Open-Meteo's geocoder is free and key-less; the IANA timezone
// gives the historically-correct offset for the birth date (DST included).
async function geocode(city: string, dateISO: string) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
  const g = (await res.json() as { results?: { name: string; latitude: number; longitude: number; timezone: string }[] }).results?.[0];
  if (!g) throw new Error(`City not found: ${city}`);
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: g.timezone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${dateISO}T12:00:00Z`)).find((p) => p.type === 'timeZoneName')!.value;
  const m = tzName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  const timezoneOffset = m ? Number(m[1]) + (m[2] ? Math.sign(Number(m[1])) * Number(m[2]) / 60 : 0) : 0;
  return { city: g.name, latitude: g.latitude, longitude: g.longitude, timezoneOffset };
}

const command = new SlashCommandBuilder()
  .setName('chart')
  .setDescription('Natal chart from birth date/time/place')
  .addStringOption((o) => o.setName('date').setDescription('YYYY-MM-DD').setRequired(true))
  .addStringOption((o) => o.setName('time').setDescription('HH:MM').setRequired(true))
  .addStringOption((o) => o.setName('city').setDescription('City').setRequired(true));

if (process.argv.includes('--register')) {
  await new REST().setToken(TOKEN).put(Routes.applicationCommands(APP_ID), { body: [command.toJSON()] });
  console.log('✓ Slash command registered');
  process.exit(0);
}

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

bot.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== 'chart') return;
  await i.deferReply();
  try {
    const [date, time, cityInput] = ['date', 'time', 'city'].map((k) => i.options.getString(k, true));
    const loc = await geocode(cityInput, date);
    const birth = { name: 'Discord', date, time: `${time}:00`, ...loc, houseSystem: 'P' };

    const chart = (await aw.chart.compute(birth)) as Chart;
    const sun = chart.planets.find((p) => p.name === 'Sun');
    const moon = chart.planets.find((p) => p.name === 'Moon');
    const asc = chart.houses.cusps[0]; // 1st house cusp = Ascendant

    // Western wheel comes back as an inline SVG string in { svg }.
    const wheel = (await aw.render.wheelWestern(birth)) as { svg: string };
    const svg = Buffer.from(wheel.svg, 'utf8');

    await i.editReply({
      content: `**Sun:** ${sun ? fmt(sun.longitude) : '—'}\n**Moon:** ${moon ? fmt(moon.longitude) : '—'}\n**ASC:** ${fmt(asc)}`,
      files: [new AttachmentBuilder(svg, { name: 'chart.svg' })],
    });
  } catch (e) {
    await i.editReply(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
  }
});

bot.login(TOKEN);
console.log('✓ Bot online');
