import dotenv from "dotenv";
dotenv.config();

// Vercel serverless entry. @vercel/node invokes the default export as the
// request handler; an Express app is itself a (req, res) handler.
// The DB connection is established lazily per-request inside app.js.
import app from "../app.js";

export default app;
