const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: String,
    senderId: String,
    receiverId: String,
    message: String,
    status: {
      type: String,
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

module.exports = mongoose.model("Messages", messageSchema);