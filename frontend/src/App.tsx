import { useState, useRef, useEffect, FormEvent } from "react";
import "./App.css";

const API_URL = "http://localhost:3000/api/enquiry";

type ToolName =
  | "search_inventory"
  | "check_availability"
  | "create_appointment"
  | "find_or_create_customer"
  | "create_lead";

interface ToolCallStep {
  type: "tool_call";
  name: ToolName;
  input: Record<string, unknown>;
}

interface ToolResultStep {
  type: "tool_result";
  name: ToolName;
  result: unknown;
}

interface ParseErrorStep {
  type: "parse_error";
  raw: string;
}

interface FinalResponseStep {
  type: "final_response";
  text: string;
}

type TraceStepData =
  | ToolCallStep
  | ToolResultStep
  | ParseErrorStep
  | FinalResponseStep;

interface AgentResponse {
  trace: TraceStepData[];
  finalResponse: string;
}

interface ConversationTurn {
  role: "customer" | "agent";
  text: string;
}

type Status = "idle" | "running" | "error";

const TOOL_LABELS: Record<ToolName, string> = {
  search_inventory: "Searching inventory",
  check_availability: "Checking availability",
  create_appointment: "Booking appointment",
  find_or_create_customer: "Looking up customer",
  create_lead: "Logging enquiry",
};

function formatToolInput(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  return Object.entries(input)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("  ·  ");
}

function formatToolResult(result: unknown): string {
  if (Array.isArray(result)) {
    if (result.length === 0) return "no matches";
    return `${result.length} result${result.length > 1 ? "s" : ""}`;
  }
  if (result && typeof result === "object") {
    return Object.entries(result as Record<string, unknown>)
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${v}`)
      .join("  ·  ");
  }
  return String(result);
}

function TraceStep({ step }: { step: TraceStepData }) {
  if (step.type === "tool_call") {
    return (
      <div className="trace-node trace-node--call">
        <div className="trace-node__dot" />
        <div className="trace-node__body">
          <div className="trace-node__label">
            {TOOL_LABELS[step.name] || step.name}
          </div>
          <div className="trace-node__detail">{formatToolInput(step.input)}</div>
        </div>
      </div>
    );
  }
  if (step.type === "tool_result") {
    return (
      <div className="trace-node trace-node--result">
        <div className="trace-node__dot trace-node__dot--result" />
        <div className="trace-node__body">
          <div className="trace-node__label trace-node__label--muted">
            result
          </div>
          <div className="trace-node__detail">{formatToolResult(step.result)}</div>
        </div>
      </div>
    );
  }
  if (step.type === "parse_error") {
    return (
      <div className="trace-node trace-node--error">
        <div className="trace-node__dot trace-node__dot--error" />
        <div className="trace-node__body">
          <div className="trace-node__label">parse error</div>
          <div className="trace-node__detail">{step.raw}</div>
        </div>
      </div>
    );
  }
  if (step.type === "final_response") {
    return (
      <div className="trace-node trace-node--final">
        <div className="trace-node__dot trace-node__dot--final" />
        <div className="trace-node__body">
          <div className="trace-node__label">response ready</div>
        </div>
      </div>
    );
  }
  return null;
}

export default function App() {
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [trace, setTrace] = useState<TraceStepData[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState("");
  const traceEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [trace]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = message.trim();
    if (!text || status === "running") return;

    const historyForRequest = conversation; // snapshot before appending

    setConversation((c) => [...c, { role: "customer", text }]);
    setMessage("");
    setTrace([]);
    setStatus("running");
    setErrorText("");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyForRequest }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        setErrorText(
          data.error ||
            "Rate limit reached — please wait a moment before trying again."
        );
        setStatus("error");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data: AgentResponse = await res.json();
      setTrace(data.trace || []);
      setConversation((c) => [
        ...c,
        { role: "agent", text: data.finalResponse || "(no response)" },
      ]);
      setStatus("idle");
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__wordmark">DriveFlow AI</div>
        <div className={`app__status app__status--${status}`}>
          <span className="app__status-dot" />
          {status === "running"
            ? "agent working"
            : status === "error"
            ? "error"
            : "ready"}
        </div>
      </header>

      <main className="app__main">
        <section className="panel panel--conversation">
          <h2 className="panel__title">Customer enquiry</h2>

          <div className="conversation">
            {conversation.length === 0 && (
              <p className="conversation__empty">
                Enter a customer enquiry below — try asking about a specific
                vehicle, a price range, or booking a test drive.
              </p>
            )}
            {conversation.map((turn, i) => (
              <div key={i} className={`bubble bubble--${turn.role}`}>
                <div className="bubble__role">
                  {turn.role === "customer" ? "Customer" : "DriveFlow AI"}
                </div>
                <div className="bubble__text">{turn.text}</div>
              </div>
            ))}
            {status === "error" && (
              <div className="bubble bubble--system">
                <div className="bubble__role">System</div>
                <div className="bubble__text">{errorText}</div>
              </div>
            )}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              className="composer__input"
              placeholder="e.g. Hi, I'm Sarah Chen (sarah.chen@example.com) — looking for a Camry under $40k, can I test drive this Saturday?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              disabled={status === "running"}
            />
            <button
              className="composer__submit"
              type="submit"
              disabled={status === "running" || !message.trim()}
            >
              {status === "running" ? "Sending…" : "Send enquiry"}
            </button>
          </form>
        </section>

        <section className="panel panel--trace">
          <h2 className="panel__title">Agent trace</h2>
          <div className="trace">
            {trace.length === 0 && status !== "running" && (
              <p className="trace__empty">
                Each tool the agent calls — inventory search, availability
                check, booking — will appear here in order as it happens.
              </p>
            )}
            {trace.map((step, i) => (
              <TraceStep key={i} step={step} />
            ))}
            {status === "running" && (
              <div className="trace-node trace-node--pending">
                <div className="trace-node__dot trace-node__dot--pending" />
                <div className="trace-node__body">
                  <div className="trace-node__label">thinking…</div>
                </div>
              </div>
            )}
            <div ref={traceEndRef} />
          </div>
        </section>
      </main>
    </div>
  );
}