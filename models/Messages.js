const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
    },

    senderId: {
      type: String,
      required: true,
    },

    receiverId: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],  // ✅ ENUM ADDED
      default: "sent",
    },

    replyTo: {
      type: String,
      default: null,
    },

    reactions: [
      {
        userId: String,
        emoji: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Messages ||
  mongoose.model("Messages", messageSchema);