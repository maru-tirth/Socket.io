// === server/index.js ===
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

// Middleware
app.use(express.static("public"));
app.use(express.json());

// Configuration
const PORT = 3003;

// Initial chat rooms configuration
const chatRooms = {
  password123: {
    name: "General Chat",
    users: [],
    messages: [],
    maxUsers: null, // null means unlimited users
    isProtected: true, // protect from deletion
    createdAt: new Date(),
    lastActivity: new Date(),
  },
};

// Utility Functions
function getRoomStats() {
  return Object.entries(chatRooms).map(([password, room]) => ({
    name: room.name,
    password,
    userCount: room.users.length,
    userList: room.users.map((u) => u.name),
    maxUsers: room.maxUsers,
    isProtected: room.isProtected || false,
    messageCount: room.messages.length,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
  }));
}

function validateRoomData(roomName, password, maxUsers) {
  if (!roomName || roomName.trim().length === 0) {
    return { isValid: false, error: "Room name is required" };
  }
  if (!password || password.trim().length === 0) {
    return { isValid: false, error: "Room password is required" };
  }
  if (maxUsers && (isNaN(maxUsers) || maxUsers < 1 || maxUsers > 100)) {
    return { isValid: false, error: "Max users must be between 1 and 100" };
  }
  return { isValid: true };
}

function cleanupEmptyRooms() {
  Object.keys(chatRooms).forEach((password) => {
    const room = chatRooms[password];
    // Don't cleanup protected rooms or rooms with users
    if (!room.isProtected && room.users.length === 0) {
      // Only cleanup rooms that have been empty for more than 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (room.lastActivity < oneHourAgo) {
        delete chatRooms[password];
        console.log(`Cleaned up empty room: ${room.name}`);
      }
    }
  });
}

// Cleanup empty rooms every 30 minutes
setInterval(cleanupEmptyRooms, 30 * 60 * 1000);

