import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import QRCodeStyling from "qr-code-styling";

const socketOptions = {
  autoConnect: false,
  withCredentials: true
};
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const GLOBAL_ROOM_ID = "global";

// Theme color mapping for QR codes
const themeColors = {
  "neon-dreams": { primary: "#ff006e", bg: "#0a0e27" },
  "vintage-groove": { primary: "#d2691e", bg: "#f5d5a8" },
  "ocean-zen": { primary: "#0284c7", bg: "#e0f2fe" },
  "sunset-blaze": { primary: "#f97316", bg: "#fef3c7" },
  "royal-arcade": { primary: "#a855f7", bg: "#faf5ff" },
  "midnight": { primary: "#06b6d4", bg: "#0f172a" }
};

export default function App() {
  const [status, setStatus] = useState("checking");
  const [view, setView] = useState("chat");
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [signupInviteToken, setSignupInviteToken] = useState("");
  const [activeUser, setActiveUser] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [theme, setTheme] = useState("midnight");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [themesModalOpen, setThemesModalOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState(null);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const qrRef = useRef(null);
  const themes = [
    { id: "neon-dreams", label: "✨ Neon Dreams" },
    { id: "vintage-groove", label: "🎨 Vintage Groove" },
    { id: "ocean-zen", label: "🌊 Ocean Zen" },
    { id: "sunset-blaze", label: "🔥 Sunset Blaze" },
    { id: "royal-arcade", label: "🎮 Royal Arcade" },
    { id: "midnight", label: "🌙 Midnight" }
  ];
  const themeIds = new Set(themes.map((item) => item.id));
  const normalizeTheme = (value) => (themeIds.has(value) ? value : "midnight");

  useEffect(() => {
    // Check for invite token in URL
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setSignupInviteToken(tokenParam);
      setMode("signup");
    }

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
        setTheme(normalizeTheme(data.theme || "midnight"));
        setStatus("logged-in");
        setView("chat");
      })
      .catch(() => {
        setStatus("logged-out");
      });
  }, []);

  useEffect(() => {
    // Disable right-click context menu
    const handleContextMenu = (e) => e.preventDefault();
    
    // Disable long-press on mobile
    const handleTouchStart = (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", handleContextMenu, false);
    document.addEventListener("touchstart", handleTouchStart, false);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, false);
      document.removeEventListener("touchstart", handleTouchStart, false);
    };
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
    if (!menuOpen) {
      return;
    }

    const handleClickOutside = (e) => {
      // Check if click is on avatar button or inside menu
      const avatarButton = document.querySelector(".avatar-button");
      const menu = document.querySelector(".menu");
      
      if (!(avatarButton?.contains(e.target) || menu?.contains(e.target))) {
        setMenuOpen(false);
      }
    };

    const handleScroll = () => {
      setMenuOpen(false);
    };

    const handleTouchMove = () => {
      setMenuOpen(false);
    };

    // Small delay to prevent immediate closing on the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("scroll", handleScroll, true);
      document.addEventListener("touchmove", handleTouchMove);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!messagesEndRef.current) {
      return;
    }
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!inviteToken || !qrRef.current) {
      return;
    }

    const qrCode = new QRCodeStyling({
      width: 220,
      height: 220,
      type: "canvas",
      data: `${window.location.origin}/?token=${encodeURIComponent(inviteToken)}`,
      image: "",
      dotsOptions: {
        color: themeColors[theme]?.primary || "#000000",
        type: "rounded"
      },
      backgroundOptions: {
        color: themeColors[theme]?.bg || "#ffffff"
      },
      cornersSquareOptions: {
        type: "extra-rounded"
      },
      cornersDotOptions: {
        type: "dot"
      },
      margin: 10
    });

    // Clear previous QR code
    qrRef.current.innerHTML = "";
    qrCode.append(qrRef.current);
  }, [inviteToken, theme]);

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
      body: JSON.stringify({ username, email, password, inviteToken: signupInviteToken })
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
    setSignupInviteToken("");
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

  const handleGenerateInvite = async () => {
    setInviteLoading(true);
    setError("");

    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        credentials: "include"
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate invite.");
      }

      const data = await res.json();
      setInviteToken(data.token);
    } catch (err) {
      setError(err.message || "Failed to generate invite.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleDownloadImage = async (imageUrl) => {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error("Failed to download image");
      }
      const blob = await response.blob();
      
      // Create a temporary URL for the blob
      const blobUrl = URL.createObjectURL(blob);
      
      // Create a temporary anchor element and trigger download
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `nexgrex-image-${Date.now()}.jpg`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      
      // Clean up the blob URL
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError("Failed to download image");
    }
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
                setProfileModalOpen(true);
                setMenuOpen(false);
              }}
            >
              👤 Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setThemesModalOpen(true);
                setMenuOpen(false);
              }}
            >
              🎨 Themes
            </button>
            <div className="menu-divider" />
            <button
              type="button"
              onClick={() => {
                handleGenerateInvite();
                setMenuOpen(false);
              }}
              disabled={inviteLoading}
              className="menu-action"
            >
              {inviteLoading ? "Generating..." : "🔗 Generate Invite"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await handleLogout();
                setMenuOpen(false);
              }}
              className="menu-action"
            >
              ✌️ Log-out
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
              <label>
                Invite Code
                <input
                  value={signupInviteToken}
                  onChange={(event) => setSignupInviteToken(event.target.value)}
                  placeholder="Enter your invite token"
                  autoComplete="off"
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
              {inviteToken && (
                <div className="invite-display">
                  <p className="invite-label">Share this invite link:</p>
                  <div className="invite-token-container">
                    <code className="invite-token">{`${window.location.origin}/?token=${encodeURIComponent(inviteToken)}`}</code>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/?token=${encodeURIComponent(inviteToken)}`);
                        setInviteToken("");
                      }}
                    >
                      Copy & Close
                    </button>
                  </div>
                  <div className="invite-qr">
                    <p className="invite-qr-label">Join via QR Code</p>
                    <div className="qr-container">
                      <div ref={qrRef} className="qr-code"></div>
                      <div className="qr-overlay">
                        <span className="qr-arrow">↓ Scan Me ↓</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {error && <p className="error" style={{ margin: "12px 0" }}>{error}</p>}
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
                          onClick={() => setSelectedImageUrl(msg.imageUrl)}
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

          {/* Image Lightbox Modal */}
          {selectedImageUrl && (
            <div className="lightbox-overlay" onClick={() => setSelectedImageUrl(null)}>
              <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="lightbox-close"
                  onClick={() => setSelectedImageUrl(null)}
                >
                  ✕
                </button>
                <img src={selectedImageUrl} alt="Full view" className="lightbox-image" />
                <div className="lightbox-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => handleDownloadImage(selectedImageUrl)}
                  >
                    📥 Download
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedImageUrl);
                      setError("Image URL copied!");
                      setTimeout(() => setError(""), 2000);
                    }}
                  >
                    🔗 Copy URL
                  </button>
                </div>
              </div>
            </div>
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

          {/* Profile Modal */}
          {profileModalOpen && (
            <div className="modal-overlay" onClick={() => setProfileModalOpen(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>👤 Profile</h3>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setProfileModalOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="modal-body">
                  <div className="modal-section">
                    <label className="avatar-upload-label">
                      {avatarUrl && <img src={avatarUrl} alt="Current avatar" className="avatar-preview" />}
                      <div className="upload-button">
                        {avatarUploading ? "Uploading..." : "📸 Update avatar"}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleAvatarChange}
                        disabled={avatarUploading}
                      />
                    </label>
                  </div>
                  {error && <p className="error">{error}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Themes Modal */}
          {themesModalOpen && (
            <div className="modal-overlay" onClick={() => setThemesModalOpen(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>🎨 Select Theme</h3>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setThemesModalOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="modal-body">
                  <div className="theme-grid">
                    {themes.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={theme === item.id ? "theme-card active" : "theme-card"}
                        onClick={() => {
                          handleThemeChange(item.id);
                          setThemesModalOpen(false);
                        }}
                      >
                        <span>{item.label}</span>
                        <small>{item.id}</small>
                      </button>
                    ))}
                  </div>
                  {error && <p className="error">{error}</p>}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
