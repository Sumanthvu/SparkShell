import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import chatRouter from "./routes/chat.routes.js"; // Crucial for reading JWT cookies!

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true, // Required to allow cookies to pass between ports
  })
);

// Built-in middleware to parse incoming JSON and URL-encoded data
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Middleware to securely parse and set cookies in the user's browser
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
// A simple health check route to verify the server is running
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "⚡ Renzo API is running" });
});

// Import your user routes
import userRoutes from "./routes/user.routes.js";

// Mount the user routes
// Every route inside user.routes.js will now start with /api/users
// (e.g., http://localhost:5000/api/users/register)
app.use("/api/users", userRoutes);
app.use("/api/v1/chats", chatRouter);

import { ApiError } from './utils/ApiError.js';

app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
      data: null
    });
  }

  // If it's an unknown error, send a generic 500 JSON
  console.error("Unhandled Error:", err);
  return res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Export the app to be used in index.js
export { app };