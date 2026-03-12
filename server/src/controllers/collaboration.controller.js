import mongoose from "mongoose";
import { Chat } from "../models/chat.model.js";
import { ChatInvitation } from "../models/chatInvitation.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  findChatById,
  getAccessLevel,
  isOwner,
  roomForChat,
  roomForUser,
} from "../utils/chatAccess.js";
import { getIO } from "../socket/ioStore.js";

const mapChatForSidebar = (chat, userId) => ({
  _id: chat._id,
  title: chat.title,
  userId: chat.userId,
  updatedAt: chat.updatedAt,
  createdAt: chat.createdAt,
  accessLevel: getAccessLevel(chat, userId),
});

const getSharedChats = asyncHandler(async (req, res) => {
  const sharedChats = await Chat.find({
    "collaborators.userId": req.user._id,
  }).sort({ updatedAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, sharedChats.map((chat) => mapChatForSidebar(chat, req.user._id)), ""));
});

const getChatCollaborators = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const chat = await findChatById(chatId);

  if (!isOwner(chat, req.user._id) && getAccessLevel(chat, req.user._id) === "none") {
    throw new ApiError(403, "You do not have access to this chat");
  }

  const participantIds = [chat.userId, ...(chat.collaborators || []).map((collab) => collab.userId)];
  const users = await User.find({ _id: { $in: participantIds } }).select("_id fullName email");
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  const owner = usersById.get(String(chat.userId));

  const collaborators = (chat.collaborators || []).map((collab) => {
    const user = usersById.get(String(collab.userId));
    return {
      userId: collab.userId,
      fullName: user?.fullName || "User",
      email: user?.email || "",
      permission: collab.permission,
      joinedAt: collab.joinedAt,
    };
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        owner: owner
          ? {
              userId: owner._id,
              fullName: owner.fullName,
              email: owner.email,
            }
          : null,
        collaborators,
      },
      "",
    ),
  );
});

const sendChatInvitation = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { email, permission } = req.body;

  if (!email?.trim()) {
    throw new ApiError(400, "Collaborator email is required");
  }

  const normalizedPermission = permission === "write" ? "write" : "read";
  const normalizedEmail = String(email).trim().toLowerCase();

  const chat = await findChatById(chatId);

  if (!isOwner(chat, req.user._id)) {
    throw new ApiError(403, "Only the chat owner can invite collaborators");
  }

  const invitee = await User.findOne({ email: normalizedEmail }).select("_id email fullName");
  if (!invitee) {
    throw new ApiError(404, "No user found with this email");
  }

  if (String(invitee._id) === String(req.user._id)) {
    throw new ApiError(400, "You are already the owner of this chat");
  }

  const existingCollaborator = (chat.collaborators || []).find(
    (collab) => String(collab.userId) === String(invitee._id),
  );

  if (existingCollaborator) {
    throw new ApiError(409, "User is already a collaborator in this chat");
  }

  const existingPending = await ChatInvitation.findOne({
    chatId: chat._id,
    inviteeId: invitee._id,
    status: "pending",
  });

  if (existingPending) {
    existingPending.permission = normalizedPermission;
    existingPending.inviterId = req.user._id;
    await existingPending.save();
  } else {
    await ChatInvitation.create({
      chatId: chat._id,
      inviterId: req.user._id,
      inviteeId: invitee._id,
      inviteeEmail: invitee.email,
      permission: normalizedPermission,
      status: "pending",
    });
  }

  const io = getIO();
  if (io) {
    io.to(roomForUser(invitee._id)).emit("inbox_updated", { type: "new_invite" });
  }

  return res.status(200).json(new ApiResponse(200, {}, "Invitation sent"));
});

const getInboxInvitations = asyncHandler(async (req, res) => {
  const invites = await ChatInvitation.find({
    inviteeId: req.user._id,
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .populate("inviterId", "fullName email")
    .populate("chatId", "title userId");

  const payload = invites
    .filter((invite) => invite.chatId)
    .map((invite) => ({
      _id: invite._id,
      chatId: invite.chatId._id,
      chatTitle: invite.chatId.title,
      inviter: {
        userId: invite.inviterId?._id,
        fullName: invite.inviterId?.fullName || "User",
        email: invite.inviterId?.email || "",
      },
      permission: invite.permission,
      status: invite.status,
      createdAt: invite.createdAt,
    }));

  return res.status(200).json(new ApiResponse(200, payload, ""));
});

const respondToInvitation = asyncHandler(async (req, res) => {
  const { inviteId } = req.params;
  const { action } = req.body;

  if (!mongoose.Types.ObjectId.isValid(inviteId)) {
    throw new ApiError(400, "inviteId is invalid");
  }

  if (!["accept", "reject"].includes(action)) {
    throw new ApiError(400, "Action must be accept or reject");
  }

  const invite = await ChatInvitation.findOne({
    _id: inviteId,
    inviteeId: req.user._id,
    status: "pending",
  }).populate("chatId");

  if (!invite || !invite.chatId) {
    throw new ApiError(404, "Invitation not found or already handled");
  }

  const chat = await Chat.findById(invite.chatId._id);
  if (!chat) {
    throw new ApiError(404, "Chat not found");
  }

  invite.status = action === "accept" ? "accepted" : "rejected";
  invite.respondedAt = new Date();
  await invite.save();

  if (action === "accept") {
    const existing = (chat.collaborators || []).find(
      (collab) => String(collab.userId) === String(req.user._id),
    );

    if (!existing) {
      chat.collaborators.push({
        userId: req.user._id,
        permission: invite.permission,
      });
      await chat.save();
    }
  }

  const io = getIO();
  if (io) {
    io.to(roomForUser(req.user._id)).emit("inbox_updated", { type: "responded" });
    io.to(roomForUser(invite.inviterId)).emit("invite_responded", {
      inviteId: invite._id,
      action,
      inviteeUserId: req.user._id,
    });

    if (action === "accept") {
      io.to(roomForUser(req.user._id)).emit("shared_chats_updated", {
        chatId: chat._id,
      });
      io.in(roomForUser(req.user._id)).socketsJoin(roomForChat(chat._id));
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { action, inviteId: invite._id }, `Invitation ${action}ed`));
});

export {
  getSharedChats,
  getChatCollaborators,
  sendChatInvitation,
  getInboxInvitations,
  respondToInvitation,
};
