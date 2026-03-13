import mongoose from "mongoose";
import { Chat } from "../models/chat.model.js";
import { ChatInvitation } from "../models/chatInvitation.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  findChatById,
  hasReadAccess,
  isOwner,
  roomForChat,
  roomForUser,
} from "../utils/chatAccess.js";
import { getIO } from "../socket/ioStore.js";

const toObjectId = (value, fieldName = "id") => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${fieldName} is invalid`);
  }
  return new mongoose.Types.ObjectId(value);
};

const getSharedChats = asyncHandler(async (req, res) => {
  const userId = toObjectId(req.user._id, "userId");

  const sharedChats = await Chat.aggregate([
    {
      $match: {
        $or: [
          {
            "collaborators.userId": userId,
          },
          {
            userId,
            collaborators: { $exists: true, $ne: [] },
          },
        ],
      },
    },
    {
      $sort: {
        updatedAt: -1,
      },
    },
    {
      $lookup: {
        from: "messages",
        let: {
          chatId: "$_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$chatId", "$$chatId"],
              },
            },
          },
          {
            $sort: {
              createdAt: -1,
            },
          },
          {
            $limit: 1,
          },
          {
            $project: {
              _id: 1,
              senderRole: 1,
              content: 1,
              createdAt: 1,
            },
          },
        ],
        as: "lastMessage",
      },
    },
    {
      $lookup: {
        from: "messages",
        let: {
          chatId: "$_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$chatId", "$$chatId"],
              },
            },
          },
          {
            $count: "count",
          },
        ],
        as: "messageStats",
      },
    },
    {
      $addFields: {
        collaboratorCount: {
          $size: {
            $ifNull: ["$collaborators", []],
          },
        },
        currentCollaborator: {
          $arrayElemAt: [
            {
              $filter: {
                input: {
                  $ifNull: ["$collaborators", []],
                },
                as: "collab",
                cond: {
                  $eq: ["$$collab.userId", userId],
                },
              },
            },
            0,
          ],
        },
        lastMessage: {
          $arrayElemAt: ["$lastMessage", 0],
        },
        messageCount: {
          $ifNull: [
            {
              $arrayElemAt: ["$messageStats.count", 0],
            },
            0,
          ],
        },
      },
    },
    {
      $addFields: {
        accessLevel: {
          $cond: [
            {
              $eq: ["$userId", userId],
            },
            "owner",
            {
              $cond: [
                {
                  $eq: ["$currentCollaborator.permission", "write"],
                },
                "write",
                "read",
              ],
            },
          ],
        },
      },
    },
    {
      $project: {
        messageStats: 0,
        currentCollaborator: 0,
      },
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, sharedChats, ""));
});

const getChatCollaborators = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const chat = await findChatById(chatId);

  if (!hasReadAccess(chat, req.user._id)) {
    throw new ApiError(403, "You do not have access to this chat");
  }

  const chatObjectId = toObjectId(chat._id, "chatId");

  const [aggregationResult] = await Chat.aggregate([
    {
      $match: {
        _id: chatObjectId,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "ownerUser",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "collaborators.userId",
        foreignField: "_id",
        as: "collaboratorUsers",
      },
    },
    {
      $addFields: {
        owner: {
          $let: {
            vars: {
              ownerDoc: {
                $arrayElemAt: ["ownerUser", 0],
              },
            },
            in: {
              userId: "$$ownerDoc._id",
              fullName: {
                $ifNull: ["$$ownerDoc.fullName", "User"],
              },
              email: {
                $ifNull: ["$$ownerDoc.email", ""],
              },
            },
          },
        },
        collaborators: {
          $map: {
            input: {
              $ifNull: ["$collaborators", []],
            },
            as: "collab",
            in: {
              $let: {
                vars: {
                  matchedUser: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$collaboratorUsers",
                          as: "user",
                          cond: {
                            $eq: ["$$user._id", "$$collab.userId"],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: {
                  userId: "$$collab.userId",
                  fullName: {
                    $ifNull: ["$$matchedUser.fullName", "User"],
                  },
                  email: {
                    $ifNull: ["$$matchedUser.email", ""],
                  },
                  permission: "$$collab.permission",
                  joinedAt: "$$collab.joinedAt",
                },
              },
            },
          },
        },
      },
    },
    {
      $project: {
        owner: 1,
        collaborators: 1,
      },
    },
  ]);

  const owner = aggregationResult?.owner || null;
  const collaborators = aggregationResult?.collaborators || [];

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        owner: owner
          ? {
              userId: owner.userId,
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
  const userId = toObjectId(req.user._id, "userId");

  const payload = await ChatInvitation.aggregate([
    {
      $match: {
        inviteeId: userId,
        status: "pending",
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "inviterId",
        foreignField: "_id",
        as: "inviter",
      },
    },
    {
      $lookup: {
        from: "chats",
        localField: "chatId",
        foreignField: "_id",
        as: "chat",
      },
    },
    {
      $addFields: {
        inviter: {
          $arrayElemAt: ["$inviter", 0],
        },
        chat: {
          $arrayElemAt: ["$chat", 0],
        },
      },
    },
    {
      $match: {
        "chat._id": {
          $exists: true,
        },
      },
    },
    {
      $project: {
        _id: 1,
        chatId: "$chat._id",
        chatTitle: "$chat.title",
        inviter: {
          userId: "$inviter._id",
          fullName: {
            $ifNull: ["$inviter.fullName", "User"],
          },
          email: {
            $ifNull: ["$inviter.email", ""],
          },
        },
        permission: 1,
        status: 1,
        createdAt: 1,
      },
    },
  ]);

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
