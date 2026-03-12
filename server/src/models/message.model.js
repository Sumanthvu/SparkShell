import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    senderRole: {
      type: String,
      enum: ["user", "ai"],
      required: true,
    },
    senderUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    senderName: {
      type: String,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    attachments: [
      {
        name: { type: String },
        relativePath: { type: String },
        type: { type: String },
        size: { type: Number },
        previewDataUrl: { type: String },
        textContent: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ chatId: 1, createdAt: 1 });

export const Message = mongoose.model("Message", messageSchema);