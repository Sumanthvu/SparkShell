import mongoose from "mongoose";
import { Chat } from "../models/chat.model.js";
import { Message } from "../models/message.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const getGeminiClient = () => {
  const rawKey = process.env.GEMINI_API_KEY;
  const apiKey = rawKey?.trim();

  if (!apiKey) {
    throw new ApiError(500, "GEMINI_API_KEY is missing in server .env");
  }

  if (!apiKey.startsWith("AIza")) {
    throw new ApiError(500, "GEMINI_API_KEY format appears invalid");
  }

  return new GoogleGenerativeAI(apiKey);
};

const GEMINI_MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL?.trim(),
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash-002",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-pro",
].filter(Boolean);

const fetchAvailableGeminiModels = async (apiKey) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    const models = payload?.models || [];

    return models
      .filter((model) =>
        Array.isArray(model?.supportedGenerationMethods)
          ? model.supportedGenerationMethods.includes("generateContent")
          : false
      )
      .map((model) => String(model.name || "").replace(/^models\//, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const getRetryDelaySeconds = (error) => {
  const retryInfo = error?.errorDetails?.find(
    (detail) => detail?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
  );

  const retryDelay = retryInfo?.retryDelay;
  if (!retryDelay) return null;

  const seconds = Number.parseInt(String(retryDelay).replace("s", ""), 10);
  return Number.isNaN(seconds) ? null : seconds;
};

const createNewChat = asyncHandler(async (req, res) => {
  const newChat = await Chat.create({
    userId: req.user._id,
    title: "New Chat",
  });

  return res.status(201).json(new ApiResponse(201, newChat, ""));
});

const getUserChats = asyncHandler(async (req, res) => {
  const chats = await Chat.find({ userId: req.user._id }).sort({
    updatedAt: -1,
  });
  return res.status(200).json(new ApiResponse(200, chats, ""));
});

const getChatMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const messages = await Message.find({ chatId }).sort({ createdAt: 1 });
  return res.status(200).json(new ApiResponse(200, messages, ""));
});

const sendMessage = asyncHandler(async (req, res) => {
  const { chatId, content } = req.body;

  if (!content) throw new ApiError(400, "Content required");

  let currentChatId = chatId;

  if (!currentChatId) {
    const newChat = await Chat.create({
      userId: req.user._id,
      title: content.substring(0, 30),
    });
    currentChatId = newChat._id;
  }

  const userMessage = await Message.create({
    chatId: currentChatId,
    senderRole: "user",
    content,
  });

  const history = await Message.find({ chatId: currentChatId }).sort({
    createdAt: 1,
  });
  const googleHistory = history.map((msg) => ({
    role: msg.senderRole === "ai" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  let aiText = "";

  try {
    const rawKey = process.env.GEMINI_API_KEY;
    const apiKey = rawKey?.trim();
    const genAI = getGeminiClient();
    let lastModelError = null;

    const discoveredModels = await fetchAvailableGeminiModels(apiKey);
    const modelCandidates = [
      ...new Set([...GEMINI_MODEL_CANDIDATES, ...discoveredModels]),
    ];

    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const priorConversation = googleHistory
          .slice(0, -1)
          .map((entry) => {
            const role = entry.role === "model" ? "Assistant" : "User";
            const text = entry?.parts?.[0]?.text || "";
            return `${role}: ${text}`;
          })
          .join("\n");

        const prompt = priorConversation
          ? `${priorConversation}\nUser: ${content}\nAssistant:`
          : content;

        const result = await model.generateContent(prompt);
        aiText = result.response.text();
        lastModelError = null;
        break;
      } catch (modelError) {
        lastModelError = modelError;

        const notFound =
          modelError?.status === 404 ||
          /not found|is not found|not supported/i.test(modelError?.message || "");

        const rateLimited = modelError?.status === 429;

        if (notFound || rateLimited) {
          continue;
        }

        throw modelError;
      }
    }

    if (lastModelError || !aiText) {
      throw lastModelError || new Error("No compatible Gemini model produced output");
    }
  } catch (error) {
    const reason = error?.errorDetails?.[0]?.reason;

    if (reason === "API_KEY_INVALID") {
      throw new ApiError(
        502,
        "Gemini API key is invalid. Please generate a valid server API key and update GEMINI_API_KEY in .env"
      );
    }

    if (reason === "SERVICE_DISABLED") {
      throw new ApiError(
        502,
        "Generative Language API is disabled for this key/project. Enable the API in Google Cloud and retry"
      );
    }

    if (error?.status === 403) {
      throw new ApiError(
        502,
        "Gemini API request is forbidden for this key/project. Check API key restrictions and enabled APIs in Google Cloud"
      );
    }

    if (error?.status === 429) {
      const retryAfterSeconds = getRetryDelaySeconds(error);
      throw new ApiError(
        429,
        retryAfterSeconds
          ? `Gemini quota/rate limit exceeded. Please retry after about ${retryAfterSeconds}s or upgrade quota/billing.`
          : "Gemini quota/rate limit exceeded. Please retry shortly or upgrade quota/billing."
      );
    }

    const modelNotFound =
      error?.status === 404 ||
      /not found|is not found|not supported/i.test(error?.message || "");

    if (modelNotFound) {
      throw new ApiError(
        502,
        "No compatible Gemini model found for this API key/project. Set GEMINI_MODEL in .env to a supported model (example: gemini-1.5-flash-latest)."
      );
    }

    console.error("Gemini request failed:", error);
    throw new ApiError(
      502,
      error?.message || "Failed to generate AI response from Gemini"
    );
  }

  const aiMessage = await Message.create({
    chatId: currentChatId,
    senderRole: "ai",
    content: aiText,
  });

  await Chat.findByIdAndUpdate(currentChatId, { updatedAt: new Date() });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { userMessage, aiMessage, chatId: currentChatId },
        "",
      ),
    );
});

export { createNewChat, getUserChats, getChatMessages, sendMessage };
