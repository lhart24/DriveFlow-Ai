import OpenAI from 'openai';
import { executeTool } from './tools/toolExecutor.js';
import { validateToolInput, ToolName } from './tools.js';

const client = new OpenAI({
  apiKey: process.env.NEBIUS_API_KEY,
  baseURL: 'https://api.tokenfactory.nebius.com/v1/',
});

const FAST_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';
const REASONING_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
const MAX_STEPS = 8;
const DATE_LOOKUP_DAYS = 14;

interface ConversationMessage {
  role: 'customer' | 'agent';
  text: string;
}

type TraceStep =
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'parse_error'; raw: string }
  | { type: 'final_response'; text: string };

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function stripCodeFences(text: string): string {
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) return fenceMatch[1].trim();
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

function cleanModelOutput(raw: string): string {
  return stripCodeFences(stripThinkTags(raw));
}

/**
 * Builds a weekday -> ISO date lookup table so the model never has to do
 * date arithmetic itself. "This Saturday" / "next Tuesday" resolution is
 * done here in code, not left to the LLM.
 */
function buildDateLookupTable(referenceDate: Date, daysAhead: number): string {
  const rows: string[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const label = i === 0 ? `today (${weekday})` : i === 1 ? `tomorrow (${weekday})` : weekday;
    rows.push(`${label} = ${iso}`);
  }
  return rows.join('\n');
}

