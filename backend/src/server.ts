import 'dotenv/config';
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { runAgent } from "./agent.js";

const app = express();

app.use(cors());
app.use(express.json());

// Rate limiter for the agent endpoint — each request triggers 2+ LLM calls
// (Nano for tool orchestration, Super/Ultra for the final response polish),
// so this protects your Nebius credits from being drained by rapid or
// automated requests, while still comfortably allowing a judge to try
// several different enquiries during review.
const enquiryLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minute window
  max: 15, // 15 requests per IP per window — generous for manual testing
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Rate limit reached. Please wait a few minutes before sending another enquiry.",
  },
});

app.get("/", (_req, res) => {
    res.json({
        message: "DriveFlow AI backend is running"
    });
});

app.post("/api/enquiry", enquiryLimiter, async (req, res) => {
    try {
        const { message } = req.body;
        console.log("Customer enquiry:", message);

        const result = await runAgent(message);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Agent failed", details: String(err) });
    }
});

app.listen(3000, () => {
    console.log("DriveFlow AI running on http://localhost:3000");
});