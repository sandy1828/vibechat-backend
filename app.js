const express = require("express");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");

/* ================= DATABASE ================= */
mongoose
  .connect(
    "mongodb+srv://chatapp-90:8169576470@cluster0.biywaf7.mongodb.net/chatapp?retryWrites=true&w=majority",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  )
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.log("❌ DB Error:", err.message);
    process.exit(1);
  });

/* ================= MODELS ================= */

const Users = require("./models/Users");
const Conversations = require("./models/Conversations");
const Messages = require("./models/Messages");

/* ================= EXPRESS ================= */

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);

/* ================= SOCKET.IO ================= */

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let onlineUsers = [];

/* ================= SOCKET LOGIC ================= */

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  /* -------- ADD USER -------- */
  socket.on("addUser", async (userId) => {
    if (!onlineUsers.find((u) => u.userId === userId)) {
      onlineUsers.push({ userId, socketId: socket.id });
    }

    io.emit("getUsers", onlineUsers);
  });

  /* -------- SEND MESSAGE -------- */
  /* -------- SEND MESSAGE -------- */
  socket.on("sendMessage", async (data) => {
    const { _id, senderId, receiverId } = data;

    const receiver = onlineUsers.find((u) => u.userId === receiverId);

    if (receiver) {
      await Messages.findByIdAndUpdate(_id, {
        status: "delivered",
      });

      const updatedMessage = await Messages.findById(_id);

      io.to(receiver.socketId).emit("getMessage", updatedMessage);

      socket.emit("messageStatusUpdate", {
        messageId: _id,
        status: "delivered",
      });
    } else {
      socket.emit("messageStatusUpdate", {
        messageId: _id,
        status: "sent",
      });
    }
  });
  /* -------- END CALL -------- */
  socket.on("endCall", ({ to }) => {
    const receiver = onlineUsers.find((u) => u.userId === to);

    if (receiver) {
      io.to(receiver.socketId).emit("callEnded");
    }
  });

  /* -------- CALL USER -------- */
  socket.on("callUser", ({ to, from }) => {
    const receiver = onlineUsers.find((u) => u.userId === to);

    if (receiver) {
      io.to(receiver.socketId).emit("incomingCall", {
        from,
      });
    }
  });

  /* -------- ANSWER CALL -------- */
  socket.on("answerCall", ({ to, answer }) => {
    const receiver = onlineUsers.find((u) => u.userId === to);

    if (receiver) {
      io.to(receiver.socketId).emit("callAccepted", {
        answer,
      });
    }
  });

  /* -------- ICE CANDIDATE -------- */
  socket.on("iceCandidate", ({ to, candidate }) => {
    const receiver = onlineUsers.find((u) => u.userId === to);

    if (receiver) {
      io.to(receiver.socketId).emit("iceCandidate", {
        candidate,
      });
    }
  });

  /* -------- MARK AS SEEN -------- */
  socket.on("markAsSeen", async ({ conversationId, viewerId }) => {
    const unseenMessages = await Messages.find({
      conversationId,
      receiverId: viewerId,
      status: { $ne: "seen" },
    });

    await Messages.updateMany(
      {
        conversationId,
        receiverId: viewerId,
        status: { $ne: "seen" },
      },
      { $set: { status: "seen" } },
    );

    unseenMessages.forEach((msg) => {
      const sender = onlineUsers.find((u) => u.userId === msg.senderId);

      if (sender) {
        io.to(sender.socketId).emit("messageStatusUpdate", {
          messageId: msg._id,
          status: "seen",
        });
      }
    });
  });

  /* -------- TYPING -------- */
  socket.on("typing", ({ to, from }) => {
    const receiver = onlineUsers.find((u) => u.userId === to);

    if (receiver) {
      io.to(receiver.socketId).emit("typing", { from });
    }
  });

  /* -------- DISCONNECT -------- */
  socket.on("disconnect", async () => {
    const disconnectedUser = onlineUsers.find((u) => u.socketId === socket.id);

    if (disconnectedUser) {
      await Users.findByIdAndUpdate(disconnectedUser.userId, {
        lastSeen: new Date(),
      });
    }

    onlineUsers = onlineUsers.filter((u) => u.socketId !== socket.id);

    io.emit("getUsers", onlineUsers);

    console.log("🔴 Disconnected:", socket.id);
  });
});

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.send("🚀 Server Running");
});

