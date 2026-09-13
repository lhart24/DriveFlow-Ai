import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
    res.json({
        message: "DriveFlow AI backend is running"
    });
});

app.post("/api/enquiry", (req, res) => {
    const { message } = req.body;

    console.log("Customer enquiry:", message);

    res.json({
        success: true,
        enquiry: message
    });
});

app.listen(3000, () => {
    console.log("DriveFlow AI running on http://localhost:3000");
});