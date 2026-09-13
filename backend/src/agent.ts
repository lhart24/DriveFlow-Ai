import OpenAI from 'openai';
import { executeTool } from './tools/toolExecutor.js';

const client = new OpenAI({
  apiKey: process.env.NEBIUS_API_KEY,
  baseURL: 'https://api.tokenfactory.nebius.com/v1/',
});

const FAST_MODEL = 'nvidia/nemotron-3-nano-30b-a3b';
const REASONING_MODEL = 'nvidia/nemotron-3-super-120b-a12b'; // or ultra, if available on your key

const SYSTEM_PROMPT = `You are a dealership assistant agent. You have these tools:

- search_inventory(make?, model?, maxPrice?) - search available vehicles
- check_availability(vehicleId, appointmentTime) - check test-drive slot
- create_appointment(customerId, vehicleId, appointmentTime) - book a test drive
- find_or_create_customer(name, email, phone?) - look up/create customer
- create_lead(customerId, vehicleId?, enquiry) - log the enquiry

Respond ONLY with JSON in one of these two forms:
{"action": "call_tool", "tool": "<tool_name>", "input": {...}}
{"action": "final_response", "text": "<your friendly reply to the customer>"}

Always confirm availability before booking. No markdown, no explanation, just the JSON object.`;

function stripThinkTags(text: string): string {
  // Nemotron reasoning models may wrap reasoning in <think> tags
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export async function runAgent(customerMessage: string) {
  const trace: any[] = [];
  const history: string[] = [`Customer: ${customerMessage}`];

  for (let step = 0; step < 8; step++) { // safety cap on loop iterations
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
      // Optional: re-generate the final response with the stronger model for quality
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