/* -------- REGISTER -------- */
app.post("/api/register", async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: "All fields required" });
  }

  const exist = await Users.findOne({ email });
  if (exist) return res.status(400).json({ message: "User exists" });

  const hashed = await bcryptjs.hash(password, 10);

  const user = new Users({
    fullName,
    email,
    password: hashed,
  });

  await user.save();

  res.status(201).json({
    message: "Registered successfully",
  });
});

/* -------- LOGIN -------- */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await Users.findOne({ email });
  if (!user) return res.status(400).send("Invalid");

  const valid = await bcryptjs.compare(password, user.password);
  if (!valid) return res.status(400).send("Invalid");

  const token = jwt.sign({ id: user._id }, "SECRET", { expiresIn: "1d" });

  res.json({
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      lastSeen: user.lastSeen,
    },
    token,
  });
});

/* -------- CREATE / CHECK CONVERSATION -------- */
app.post("/api/conversation", async (req, res) => {
  const { senderId, receiverId } = req.body;

  let conversation = await Conversations.findOne({
    members: { $all: [senderId, receiverId] },
  });

  if (!conversation) {
    conversation = new Conversations({
      members: [senderId, receiverId],
    });
    await conversation.save();
  }

  res.json(conversation);
});

/* -------- SEND MESSAGE -------- */
app.post("/api/message", async (req, res) => {
  let { conversationId, senderId, receiverId, message } = req.body;

  if (conversationId === "new") {
    let existing = await Conversations.findOne({
      members: { $all: [senderId, receiverId] },
    });

    if (!existing) {
      existing = new Conversations({
        members: [senderId, receiverId],
      });
      await existing.save();
    }

    conversationId = existing._id;
  }

  const newMessage = new Messages({
    conversationId,
    senderId,
    receiverId,
    message,
    status: "sent",
  });

  await newMessage.save();
  res.json(newMessage);
});

app.put("/api/message/react/:id", async (req, res) => {
  const { emoji, userId } = req.body;

  const message = await Messages.findById(req.params.id);

  if (!message) {
    return res.status(404).json({ message: "Message not found" });
  }

  message.reactions.push({ userId, emoji });
  await message.save();

  res.json({ success: true });
});
/* -------- GET MESSAGES -------- */
app.get("/api/message/:conversationId", async (req, res) => {
  const messages = await Messages.find({
    conversationId: req.params.conversationId,
  }).sort({ createdAt: 1 });

  res.json(messages);
});

/* -------- GET CONVERSATIONS -------- */
app.get("/api/conversations/:userId", async (req, res) => {
  const conversations = await Conversations.find({
    members: { $in: [req.params.userId] },
  });

  const result = await Promise.all(
    conversations.map(async (conv) => {
      const receiverId = conv.members.find(
        (member) => member !== req.params.userId,
      );

      const user = await Users.findById(receiverId);

      // Get last message
      const lastMessage = await Messages.findOne({
        conversationId: conv._id,
      }).sort({ createdAt: -1 });

      // Count unread
      const unreadCount = await Messages.countDocuments({
        conversationId: conv._id,
        receiverId: req.params.userId,
        status: { $ne: "seen" },
      });

      return {
        conversationId: conv._id,
        user: {
          receiverId: user._id,
          fullName: user.fullName,
          email: user.email,
          lastSeen: user.lastSeen,
        },
        lastMessage: lastMessage?.message || "",
        unreadCount,
      };
    }),
  );

  res.json(result);
});

// delete
app.delete("/api/conversation/:conversationId", async (req, res) => {
  await Messages.deleteMany({
    conversationId: req.params.conversationId,
  });

  await Conversations.findByIdAndDelete(req.params.conversationId);

  res.json({ message: "Conversation deleted" });
});

/* -------- GET USERS -------- */
app.get("/api/users/:userId", async (req, res) => {
  const users = await Users.find({
    _id: { $ne: req.params.userId },
  });

  res.json(
    users.map((user) => ({
      user: {
        receiverId: user._id,
        fullName: user.fullName,
        email: user.email,
        lastSeen: user.lastSeen,
      },
    })),
  );
});

/* ================= START ================= */

server.listen(8000, () => {
  console.log("🚀 Server Running on 8000");
});
