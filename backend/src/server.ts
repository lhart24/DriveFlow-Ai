import express from "express";
import cors from "cors";
import { runAgent } from "./agent.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
    res.json({
        message: "DriveFlow AI backend is running"
    });
});

app.post("/api/enquiry", async (req, res) => {
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