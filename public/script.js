const socket = io("https://socket-io-bo8c.onrender.com");

new Vue({
  el: "#app",
  data: {
    username: "",
    password: "",
    loggedIn: false,
    isAdmin: false,
    newRoomName: "",
    newRoomPassword: "",
    allRooms: [],
    roomStats: [],
    messages: [],
    messageText: "",
    currentRoomPassword: "",
    chatRoomName: "",
    showWelcome: true,
  },
  methods: {
    login() {
      this.isAdmin = this.username === "Admin" && this.password === "Pa$$w0rd";
      this.loggedIn = true;

      if (this.isAdmin) {
        this.fetchRooms();
      } else {
        socket.emit("join-room", {
          username: this.username,
          password: this.password,
        });
        this.chatRoomName = "Chat Room";
        setTimeout(() => (this.showWelcome = false), 3000);
      }

      this.currentRoomPassword = this.password;
    },
    createRoom() {
      socket.emit("create-room", {
        roomName: this.newRoomName,
        password: this.newRoomPassword,
      });
      this.newRoomName = "";
      this.newRoomPassword = "";
    },
    fetchRooms() {
      socket.emit("get-rooms");
    },
    deleteRoom(password) {
      if (confirm("Are you sure you want to delete this room?")) {
        socket.emit("delete-room", password);
      }
    },
    sendMessage() {
      if (this.messageText.trim() === "") return;
      socket.emit("send-message", {
        text: this.messageText,
      });
      this.messageText = "";
    },
    deleteMessage(id) {
      socket.emit("delete-message", id);
    },
    showToast(message) {
      const toast = document.createElement("div");
      toast.className = "toast show bg-dark text-white p-3 rounded";
      toast.style.position = "fixed";
      toast.style.bottom = "20px";
      toast.style.right = "20px";
      toast.style.zIndex = "9999";
      toast.innerHTML = `<div>${message}</div>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    },
  },
  created() {
    Notification.requestPermission();

    socket.on("invalid-password", () => {
      alert("Invalid password. No chat room with that password.");
      window.location.reload();
    });

    socket.on("room-exists", () => {
      alert("Room already exists.");
    });

    socket.on("room-created", () => {
      this.fetchRooms();
      alert("Room created successfully.");
    });

    socket.on("rooms-list", (rooms) => {
      this.allRooms = rooms;
    });

    socket.on("room-deleted", (password) => {
      this.allRooms = this.allRooms.filter((r) => r.password !== password);
    });

    socket.on("update-room-stats", (stats) => {
      this.roomStats = stats;
    });

    socket.on("user-joined", (name) => {
      this.messages.push({
        sender: "System",
        text: `${name} joined.`,
        time: new Date().toLocaleTimeString(),
        id: Date.now(),
      });
      this.showToast(`${name} joined the chat.`);
    });

    socket.on("user-left", (name) => {
      this.messages.push({
        sender: "System",
        text: `${name} left.`,
        time: new Date().toLocaleTimeString(),
        id: Date.now(),
      });
      this.showToast(`${name} left the chat.`);
    });

    socket.on("receive-message", (msg) => {
      this.messages.push(msg);
      if (Notification.permission === "granted") {
        new Notification(`💬 ${msg.sender}`, { body: msg.text });
      }
    });

    socket.on("message-deleted", (id) => {
      this.messages = this.messages.filter((m) => m.id !== id);
    });
  },
});
