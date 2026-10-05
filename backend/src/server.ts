import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { runAgent, type ConversationMessage, type ProposedAction } from './agent.js';
import { executeConfirmedAction, getVehicleSummary } from './db/database.js';

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_CONFIRMATIONS = 100;

interface PendingConfirmation {
  action: ProposedAction;
  summary: string;
  expiresAt: number;
}

const pendingConfirmations = new Map<string, PendingConfirmation>();

app.use(cors());
app.use(express.json({ limit: '16kb' }));

const enquiryLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit reached. Please wait a few minutes before sending another enquiry.' },
});

const confirmationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit reached. Please wait a few minutes before confirming an action.' },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pruneConfirmations() {
  const now = Date.now();
  for (const [token, confirmation] of pendingConfirmations) {
    if (confirmation.expiresAt <= now) pendingConfirmations.delete(token);
  }
}

async function buildConfirmationSummary(action: ProposedAction): Promise<string> {
  const { input } = action;
  const contact = `${input.name} (${input.email})${input.phone ? `, ${input.phone}` : ''}`;

  if (action.type === 'appointment') {
    const vehicle = await getVehicleSummary(action.input.vehicleId);
    if (!vehicle || vehicle.status !== 'available') {
      throw new Error('The selected vehicle is no longer available.');
    }
    const label = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    return `Book a test drive for ${label} at ${action.input.appointmentTime} for ${contact}.`;
  }

  const vehicle = action.input.vehicleId === undefined
    ? undefined
    : await getVehicleSummary(action.input.vehicleId);
  if (action.input.vehicleId !== undefined && !vehicle) {
    throw new Error('The selected vehicle no longer exists.');
  }
  const vehicleText = vehicle ? ` for ${vehicle.year} ${vehicle.make} ${vehicle.model}` : '';
  return `Save this enquiry${vehicleText} for ${contact}: ${action.input.enquiry}`;
}

app.get('/', (_req, res) => {
  res.json({ message: 'DriveFlow AI backend is running' });
});

app.post('/api/enquiry', enquiryLimiter, async (req, res) => {
  const body: unknown = req.body;
  if (!isRecord(body) || typeof body.message !== 'string') {
    res.status(400).json({ error: 'A message is required.' });
    return;
  }

  const message = body.message.trim();
  if (message.length === 0 || message.length > 2000) {
    res.status(400).json({ error: 'Message must be between 1 and 2000 characters.' });
    return;
  }

  const rawHistory = body.history === undefined ? [] : body.history;
  if (!Array.isArray(rawHistory) || rawHistory.length > 20) {
    res.status(400).json({ error: 'Conversation history is invalid or too long.' });
    return;
  }

  const history: ConversationMessage[] = [];
  let historyCharacters = 0;
  for (const turn of rawHistory) {
    if (
      !isRecord(turn) ||
      (turn.role !== 'customer' && turn.role !== 'agent') ||
      typeof turn.text !== 'string' ||
      turn.text.length === 0 ||
      turn.text.length > 2000
    ) {
      res.status(400).json({ error: 'Conversation history contains an invalid message.' });
      return;
    }
    historyCharacters += turn.text.length;
    if (historyCharacters > 10000) {
      res.status(400).json({ error: 'Conversation history is too long.' });
      return;
    }
    history.push({ role: turn.role, text: turn.text });
  }

  try {
    pruneConfirmations();
    const result = await runAgent([...history, { role: 'customer', text: message }]);
    const { pendingAction, ...publicResult } = result;
    if (!pendingAction) {
      res.json(publicResult);
      return;
    }

    if (pendingConfirmations.size >= MAX_PENDING_CONFIRMATIONS) {
      res.status(503).json({ error: 'Confirmation service is busy. Please try again shortly.' });
      return;
    }

    const summary = await buildConfirmationSummary(pendingAction);
    const token = randomUUID();
    pendingConfirmations.set(token, {
      action: pendingAction,
      summary,
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    });

    res.json({
      ...publicResult,
      pendingConfirmation: { token, type: pendingAction.type, summary },
    });
  } catch (err) {
    console.error(
      'Enquiry processing failed',
      err instanceof Error ? err.name : 'UnknownError',
    );
    res.status(500).json({ error: 'The enquiry could not be processed safely. Please try again.' });
  }
});

app.post('/api/enquiry/confirm', confirmationLimiter, async (req, res) => {
  const body: unknown = req.body;
  if (
    !isRecord(body) ||
    typeof body.token !== 'string' ||
    body.token.length !== 36 ||
    typeof body.approved !== 'boolean'
  ) {
    res.status(400).json({ error: 'A valid confirmation token and decision are required.' });
    return;
  }

  pruneConfirmations();
  const pending = pendingConfirmations.get(body.token);
  if (!pending) {
    res.status(410).json({ error: 'This confirmation has expired or has already been used.' });
    return;
  }

  pendingConfirmations.delete(body.token);
  if (!body.approved) {
    res.json({ cancelled: true, message: 'No changes were made.' });
    return;
  }

  try {
    const action = pending.action.type === 'appointment'
      ? { type: 'appointment' as const, ...pending.action.input }
      : { type: 'lead' as const, ...pending.action.input };
    await executeConfirmedAction(action);
    res.json({
      confirmed: true,
      message: pending.action.type === 'appointment'
        ? 'The test drive has been booked.'
        : 'The enquiry has been saved.',
    });
  } catch (err) {
    console.error(
      'Confirmed action failed',
      err instanceof Error ? err.name : 'UnknownError',
    );
    res.status(409).json({
      error: err instanceof Error &&
        (err.message === 'The selected vehicle is no longer available.' ||
          err.message === 'That test-drive time is no longer available.' ||
          err.message === 'The selected vehicle no longer exists.')
        ? err.message
        : 'The action could not be completed. No confirmation is still active; please start again.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`DriveFlow AI running on port ${PORT}`);
});
