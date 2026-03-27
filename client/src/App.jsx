import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socketOptions = {
  autoConnect: false,
  withCredentials: true
};
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const GLOBAL_ROOM_ID = "global";

export default function App() {
  const [status, setStatus] = useState("checking");
  const [view, setView] = useState("chat");
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [activeUser, setActiveUser] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [theme, setTheme] = useState("atlas");
  const [menuOpen, setMenuOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const themes = [
    { id: "atlas", label: "Atlas Drift" },
    { id: "velvet", label: "Velvet Circuit" },
    { id: "signal", label: "Signal Bloom" },
    { id: "canyon", label: "Canyon Relay" },
    { id: "glacier", label: "Glacier Echo" }
  ];
  const themeIds = new Set(themes.map((item) => item.id));
  const normalizeTheme = (value) => (themeIds.has(value) ? value : "atlas");

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
        setTheme(normalizeTheme(data.theme || "atlas"));
        setStatus("logged-in");
        setView("chat");
      })
      .catch(() => {
        setStatus("logged-out");
      });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
    if (status !== "logged-in") {
      return;
    }

    const socket = io("/", socketOptions);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("history", (payload) => {
      if (!payload || !Array.isArray(payload.messages)) {
        return;
      }
      setMessages(payload.messages);
    });
    socket.on("message", (message) => {
      if (!message) {
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
    if (!messagesEndRef.current) {
      return;
    }
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    setTheme(normalizeTheme(data.theme || "atlas"));
    setStatus("logged-in");
    setView("chat");
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
    setTheme(normalizeTheme(data.theme || "atlas"));
    setStatus("logged-in");
    setView("chat");
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
    setImageFile(null);
    setImagePreview("");
    setActiveUser("");
    setTheme("atlas");
    setView("chat");
    setMenuOpen(false);
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

  const handleThemeChange = async (nextTheme) => {
    setError("");
    const res = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ theme: nextTheme })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not update theme.");
      return;
    }

    const data = await res.json();
    setTheme(data.theme || nextTheme);
  };

  const TitleBar = ({
    title,
    onBack,
    showMenu,
    onAvatarClick,
    avatarDisabled
  }) => (
    <div className="title-bar">
      <div className="title-left">
        {onBack ? (
          <button type="button" className="ghost back" onClick={onBack}>
            Back
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="title-center">{title}</div>
      <div className="title-right">
        <button
          type="button"
          className="avatar-button"
          onClick={avatarDisabled ? undefined : onAvatarClick}
          disabled={avatarDisabled || !onAvatarClick}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" />
          ) : (
            <span>{activeUser ? activeUser[0]?.toUpperCase() : "?"}</span>
          )}
        </button>
        {showMenu && (
          <div className="menu">
            <button
              type="button"
              onClick={() => {
                setView("options");
                setMenuOpen(false);
              }}
            >
              Options
            </button>
            <button type="button" onClick={handleLogout}>
              Log-out
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const handleSend = (event) => {
    event.preventDefault();
    if (!socketRef.current || uploading) {
      return;
    }

    const trimmed = text.trim();
    if (!trimmed && !imageFile) {
      return;
    }

    const sendMessage = (imagePayload) => {
      socketRef.current.emit("message", {
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
      {status !== "logged-in" && (
        <header className="hero">
          <div className="badge">NEXGREX</div>
          <h1>Networked Exchange for the Gregarious</h1>
          <p>One room. One pulse. All of us together.</p>
        </header>
      )}

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
        <section className="card app-shell">
          {view === "chat" && (
            <>
              <TitleBar
                title="NEXGREX"
                onBack={null}
                showMenu={menuOpen}
                onAvatarClick={() => setMenuOpen((prev) => !prev)}
              />
              <div className="chat">
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
                  <div ref={messagesEndRef} />
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
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                      />
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
            </>
          )}

          {view === "options" && (
            <>
              <TitleBar
                title="Options"
                onBack={() => setView("chat")}
                showMenu={false}
                onAvatarClick={null}
                avatarDisabled
              />
              <div className="options">
                <div className="section-title">Profile</div>
                <div className="option-card">
                  <span>Avatar</span>
                  <label className="ghost attach">
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
                <div className="section-title">Themes</div>
                <div className="theme-grid">
                  {themes.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={theme === item.id ? "theme-card active" : "theme-card"}
                      onClick={() => handleThemeChange(item.id)}
                    >
                      <span>{item.label}</span>
                      <small>{item.id}</small>
                    </button>
                  ))}
                </div>
                {error && <p className="error">{error}</p>}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
