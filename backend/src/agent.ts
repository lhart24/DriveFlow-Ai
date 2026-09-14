import OpenAI from 'openai';
import { executeTool } from './tools/toolExecutor.js';

const client = new OpenAI({
  apiKey: process.env.NEBIUS_API_KEY,
  baseURL: 'https://api.tokenfactory.nebius.com/v1/',
});

const FAST_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'; // keep whatever you already set
const REASONING_MODEL = 'nvidia/nemotron-3-super-120b-a12b'; // keep whatever you already set

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export async function runAgent(customerMessage: string) {
  const trace: any[] = [];
  const today = new Date().toISOString().split('T')[0];

  const SYSTEM_PROMPT = `Today's date is ${today}, which is a ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}. When a customer mentions a relative day (e.g. "this Saturday", "next Tuesday"), calculate the actual upcoming date for that day of the week based on today's date — do not use today's date unless the customer explicitly said "today". You are a dealership assistant agent...
- search_inventory(make?, model?, maxPrice?) - search available vehicles
- check_availability(vehicleId, appointmentTime) - check test-drive slot
- create_appointment(customerId, vehicleId, appointmentTime) - book a test drive
- find_or_create_customer(name, email, phone?) - look up/create customer, returns a customer record with a numeric id
- create_lead(customerId, vehicleId?, enquiry) - log the enquiry

IMPORTANT: customerId and vehicleId must always be actual numeric IDs returned from a previous tool call — never invent or guess an ID. Always call find_or_create_customer first if you don't yet have a real customer ID for this conversation, before calling create_appointment or create_lead.


IMPORTANT: When searching inventory, always pass every filter criteria the customer mentioned (make, model, maxPrice) — don't omit a filter just because it happens to narrow results to one option anyway.

When writing the final response, be precise about what the customer actually said versus what you found for them — don't imply they specified a model, vehicle, or preference they didn't mention. If a search returned only one matching vehicle, present it as "I found one option that matches" rather than assuming it's something they already wanted.

Respond ONLY with JSON in one of these two forms:
{"action": "call_tool", "tool": "<tool_name>", "input": {...}}
{"action": "final_response", "text": "<your friendly reply to the customer>"}

Always confirm availability before booking. No markdown, no explanation, just the JSON object.`;

  const history: string[] = [`Customer: ${customerMessage}`];

  for (let step = 0; step < 8; step++) {
    const response = await client.chat.completions.create({
      model: FAST_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: history.join('\n\n') },
      ],
    });

    const raw = response.choices[0].message.content
      || (response.choices[0].message as any).reasoning_content
      || '';
    const cleaned = stripThinkTags(raw);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      trace.push({ type: 'parse_error', raw: cleaned });
      break;
    }

    if (parsed.action === 'final_response') {
      const polished = await client.chat.completions.create({
        model: REASONING_MODEL,
        messages: [
          { role: 'system', content: 'Rewrite this dealership response to be warm, professional, and concise.' },
          { role: 'user', content: parsed.text },
        ],
      });
      const finalText = stripThinkTags(
        polished.choices[0].message.content || (polished.choices[0].message as any).reasoning_content || parsed.text
      );
      trace.push({ type: 'final_response', text: finalText });
      return { trace, finalResponse: finalText };
    }

    if (parsed.action === 'call_tool') {
      trace.push({ type: 'tool_call', name: parsed.tool, input: parsed.input });
      const result = await executeTool(parsed.tool, parsed.input);
      trace.push({ type: 'tool_result', name: parsed.tool, result });
      history.push(`Tool ${parsed.tool} called with ${JSON.stringify(parsed.input)} -> result: ${JSON.stringify(result)}`);
    }
  }

  return { trace, finalResponse: 'Sorry, I ran into trouble processing that.' };
}