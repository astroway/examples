/**
 * Daily horoscope SMS via Twilio.
 *
 * Reads users' birth data from a JSON file, generates a personalised
 * transit-based reading for today via /interpret/transits (one LLM call
 * per user), sends each over Twilio SMS. Run as a daily cron at 07:00.
 *
 * Deps: npm install @astroway/sdk twilio
 * Env:  ASTROWAY_API_KEY, TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
 *
 * users.json shape:
 *   [{ "phone": "+380501234567", "date": "1990-05-15", "time": "14:30:00",
 *      "latitude": 50.45, "longitude": 30.52, "timezoneOffset": 3 }, ...]
 */
import { Astroway } from '@astroway/sdk';
import twilio from 'twilio';
import { readFileSync } from 'node:fs';

interface User {
  phone: string;
  name: string;
  date: string;
  time: string;
  city: string;
  latitude: number;
  longitude: number;
  timezoneOffset: number;
}

const aw = new Astroway({ apiKey: process.env.ASTROWAY_API_KEY! });
const sms = twilio(process.env.TWILIO_SID!, process.env.TWILIO_TOKEN!);
const from = process.env.TWILIO_FROM!;

const users: User[] = JSON.parse(readFileSync(process.argv[2] ?? 'users.json', 'utf8'));
const today = new Date().toISOString().slice(0, 10);

for (const u of users) {
  try {
    const reading = await aw.interpret.transits({
      name: u.name,
      date: u.date,
      time: u.time,
      city: u.city,
      timezoneOffset: u.timezoneOffset,
      latitude: u.latitude,
      longitude: u.longitude,
      houseSystem: 'P',
      transitDate: today,
      disclaimer_inline: false,
    });
    const text = (reading as { interpretation?: string }).interpretation ?? '';
    await sms.messages.create({ from, to: u.phone, body: text.slice(0, 320) });
    console.log(`✓ ${u.phone}`);
  } catch (e) {
    console.error(`✗ ${u.phone}: ${e instanceof Error ? e.message : e}`);
  }
}
