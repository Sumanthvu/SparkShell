import mongoose from "mongoose";
import { Chat } from "../models/chat.model.js";
import { ApiError } from "./ApiError.js";

const toId = (value) => String(value || "");

const isOwner = (chat, userId) => toId(chat?.userId) === toId(userId);

const getCollaborator = (chat, userId) =>
  Array.isArray(chat?.collaborators)
    ? chat.collaborators.find((item) => toId(item?.userId) === toId(userId))
    : null;

const hasReadAccess = (chat, userId) =>
  isOwner(chat, userId) || Boolean(getCollaborator(chat, userId));

const hasWriteAccess = (chat, userId) => {
  if (isOwner(chat, userId)) return true;
  const collaborator = getCollaborator(chat, userId);
  return collaborator?.permission === "write";
};

const getAccessLevel = (chat, userId) => {
  if (isOwner(chat, userId)) return "owner";
  const collaborator = getCollaborator(chat, userId);
  if (!collaborator) return "none";
  return collaborator.permission === "write" ? "write" : "read";
};

const roomForChat = (chatId) => `chat_${chatId}`;
const roomForUser = (userId) => `user_${userId}`;

const listChatParticipantIds = (chat) => {
  const ids = [toId(chat?.userId)];
  if (Array.isArray(chat?.collaborators)) {
    for (const collab of chat.collaborators) {
      ids.push(toId(collab.userId));
    }
  }
  return [...new Set(ids.filter(Boolean))];
};

const ensureObjectId = (value, fieldName = "chatId") => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${fieldName} is invalid`);
  }
};

const findChatById = async (chatId) => {
  ensureObjectId(chatId, "chatId");
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new ApiError(404, "Chat not found");
  }
  return chat;
};

const findChatWithReadAccess = async (chatId, userId) => {
  const chat = await findChatById(chatId);
  if (!hasReadAccess(chat, userId)) {
    throw new ApiError(403, "You do not have access to this chat");
  }
  return chat;
};

const findChatWithWriteAccess = async (chatId, userId) => {
  const chat = await findChatById(chatId);
  if (!hasWriteAccess(chat, userId)) {
    throw new ApiError(403, "You have read-only access to this chat");
  }
  return chat;
};

export {
  isOwner,
  getCollaborator,
  hasReadAccess,
  hasWriteAccess,
  getAccessLevel,
  roomForChat,
  roomForUser,
  listChatParticipantIds,
  findChatById,
  findChatWithReadAccess,
  findChatWithWriteAccess,
};
