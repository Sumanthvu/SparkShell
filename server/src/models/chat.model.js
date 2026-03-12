import mongoose, { Schema } from "mongoose";

const chatSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      default: "New Chat",
    },
    collaborators: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        permission: {
          type: String,
          enum: ["read", "write"],
          default: "read",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

chatSchema.index({ userId: 1, updatedAt: -1 });
chatSchema.index({ "collaborators.userId": 1, updatedAt: -1 });

export const Chat = mongoose.model("Chat", chatSchema);