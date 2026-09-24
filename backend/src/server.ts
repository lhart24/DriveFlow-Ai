import 'dotenv/config';
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { runAgent } from "./agent.js";

const app = express();

app.use(cors());
app.use(express.json());

const enquiryLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
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
        const { message, history } = req.body;
        console.log("Customer enquiry:", message);

        const conversationHistory = [
          ...(history || []),
          { role: 'customer', text: message },
        ];

        const result = await runAgent(conversationHistory);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Agent failed", details: String(err) });
    }
});

app.listen(3000, () => {
    console.log("DriveFlow AI running on http://localhost:3000");
});