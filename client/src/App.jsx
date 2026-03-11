import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socketOptions = {
  autoConnect: false,
  withCredentials: true
};
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export default function App() {
  const [status, setStatus] = useState("checking");
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [activeUser, setActiveUser] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomsStatus, setRoomsStatus] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const activeRoomRef = useRef(null);
  const activeRoomData = rooms.find((room) => room.id === activeRoom);
  const now = Date.now();

  const getActivityBadge = (room) => {
    if (!room || !room.lastMessageAt) {
      return null;
    }
    const diff = now - room.lastMessageAt;
    const tenMinutes = 10 * 60 * 1000;
    const twelveHours = 12 * 60 * 60 * 1000;
    const fortyEightHours = 48 * 60 * 60 * 1000;

    if (diff <= tenMinutes) {
      return { label: "Active 10m", tone: "hot" };
    }
    if (diff <= twelveHours) {
      return { label: "Active 12h", tone: "warm" };
    }
    if (diff <= fortyEightHours) {
      return { label: "Active 48h", tone: "cool" };
    }
    return null;
  };

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("not signed in");
        }
        return res.json();
      })
      .then((data) => {
        setActiveUser(data.username);
        setAvatarUrl(data.avatarUrl || "");
        setStatus("logged-in");
      })
      .catch(() => {
        setStatus("logged-out");
      });
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [imageFile]);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    if (status !== "logged-in") {
      return;
    }

    const socket = io("/", socketOptions);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      if (activeRoomRef.current) {
        socket.emit("join-room", activeRoomRef.current);
      }
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("history", (payload) => {
      if (!payload || payload.roomId !== activeRoom) {
        return;
      }
      if (Array.isArray(payload.messages)) {
        setMessages(payload.messages);
      }
    });
    socket.on("message", (message) => {
      if (message.roomId !== activeRoom) {
        return;
      }
      setMessages((prev) => [...prev, message]);
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status]);

  useEffect(() => {
    if (!activeRoom || !socketRef.current) {
      return;
    }
    socketRef.current.emit("join-room", activeRoom);
  }, [activeRoom]);

  useEffect(() => {
    if (status !== "logged-in") {
      return;
    }

    setRoomsStatus("loading");
    fetch("/api/rooms", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("failed");
        }
        return res.json();
      })
      .then((data) => {
        setRooms(Array.isArray(data.rooms) ? data.rooms : []);
        setRoomsStatus("ready");
      })
      .catch(() => {
        setRoomsStatus("error");
      });
  }, [status]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identifier, password })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed.");
      return;
    }

    const data = await res.json();
    setActiveUser(data.username);
    setAvatarUrl(data.avatarUrl || "");
    setStatus("logged-in");
    setIdentifier("");
    setPassword("");
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setError("");

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, email, password })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Signup failed.");
      return;
    }

    const data = await res.json();
    setActiveUser(data.username);
    setAvatarUrl(data.avatarUrl || "");
    setStatus("logged-in");
    setUsername("");
    setEmail("");
    setPassword("");
  };

  const handleLogout = async () => {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include"
    });
    setMessages([]);
    setRooms([]);
    setActiveRoom(null);
    setRoomName("");
    setAvatarUrl("");
    setImageFile(null);
    setImagePreview("");
    setActiveUser("");
    setStatus("logged-out");
    setConnected(false);
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Avatar must be 12 MB or smaller.");
      return;
    }
    setError("");
    setAvatarUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/avatar", {
      method: "POST",
      credentials: "include",
      body: formData
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Avatar upload failed.");
      setAvatarUploading(false);
      return;
    }

    const data = await res.json();
    setAvatarUrl(data.avatarUrl || "");
    setAvatarUploading(false);
  };

  const handleImageChange = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Images must be 12 MB or smaller.");
      return;
    }
    setImageFile(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview("");
  };

  const handleCreateRoom = async (event) => {
    event.preventDefault();
    setError("");
    const name = roomName.trim();
    if (!name) {
      setError("Room name required.");
      return;
    }

    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not create room.");
      return;
    }

    const data = await res.json();
    const room = data.room;
    setRooms((prev) => [...prev, room]);
    setRoomName("");
  };

  const handleJoinRoom = (room) => {
    if (!room || !room.id) {
      return;
    }
    setActiveRoom(room.id);
    setMessages([]);
  };

  const handleSend = (event) => {
    event.preventDefault();
    if (!socketRef.current || !activeRoom || uploading) {
      return;
    }

    const trimmed = text.trim();
    if (!trimmed && !imageFile) {
      return;
    }

    const sendMessage = (imagePayload) => {
      socketRef.current.emit("message", {
        roomId: activeRoom,
        text: trimmed,
        imageUrl: imagePayload ? imagePayload.url : null,
        imageType: imagePayload ? imagePayload.contentType : null
      });
      setText("");
      clearImage();
    };

    if (imageFile) {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", imageFile);
      fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Upload failed.");
          }
          return res.json();
        })
        .then((data) => {
          sendMessage(data);
          setUploading(false);
        })
        .catch((err) => {
          setError(err.message || "Upload failed.");
          setUploading(false);
        });
      return;
    }

    sendMessage(null);
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="badge">NEXGREX</div>
        <h1>Networked Exchange for the Gregarious</h1>
        <p>One room. One pulse. All of us together.</p>
      </header>

      {status === "logged-out" && (
        <section className="card login">
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <div className="auth-toggle">
            <button
              type="button"
              className={mode === "login" ? "toggle active" : "toggle"}
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "toggle active" : "toggle"}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin}>
              <label>
                Username or email
                <input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="Your handle or email"
                  autoComplete="username"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="cta">
                Sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup}>
              <label>
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Choose a handle"
                  autoComplete="username"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="cta">
                Create account
              </button>
            </form>
          )}
        </section>
      )}

      {status === "checking" && (
        <section className="card status">Checking session...</section>
      )}

      {status === "logged-in" && (
        <section className="card room-hub">
          <div className="room-header">
            <div>
              <h2>NEXGREX Rooms</h2>
              <p className="tagline">
                Create a room, pull everyone in, and keep the thread moving.
              </p>
              <span className={connected ? "online" : "offline"}>
                {connected ? "Connected" : "Offline"}
              </span>
            </div>
            <div className="who">
              <div className="profile">
                <div className="avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" />
                  ) : (
                    <span>{activeUser ? activeUser[0]?.toUpperCase() : "?"}</span>
                  )}
                </div>
                <div className="profile-meta">
                  <span>{activeUser}</span>
                  <label className="avatar-upload">
                    {avatarUploading ? "Uploading..." : "Update avatar"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleAvatarChange}
                      disabled={avatarUploading}
                    />
                  </label>
                </div>
              </div>
              <button onClick={handleLogout} className="ghost">
                Sign out
              </button>
            </div>
          </div>

          <div className="room-grid">
            <div className="room-list">
              <div className="section-title">Available rooms</div>
              {roomsStatus === "loading" && <p>Loading rooms...</p>}
              {roomsStatus === "error" && (
                <p className="error">Could not load rooms.</p>
              )}
              {roomsStatus === "ready" && rooms.length === 0 && (
                <div className="empty-state">
                  <h3>No rooms yet</h3>
                  <p>Create the first room and set the tone.</p>
                </div>
              )}
              {rooms.length > 0 && (
                <div className="room-items">
                  {rooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className={
                        activeRoom === room.id ? "room-chip active" : "room-chip"
                      }
                      onClick={() => handleJoinRoom(room)}
                    >
                      {(() => {
                        const badge = getActivityBadge(room);
                        return (
                          <>
                            <div className="room-chip-top">
                              <span>{room.name}</span>
                              {badge && (
                                <span className={`badge-pill ${badge.tone}`}>
                                  {badge.label}
                                </span>
                              )}
                            </div>
                            <small>Created by {room.createdBy}</small>
                          </>
                        );
                      })()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="room-create">
              <div className="section-title">Create a room</div>
              <form onSubmit={handleCreateRoom}>
                <label>
                  Room name
                  <input
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    placeholder="e.g. Morning coffee"
                  />
                </label>
                {error && <p className="error">{error}</p>}
                <button type="submit" className="cta">
                  Create room
                </button>
              </form>
            </div>
          </div>

          {activeRoom && (
            <div className="chat">
              <div className="chat-header">
                <div>
                  <h3>{activeRoomData ? activeRoomData.name : "Room chat"}</h3>
                </div>
              </div>

              <div className="messages">
                {messages.length === 0 && (
                  <div className="empty-state">
                    <h3>No messages yet</h3>
                    <p>Start the conversation with a photo or hello.</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div className="message" key={msg.id}>
                    <div className="meta">
                      <span className="user">{msg.user}</span>
                      <span className="time">
                        {new Date(msg.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    {msg.text && <p>{msg.text}</p>}
                    {msg.imageUrl && (
                      <img
                        className="message-image"
                        src={msg.imageUrl}
                        alt="Uploaded"
                        loading="lazy"
                      />
                    )}
                  </div>
                ))}
              </div>

              <form className="composer" onSubmit={handleSend}>
                <div className="composer-input">
                  <input
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Say something bright"
                  />
                  {imagePreview && (
                    <div className="image-preview">
                      <img src={imagePreview} alt="Preview" />
                      <button type="button" onClick={clearImage}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                <div className="composer-actions">
                  <label className="ghost attach">
                    Upload
                    <input type="file" accept="image/*" onChange={handleImageChange} />
                  </label>
                  <label className="ghost attach">
                    Camera
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageChange}
                    />
                  </label>
                  <button type="submit" className="cta small" disabled={uploading}>
                    {uploading ? "Sending..." : "Send"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