// Socket.IO Connection Handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id} at ${new Date().toISOString()}`);

  // Handle user joining a room
  socket.on("join-room", ({ username, password }) => {
    try {
      const room = chatRooms[password];

      // Validate room exists
      if (!room || !room.users) {
        socket.emit("invalid-password");
        return;
      }

      // Check if room is at max capacity
      if (room.maxUsers && room.users.length >= room.maxUsers) {
        socket.emit("room-full");
        return;
      }

      // Check if username is already taken in this room
      const isUsernameTaken = room.users.some(
        (user) => user.name.toLowerCase() === username.toLowerCase()
      );
      if (isUsernameTaken) {
        socket.emit("username-taken");
        return;
      }

      // Join the room
      socket.join(password);
      socket.username = username;
      socket.roomPassword = password;

      // Add user to room
      room.users.push({
        id: socket.id,
        name: username,
        joinedAt: new Date(),
      });

      // Update room activity
      room.lastActivity = new Date();

      // Send existing messages to the user
      socket.emit("load-messages", room.messages);

      // Notify others in the room
      socket.to(password).emit("user-joined", username);

      // Update room statistics
      io.emit("update-room-stats", getRoomStats());

      console.log(`${username} joined room: ${room.name}`);
    } catch (error) {
      console.error("Error in join-room:", error);
      socket.emit("join-error", "An error occurred while joining the room");
    }
  });

  // Handle room creation
  socket.on("create-room", ({ roomName, password, maxUsers }) => {
    try {
      // Validate input data
      const validation = validateRoomData(roomName, password, maxUsers);
      if (!validation.isValid) {
        socket.emit("room-creation-error", validation.error);
        return;
      }

      // Check if room already exists
      if (chatRooms[password]) {
        socket.emit("room-exists");
        return;
      }

      // Create new room
      chatRooms[password] = {
        name: roomName.trim(),
        users: [],
        messages: [],
        maxUsers: maxUsers ? parseInt(maxUsers) : null,
        isProtected: false,
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      socket.emit("room-created");
      io.emit("update-room-stats", getRoomStats());

      console.log(`Room created: ${roomName} with password: ${password}`);
    } catch (error) {
      console.error("Error in create-room:", error);
      socket.emit(
        "room-creation-error",
        "An error occurred while creating the room"
      );
    }
  });

  // Handle getting all rooms
  socket.on("get-rooms", () => {
    try {
      const allRooms = Object.entries(chatRooms).map(([password, room]) => ({
        name: room.name,
        password,
        maxUsers: room.maxUsers,
        isProtected: room.isProtected || false,
        userCount: room.users.length,
        messageCount: room.messages.length,
        createdAt: room.createdAt,
      }));
      socket.emit("rooms-list", allRooms);
    } catch (error) {
      console.error("Error in get-rooms:", error);
      socket.emit("rooms-error", "An error occurred while fetching rooms");
    }
  });

  // Handle room deletion
  socket.on("delete-room", (password) => {
    try {
      const room = chatRooms[password];

      if (!room) {
        socket.emit("room-not-found");
        return;
      }

      if (room.isProtected) {
        socket.emit("room-protected");
        return;
      }

      // Notify users in the room before deletion
      io.to(password).emit("room-being-deleted");

      // Remove all users from the room
      room.users.forEach((user) => {
        const userSocket = io.sockets.sockets.get(user.id);
        if (userSocket) {
          userSocket.leave(password);
        }
      });

      // Delete the room
      delete chatRooms[password];

      io.emit("room-deleted", password);
      io.emit("update-room-stats", getRoomStats());

      console.log(`Room deleted: ${room.name}`);
    } catch (error) {
      console.error("Error in delete-room:", error);
      socket.emit("delete-error", "An error occurred while deleting the room");
    }
  });

  // Handle sending messages
  socket.on("send-message", (data) => {
    try {
      const room = socket.roomPassword;

      if (!room || !chatRooms[room]) {
        socket.emit("message-error", "You are not in a valid room");
        return;
      }

      if (!data.text || data.text.trim().length === 0) {
        socket.emit("message-error", "Message cannot be empty");
        return;
      }

      if (data.text.length > 1000) {
        socket.emit(
          "message-error",
          "Message is too long (max 1000 characters)"
        );
        return;
      }

      const message = {
        sender: socket.username,
        text: data.text.trim(),
        time: new Date().toLocaleTimeString(),
        timestamp: new Date(),
        id: Date.now() + Math.random(), // More unique ID
      };

      // Add message to room
      chatRooms[room].messages.push(message);

      // Update room activity
      chatRooms[room].lastActivity = new Date();

      // Limit message history to last 100 messages per room
      if (chatRooms[room].messages.length > 100) {
        chatRooms[room].messages = chatRooms[room].messages.slice(-100);
      }

      // Send message to all users in the room
      io.to(room).emit("receive-message", message);
    } catch (error) {
      console.error("Error in send-message:", error);
      socket.emit(
        "message-error",
        "An error occurred while sending the message"
      );
    }
  });

  // Handle message deletion
  socket.on("delete-message", (messageId) => {
    try {
      const room = socket.roomPassword;

      if (!room || !chatRooms[room]) {
        socket.emit("delete-error", "You are not in a valid room");
        return;
      }

      const messageIndex = chatRooms[room].messages.findIndex(
        (m) => m.id === messageId
      );

      if (messageIndex === -1) {
        socket.emit("delete-error", "Message not found");
        return;
      }

      const message = chatRooms[room].messages[messageIndex];

      // Check if user can delete this message (own message or admin)
      const isAdmin = socket.username === "Admin";
      const isOwnMessage = message.sender === socket.username;

      if (!isAdmin && !isOwnMessage) {
        socket.emit("delete-error", "You can only delete your own messages");
        return;
      }

      // Remove message
      chatRooms[room].messages.splice(messageIndex, 1);

      // Update room activity
      chatRooms[room].lastActivity = new Date();

      // Notify all users in the room
      io.to(room).emit("message-deleted", messageId);
    } catch (error) {
      console.error("Error in delete-message:", error);
      socket.emit(
        "delete-error",
        "An error occurred while deleting the message"
      );
    }
  });

  // Handle getting room statistics
  socket.on("get-room-stats", () => {
    try {
      socket.emit("update-room-stats", getRoomStats());
    } catch (error) {
      console.error("Error in get-room-stats:", error);
    }
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    try {
      const room = socket.roomPassword;
      const username = socket.username;

      if (room && chatRooms[room] && username) {
        // Remove user from room
        chatRooms[room].users = chatRooms[room].users.filter(
          (u) => u.id !== socket.id
        );

        // Update room activity
        chatRooms[room].lastActivity = new Date();

        // Notify others in the room
        socket.to(room).emit("user-left", username);

        // Update room statistics
        io.emit("update-room-stats", getRoomStats());

        console.log(`${username} left room: ${chatRooms[room].name}`);
      }

      console.log(
        `User disconnected: ${socket.id} at ${new Date().toISOString()}`
      );
    } catch (error) {
      console.error("Error in disconnect:", error);
    }
  });

  // Handle typing indicators (optional feature)
  socket.on("typing", () => {
    const room = socket.roomPassword;
    if (room) {
      socket.to(room).emit("user-typing", socket.username);
    }
  });

  socket.on("stop-typing", () => {
    const room = socket.roomPassword;
    if (room) {
      socket.to(room).emit("user-stop-typing", socket.username);
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Express error:", err);
  res.status(500).send("Something went wrong!");
});

// Start server
http.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 RealChat Server Started`);
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🏠 Static files served from: public/`);
  console.log(`=================================`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server gracefully...");

  // Notify all connected users
  io.emit(
    "server-shutdown",
    "Server is shutting down. Please refresh the page in a moment."
  );

  // Close server
  http.close(() => {
    console.log("✅ Server closed successfully");
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