export async function runAgent(conversationHistory: ConversationMessage[]) {
  const trace: TraceStep[] = [];
  const referenceDate = new Date();
  const today = referenceDate.toISOString().split('T')[0];
  const weekday = referenceDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dateLookupTable = buildDateLookupTable(referenceDate, DATE_LOOKUP_DAYS);

  // IDs we've actually seen come back from tool results this conversation.
  // create_appointment / create_lead may only reference IDs in these sets —
  // this is enforced in code, not just requested in the prompt.
  const knownCustomerIds = new Set<number>();
  const knownVehicleIds = new Set<number>();

  const SYSTEM_PROMPT = `Today's date is ${today}, which is a ${weekday}.

Here is a lookup table of upcoming dates — use it directly instead of calculating dates yourself:
${dateLookupTable}

When a customer mentions a relative day (e.g. "this Saturday", "next Tuesday"), look up the matching date in the table above rather than computing it.

You are a dealership assistant agent with these tools:

- search_inventory(make?, model?, maxPrice?) - search available vehicles
- check_availability(vehicleId, appointmentTime) - check test-drive slot
- create_appointment(customerId, vehicleId, appointmentTime) - book a test drive
- find_or_create_customer(name, email, phone?) - look up/create customer, returns a customer record with a numeric id
- create_lead(customerId, vehicleId?, enquiry) - log the enquiry

IMPORTANT: customerId and vehicleId must always be actual numeric IDs returned from a previous tool call — never invent or guess an ID. Always call find_or_create_customer first if you don't yet have a real customer ID for this conversation, before calling create_appointment or create_lead.

IMPORTANT: "make" means the manufacturer/brand (e.g. Toyota, Mazda, Ford). "model" means the specific vehicle model (e.g. Camry, RAV4, CX-5). Never put a model name into the make field or vice versa. If the customer only mentions a model name without a brand, use the model field only and leave make empty.

IMPORTANT: You do not have the customer's name or email unless they provide it in their message or an earlier message in this conversation. Answering general inventory questions (availability, pricing) doesn't require contact info. But before creating a lead, checking test-drive availability, or booking an appointment, you must have the customer's name and email — if you don't have them, do NOT call find_or_create_customer with guessed or placeholder values. Instead, respond with a final_response asking for their name and email so you can proceed.

IMPORTANT: When searching inventory, always pass every filter criteria the customer mentioned (make, model, maxPrice) — don't omit a filter just because it happens to narrow results to one option anyway.

IMPORTANT: You have access to the full conversation history below, including earlier customer messages and your own prior responses. Use it to answer follow-up questions like "what car did I just ask about?" or to remember details (name, email, vehicle interest) the customer already gave earlier in this conversation — do not ask for information they already provided.

When writing the final response, be precise about what the customer actually said versus what you found for them — don't imply they specified a model, vehicle, or preference they didn't mention. If a search returned only one matching vehicle, present it as "I found one option that matches" rather than assuming it's something they already wanted.

Respond ONLY with JSON in one of these two forms:
{"action": "call_tool", "tool": "<tool_name>", "input": {...}}
{"action": "final_response", "text": "<your friendly reply to the customer>"}

Always confirm availability before booking. No markdown, no explanation, just the JSON object.`;

  const history: string[] = conversationHistory.map(
    (turn) => `${turn.role === 'customer' ? 'Customer' : 'Agent'}: ${turn.text}`
  );

  for (let step = 0; step < MAX_STEPS; step++) {
    let raw: string;
    try {
      const response = await client.chat.completions.create({
        model: FAST_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: history.join('\n\n') },
        ],
      });
      raw =
        response.choices[0].message.content ||
        (response.choices[0].message as any).reasoning_content ||
        '';
    } catch (err) {
      trace.push({
        type: 'parse_error',
        raw: `Model request failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      break;
    }

    const cleaned = cleanModelOutput(raw);

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      trace.push({ type: 'parse_error', raw: cleaned });
      break;
    }

    if (parsed.action === 'final_response') {
      let finalText = parsed.text;
      try {
        const polished = await client.chat.completions.create({
          model: REASONING_MODEL,
          messages: [
            {
              role: 'system',
              content:
                'Rewrite the following dealership response to be warm, professional, and concise. Output ONLY the rewritten customer-facing text — no explanation, no notes about your changes, no meta-commentary, no parenthetical remarks about word count or style choices.',
            },
            { role: 'user', content: parsed.text },
          ],
        });
        const polishedRaw =
          polished.choices[0].message.content ||
          (polished.choices[0].message as any).reasoning_content ||
          parsed.text;
        finalText = cleanModelOutput(polishedRaw);
      } catch (err) {
        // Polishing is a nice-to-have — fall back to the unpolished text
        // rather than losing an otherwise-successful response.
        finalText = parsed.text;
      }

      trace.push({ type: 'final_response', text: finalText });
      return { trace, finalResponse: finalText };
    }

    if (parsed.action === 'call_tool') {
      const toolName: string = parsed.tool;
      const input: Record<string, unknown> = parsed.input || {};

      trace.push({ type: 'tool_call', name: toolName, input });

      // 1. Schema validation (required fields present, basic types correct)
      const validation = validateToolInput(toolName, input);
      if (!validation.valid) {
        const errorMsg = `Invalid input for ${toolName}: ${validation.errors.join('; ')}`;
        trace.push({ type: 'tool_result', name: toolName, result: { error: errorMsg } });
        history.push(`Tool ${toolName} called with ${JSON.stringify(input)} -> error: ${errorMsg}`);
        continue;
      }

      // 2. ID-provenance enforcement — customerId/vehicleId used for booking
      // or lead creation must have actually come back from a prior tool
      // result in this conversation, not be invented by the model.
      if (toolName === 'create_appointment' || toolName === 'create_lead') {
        const customerId = input.customerId as number | undefined;
        const vehicleId = input.vehicleId as number | undefined;
        const idErrors: string[] = [];

        if (customerId !== undefined && !knownCustomerIds.has(customerId)) {
          idErrors.push(
            `customerId ${customerId} was not returned by find_or_create_customer in this conversation`
          );
        }
        if (vehicleId !== undefined && !knownVehicleIds.has(vehicleId)) {
          idErrors.push(
            `vehicleId ${vehicleId} was not returned by search_inventory in this conversation`
          );
        }

        if (idErrors.length > 0) {
          const errorMsg = `Rejected ${toolName} call: ${idErrors.join('; ')}. Call find_or_create_customer / search_inventory first to get real IDs.`;
          trace.push({ type: 'tool_result', name: toolName, result: { error: errorMsg } });
          history.push(`Tool ${toolName} called with ${JSON.stringify(input)} -> error: ${errorMsg}`);
          continue;
        }
      }

      // 3. Execute the tool, catching runtime failures so one bad call
      // doesn't crash the whole request.
      let result: unknown;
      try {
        result = await executeTool(toolName as ToolName, input);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        trace.push({ type: 'tool_result', name: toolName, result: { error: errorMsg } });
        history.push(`Tool ${toolName} called with ${JSON.stringify(input)} -> error: ${errorMsg}`);
        continue;
      }

      trace.push({ type: 'tool_result', name: toolName, result });

      // Track IDs surfaced by successful calls for the provenance check above.
      if (toolName === 'find_or_create_customer' && result && typeof result === 'object') {
        const id = (result as any).id;
        if (typeof id === 'number') knownCustomerIds.add(id);
      }
      if (toolName === 'search_inventory' && Array.isArray(result)) {
        for (const vehicle of result) {
          if (vehicle && typeof vehicle.id === 'number') knownVehicleIds.add(vehicle.id);
        }
      }

      history.push(`Tool ${toolName} called with ${JSON.stringify(input)} -> result: ${JSON.stringify(result)}`);
    }
  }

  return { trace, finalResponse: 'Sorry, I ran into trouble processing that.' };
}