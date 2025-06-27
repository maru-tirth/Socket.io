// Initialize Socket.IO connection
const socket = io();

// Vue.js Application
new Vue({
  el: "#app",
  data: {
    // User Authentication
    username: "",
    password: "",
    loggedIn: false,
    isAdmin: false,

    // Admin Panel Data
    newRoomName: "",
    newRoomPassword: "",
    newRoomMaxUsers: null,
    allRooms: [],
    roomStats: [],

    // Chat Data
    messages: [],
    messageText: "",
    currentRoomPassword: "",
    chatRoomName: "",
    showWelcome: true,

    // UI State
    isConnected: false,
    isLoading: false,
    typingUsers: [],
    typingTimeout: null,
    lastActivity: new Date(),

    // Settings
    soundEnabled: true,
    notificationsEnabled: true,
    autoScroll: true,

    // Error Handling
    errorMessage: "",
    showError: false,
  },

  computed: {
    // Filter out General Chat from admin stats view
    filteredRoomStats() {
      return this.roomStats.filter((room) => room.name !== "General Chat");
    },

    // Check if user is typing
    isTyping() {
      return this.typingUsers.length > 0;
    },

    // Get typing users text
    typingText() {
      if (this.typingUsers.length === 0) return "";
      if (this.typingUsers.length === 1)
        return `${this.typingUsers[0]} is typing...`;
      if (this.typingUsers.length === 2)
        return `${this.typingUsers[0]} and ${this.typingUsers[1]} are typing...`;
      return `${this.typingUsers.length} users are typing...`;
    },

    // Sort rooms by user count (descending)
    sortedRoomStats() {
      return [...this.filteredRoomStats].sort(
        (a, b) => b.userCount - a.userCount
      );
    },

    // Get online users count
    totalOnlineUsers() {
      return this.roomStats.reduce((total, room) => total + room.userCount, 0);
    },
  },

  watch: {
    // Auto-scroll to bottom when new messages arrive
    messages: {
      handler() {
        if (this.autoScroll) {
          this.$nextTick(() => {
            this.scrollToBottom();
          });
        }
      },
      deep: true,
    },
  },

  methods: {
    // === Authentication Methods ===
    login() {
      if (!this.username.trim() || !this.password.trim()) {
        this.showErrorMessage("Please enter both username and password.");
        return;
      }

      this.isLoading = true;
      this.isAdmin = this.username === "Admin" && this.password === "Pa$w0rd";

      if (this.isAdmin) {
        this.loggedIn = true;
        this.fetchRooms();
        this.isLoading = false;
      } else {
        // Join regular chat room
        socket.emit("join-room", {
          username: this.username.trim(),
          password: this.password.trim(),
        });
        this.chatRoomName = "Chat Room";
        setTimeout(() => (this.showWelcome = false), 3000);
      }

      this.currentRoomPassword = this.password;
    },

    logout() {
      if (confirm("Are you sure you want to logout?")) {
        window.location.reload();
      }
    },

    // === Admin Methods ===
    createRoom() {
      if (!this.newRoomName.trim() || !this.newRoomPassword.trim()) {
        this.showErrorMessage("Please enter both room name and password.");
        return;
      }

      if (
        this.newRoomMaxUsers &&
        (this.newRoomMaxUsers < 1 || this.newRoomMaxUsers > 100)
      ) {
        this.showErrorMessage("Max users must be between 1 and 100.");
        return;
      }

      this.isLoading = true;
      socket.emit("create-room", {
        roomName: this.newRoomName.trim(),
        password: this.newRoomPassword.trim(),
        maxUsers: this.newRoomMaxUsers || null,
      });
    },

    fetchRooms() {
      socket.emit("get-rooms");
      socket.emit("get-room-stats");
    },

    deleteRoom(password) {
      const room = this.allRooms.find((r) => r.password === password);
      const roomName = room ? room.name : "this room";

      if (
        confirm(
          `Are you sure you want to delete "${roomName}"? This action cannot be undone.`
        )
      ) {
        socket.emit("delete-room", password);
      }
    },

    refreshStats() {
      this.fetchRooms();
      this.showToast("Statistics refreshed!");
    },

    // === Chat Methods ===
    sendMessage() {
      if (!this.messageText.trim()) return;

      if (this.messageText.length > 1000) {
        this.showErrorMessage("Message is too long (max 1000 characters).");
        return;
      }

      socket.emit("send-message", {
        text: this.messageText.trim(),
      });

      this.messageText = "";
      this.stopTyping();
    },

    deleteMessage(id) {
      if (confirm("Are you sure you want to delete this message?")) {
        socket.emit("delete-message", id);
      }
    },

    // === Typing Indicators ===
    onTyping() {
      if (!this.typingTimeout) {
        socket.emit("typing");
      }

      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.stopTyping();
      }, 1000);
    },

    stopTyping() {
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
        socket.emit("stop-typing");
      }
    },

    // === UI Helper Methods ===
    scrollToBottom() {
      const chatContainer = document.querySelector(".list-group-flush");
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    },

    toggleAutoScroll() {
      this.autoScroll = !this.autoScroll;
      if (this.autoScroll) {
        this.scrollToBottom();
      }
    },

    formatTime(timestamp) {
      if (!timestamp) return "";
      const date = new Date(timestamp);
      return date.toLocaleString();
    },

    getMessageClass(message) {
      if (message.sender === "System") return "text-muted";
      if (message.sender === this.username) return "text-primary";
      return "";
    },

    // === Notification Methods ===
    playNotificationSound() {
      if (!this.soundEnabled) return;

      const audio = document.getElementById("notification-sound");
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch((e) => {
          console.log("Could not play notification sound:", e);
        });
      }
    },

    showToast(message, type = "info") {
      const toast = document.createElement("div");
      const bgClass =
        type === "error"
          ? "bg-danger"
          : type === "success"
          ? "bg-success"
          : "bg-dark";

      toast.className = `toast show ${bgClass} text-white p-3 rounded shadow`;
      toast.style.position = "fixed";
      toast.style.bottom = "20px";
      toast.style.right = "20px";
      toast.style.zIndex = "9999";
      toast.style.minWidth = "250px";
      toast.innerHTML = `<div><strong>${message}</strong></div>`;

      document.body.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 4000);
    },

    showErrorMessage(message) {
      this.errorMessage = message;
      this.showError = true;
      setTimeout(() => {
        this.showError = false;
      }, 5000);
    },

    showDesktopNotification(title, body) {
      if (!this.notificationsEnabled || Notification.permission !== "granted")
        return;

      const notification = new Notification(title, {
        body: body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: "realchat-message",
      });

      setTimeout(() => notification.close(), 5000);
    },

    // === Settings Methods ===
    toggleSound() {
      this.soundEnabled = !this.soundEnabled;
      localStorage.setItem("realchat-sound", this.soundEnabled);
      this.showToast(`Sound ${this.soundEnabled ? "enabled" : "disabled"}`);
    },

    toggleNotifications() {
      this.notificationsEnabled = !this.notificationsEnabled;
      localStorage.setItem("realchat-notifications", this.notificationsEnabled);
      this.showToast(
        `Notifications ${this.notificationsEnabled ? "enabled" : "disabled"}`
      );
    },

    // === Utility Methods ===
    copyToClipboard(text) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          this.showToast("Copied to clipboard!", "success");
        })
        .catch(() => {
          this.showToast("Failed to copy to clipboard", "error");
        });
    },

    exportChatHistory() {
      const chatData = {
        room: this.chatRoomName,
        exportedAt: new Date().toISOString(),
        messages: this.messages,
      };

      const dataStr = JSON.stringify(chatData, null, 2);
      const dataUri =
        "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

      const exportFileDefaultName = `chat-history-${Date.now()}.json`;
      const linkElement = document.createElement("a");
      linkElement.setAttribute("href", dataUri);
      linkElement.setAttribute("download", exportFileDefaultName);
      linkElement.click();
    },

    // === Connection Methods ===
    reconnect() {
      socket.disconnect();
      socket.connect();
      this.showToast("Reconnecting...", "info");
    },
  },

  // === Vue Lifecycle ===
  created() {
    // Load settings from localStorage
    this.soundEnabled = localStorage.getItem("realchat-sound") !== "false";
    this.notificationsEnabled =
      localStorage.getItem("realchat-notifications") !== "false";

    // Request notification permission
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    // === Socket Event Listeners ===

    // Connection Events
    socket.on("connect", () => {
      this.isConnected = true;
      this.showToast("Connected to server", "success");
    });

    socket.on("disconnect", () => {
      this.isConnected = false;
      this.showToast("Disconnected from server", "error");
    });

    socket.on("reconnect", () => {
      this.isConnected = true;
      this.showToast("Reconnected to server", "success");
    });

    // Authentication Events
    socket.on("invalid-password", () => {
      this.isLoading = false;
      this.showErrorMessage(
        "Invalid password. No chat room with that password."
      );
      setTimeout(() => window.location.reload(), 3000);
    });

    socket.on("username-taken", () => {
      this.isLoading = false;
      this.showErrorMessage(
        "Username is already taken in this room. Please choose a different name."
      );
      setTimeout(() => window.location.reload(), 3000);
    });

    socket.on("room-full", () => {
      this.isLoading = false;
      this.showErrorMessage(
        "This room is full. Maximum number of users reached."
      );
      setTimeout(() => window.location.reload(), 3000);
    });

    socket.on("join-error", (error) => {
      this.isLoading = false;
      this.showErrorMessage(error);
    });

    // Room Management Events
    socket.on("room-exists", () => {
      this.isLoading = false;
      this.showErrorMessage("Room with this password already exists.");
    });

    socket.on("room-created", () => {
      this.isLoading = false;
      this.fetchRooms();
      this.showToast("Room created successfully!", "success");
      this.newRoomName = "";
      this.newRoomPassword = "";
      this.newRoomMaxUsers = null;
    });

    socket.on("room-creation-error", (error) => {
      this.isLoading = false;
      this.showErrorMessage(error);
    });

    socket.on("rooms-list", (rooms) => {
      this.allRooms = rooms;
    });

    socket.on("room-deleted", (password) => {
      this.allRooms = this.allRooms.filter((r) => r.password !== password);
      this.showToast("Room deleted successfully", "success");
    });

    socket.on("room-being-deleted", () => {
      this.showToast("This room is being deleted by admin", "error");
      setTimeout(() => window.location.reload(), 3000);
    });

    socket.on("room-protected", () => {
      this.showErrorMessage("This room is protected and cannot be deleted.");
    });

    // Statistics Events
    socket.on("update-room-stats", (stats) => {
      this.roomStats = stats;
    });

    // User Events
    socket.on("user-joined", (name) => {
      this.messages.push({
        sender: "System",
        text: `${name} joined the chat.`,
        time: new Date().toLocaleTimeString(),
        timestamp: new Date(),
        id: Date.now() + Math.random(),
      });
      this.showToast(`${name} joined the chat.`, "info");
      this.playNotificationSound();
    });

    socket.on("user-left", (name) => {
      this.messages.push({
        sender: "System",
        text: `${name} left the chat.`,
        time: new Date().toLocaleTimeString(),
        timestamp: new Date(),
        id: Date.now() + Math.random(),
      });
      this.showToast(`${name} left the chat.`, "info");
      this.playNotificationSound();
    });

    // Message Events
    socket.on("load-messages", (messages) => {
      this.messages = messages;
      this.loggedIn = true;
      this.isLoading = false;
    });

    socket.on("receive-message", (msg) => {
      this.messages.push(msg);

      // Play notification sound for new messages
      if (msg.sender !== this.username) {
        this.playNotificationSound();

        // Show desktop notification
        this.showDesktopNotification(`💬 ${msg.sender}`, msg.text);
      }

      this.lastActivity = new Date();
    });

    socket.on("message-deleted", (id) => {
      this.messages = this.messages.filter((m) => m.id !== id);
      this.showToast("Message deleted", "info");
    });

    socket.on("message-error", (error) => {
      this.showErrorMessage(error);
    });

    // Typing Events
    socket.on("user-typing", (username) => {
      if (!this.typingUsers.includes(username)) {
        this.typingUsers.push(username);
      }

      // Remove user from typing list after 3 seconds
      setTimeout(() => {
        this.typingUsers = this.typingUsers.filter((user) => user !== username);
      }, 3000);
    });

    socket.on("user-stop-typing", (username) => {
      this.typingUsers = this.typingUsers.filter((user) => user !== username);
    });

    // Server Events
    socket.on("server-shutdown", (message) => {
      this.showToast(message, "error");
    });

    // Error Events
    socket.on("delete-error", (error) => {
      this.showErrorMessage(error);
    });

    socket.on("rooms-error", (error) => {
      this.showErrorMessage(error);
    });
  },

  // Cleanup on component destroy
  beforeDestroy() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    socket.off(); // Remove all listeners
  },
});
