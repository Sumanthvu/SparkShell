import mongoose, { Schema } from "mongoose";

const chatInvitationSchema = new Schema(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    inviterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inviteeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inviteeEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    permission: {
      type: String,
      enum: ["read", "write"],
      default: "read",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },
    respondedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

chatInvitationSchema.index({ chatId: 1, inviteeId: 1, status: 1 });

export const ChatInvitation = mongoose.model("ChatInvitation", chatInvitationSchema);
