/**
 * OpenAI function-calling — let GPT read birth charts on demand.
 *
 * Defines a single `get_natal_chart` tool. The user asks GPT a question
 * involving a birth date — GPT calls the tool, gets JSON back, reasons
 * over it. The simplest LLM ↔ astrology integration: no MCP needed if
 * you already talk to OpenAI directly.
 *
 * Deps: npm install @astroway/sdk openai
 * Env:  ASTROWAY_API_KEY, OPENAI_API_KEY
 */
import { Astroway } from '@astroway/sdk';
import OpenAI from 'openai';

const aw = new Astroway({ apiKey: process.env.ASTROWAY_API_KEY! });
const ai = new OpenAI();

// AstroWay needs coordinates + UTC offset, not a city name. Resolve the city
// with Open-Meteo's free geocoder; the IANA zone yields the historically-correct
// offset for the birth date.
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

const tools: OpenAI.Chat.ChatCompletionTool[] = [{
  type: 'function',
  function: {
    name: 'get_natal_chart',
    description: 'Calculate a natal (birth) chart with planet positions, houses and aspects.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Birth date YYYY-MM-DD' },
        time: { type: 'string', description: 'Birth time HH:MM:SS in 24h' },
        city: { type: 'string', description: 'Birth city — geocoded server-side' },
      },
      required: ['date', 'time', 'city'],
    },
  },
}];

async function ask(question: string): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: 'You are an astrology assistant. Use the tool to fetch chart data, then explain in plain language.' },
    { role: 'user', content: question },
  ];

  // Loop: model may call the tool, we feed the result back, model gives a final answer.
  for (let turn = 0; turn < 4; turn++) {
    const r = await ai.chat.completions.create({ model: 'gpt-4o-mini', messages, tools });
    const msg = r.choices[0]!.message;
    messages.push(msg);
    if (!msg.tool_calls?.length) return msg.content ?? '';
    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments) as { date: string; time: string; city: string };
      const loc = await geocode(args.city, args.date);
      const chart = await aw.chart.compute({
        name: 'Subject', date: args.date, time: args.time, city: args.city,
        ...loc, houseSystem: 'P',
      });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(chart).slice(0, 8000), // cap context
      });
    }
  }
  return '(model gave up after 4 turns)';
}

const reply = await ask("Tell me about Albert Einstein's natal chart. He was born 1879-03-14 11:30 in Ulm, Germany.");
console.log(reply);
