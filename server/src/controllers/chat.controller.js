import mongoose from "mongoose";
import { Chat } from "../models/chat.model.js";
import { Message } from "../models/message.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  findChatWithReadAccess,
  findChatWithWriteAccess,
  getAccessLevel,
} from "../utils/chatAccess.js";

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

const sanitizeAttachments = (attachments) => {
  if (!Array.isArray(attachments)) return [];

  return attachments.slice(0, 20).map((item) => ({
    name: String(item?.name || "file").slice(0, 300),
    relativePath: String(item?.relativePath || item?.name || "file").slice(0, 500),
    type: String(item?.type || "application/octet-stream").slice(0, 120),
    size: Number(item?.size || 0),
    previewDataUrl: item?.previewDataUrl ? String(item.previewDataUrl) : undefined,
    textContent: item?.textContent ? String(item.textContent).slice(0, 12000) : undefined,
  }));
};

const buildGeminiPartsFromMessage = (message, { includeAttachmentData = true } = {}) => {
  const parts = [];

  if (message?.content) {
    parts.push({ text: message.content });
  }

  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];

  for (const attachment of attachments) {
    const fileName = attachment?.relativePath || attachment?.name || "file";
    const mimeType = attachment?.type || "application/octet-stream";

    if (!includeAttachmentData) {
      parts.push({ text: `Previously attached file: ${fileName}` });
      continue;
    }

    if (mimeType.startsWith("image/") && attachment?.previewDataUrl?.includes(",")) {
      const base64Data = attachment.previewDataUrl.split(",")[1];
      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
      parts.push({ text: `Attached image: ${fileName}` });
      continue;
    }

    if (attachment?.textContent) {
      parts.push({ text: `Attached file (${fileName}):\n${attachment.textContent}` });
      continue;
    }

    parts.push({
      text: `Attached file: ${fileName} (${mimeType}, ${attachment?.size || 0} bytes)`,
    });
  }

  return parts.length ? parts : [{ text: "" }];
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

  const payload = chats.map((chat) => ({
    _id: chat._id,
    title: chat.title,
    userId: chat.userId,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    accessLevel: getAccessLevel(chat, req.user._id),
  }));

  return res.status(200).json(new ApiResponse(200, payload, ""));
});

const getChatMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  await findChatWithReadAccess(chatId, req.user._id);

  const messages = await Message.find({ chatId }).sort({ createdAt: 1 });
  return res.status(200).json(new ApiResponse(200, messages, ""));
});

const sendMessage = asyncHandler(async (req, res) => {
  const { chatId, content, attachments } = req.body;
  const normalizedAttachments = sanitizeAttachments(attachments);

  if (!content && !normalizedAttachments.length) {
    throw new ApiError(400, "Content or attachments required");
  }

  const normalizedContent = String(content || "Please analyze the attached files/images.").trim();

  let currentChatId = chatId;

  if (!currentChatId) {
    const newChat = await Chat.create({
      userId: req.user._id,
      title: normalizedContent.substring(0, 30),
    });
    currentChatId = newChat._id;
  } else {
    await findChatWithWriteAccess(currentChatId, req.user._id);
  }

  const userMessage = await Message.create({
    chatId: currentChatId,
    senderRole: "user",
    senderUserId: req.user._id,
    senderName: req.user.fullName || "User",
    content: normalizedContent,
    attachments: normalizedAttachments,
  });

  const history = await Message.find({ chatId: currentChatId }).sort({
    createdAt: 1,
  });
  const latestMessageId = String(userMessage._id);
  const googleHistory = history.map((msg) => ({
    role: msg.senderRole === "ai" ? "model" : "user",
    parts: buildGeminiPartsFromMessage(msg, {
      includeAttachmentData:
        msg.senderRole === "user" && String(msg._id) === latestMessageId,
    }),
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
        const result = await model.generateContent({ contents: googleHistory });
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

export {
  createNewChat,
  getUserChats,
  getChatMessages,
  sendMessage,
  // Shared helpers used by the socket streaming handler
  getGeminiClient,
  GEMINI_MODEL_CANDIDATES,
  fetchAvailableGeminiModels,
  getRetryDelaySeconds,
  buildGeminiPartsFromMessage,
  sanitizeAttachments,
};
