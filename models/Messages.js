const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversationId: String,
  senderId: String,
  receiverId: String,
  message: String,
  status: {
    type: String,
    enum: ["sent", "delivered", "seen"],
    default: "sent"
  }
}, { timestamps: true });

module.exports = mongoose.model("Messages", messageSchema);
