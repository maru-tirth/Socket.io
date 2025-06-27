// === server/index.js ===
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));
const PORT = 3000;
const chatRooms = {
  password123: {
    name: "General Chat",
    users: [],
    messages: [],
  },
};


function getRoomStats() {
  return Object.entries(chatRooms).map(([password, room]) => ({
    name: room.name,
    password,
    userCount: room.users.length,
    userList: room.users.map((u) => u.name),
  }));
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ username, password }) => {
    const room = chatRooms[password];
    if (!room || !room.users) {
      socket.emit("invalid-password");
      return;
    }

    socket.join(password);
    socket.username = username;
    socket.roomPassword = password;
    room.users.push({ id: socket.id, name: username });
    io.to(password).emit("user-joined", username);
    io.emit("update-room-stats", getRoomStats());
  });

  socket.on("create-room", ({ roomName, password }) => {
    if (chatRooms[password]) {
      socket.emit("room-exists");
    } else {
      chatRooms[password] = { name: roomName, users: [], messages: [] };
      socket.emit("room-created");
      io.emit("update-room-stats", getRoomStats());
    }
  });

  socket.on("get-rooms", () => {
    const allRooms = Object.entries(chatRooms).map(([password, room]) => ({
      name: room.name,
      password,
    }));
    socket.emit("rooms-list", allRooms);
  });

  socket.on("delete-room", (password) => {
    if (chatRooms[password]) {
      delete chatRooms[password];
      io.emit("room-deleted", password);
      io.emit("update-room-stats", getRoomStats());
    }
  });

  socket.on("send-message", (data) => {
    const room = socket.roomPassword;
    const message = {
      sender: socket.username,
      text: data.text,
      time: new Date().toLocaleTimeString(),
      id: Date.now(),
    };
    chatRooms[room].messages.push(message);
    io.to(room).emit("receive-message", message);
  });

  socket.on("delete-message", (messageId) => {
    const room = socket.roomPassword;
    chatRooms[room].messages = chatRooms[room].messages.filter(
      (m) => m.id !== messageId
    );
    io.to(room).emit("message-deleted", messageId);
  });

  socket.on("disconnect", () => {
    const room = socket.roomPassword;
    if (room && chatRooms[room]) {
      chatRooms[room].users = chatRooms[room].users.filter(
        (u) => u.id !== socket.id
      );
      io.to(room).emit("user-left", socket.username);
      io.emit("update-room-stats", getRoomStats());
    }
    console.log("User disconnected:", socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
