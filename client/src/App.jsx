import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import QRCodeStyling from "qr-code-styling";

const socketOptions = {
  autoConnect: false,
  withCredentials: true
};
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const AVATAR_MAX_DIMENSION = 1024;
const AVATAR_OUTPUT_TYPE = "image/jpeg";
const AVATAR_OUTPUT_QUALITY = 0.82;
const QR_PRIMARY = "#55d6be";
const QR_BG = "#0b0f14";

function buildNotificationBody(message) {
  if (!message) {
    return "New message";
  }

  if (message.text && message.text.trim()) {
    return message.text.trim().slice(0, 120);
  }

  if (message.imageUrl) {
    return "Sent an image";
  }

  return "New message";
}

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image."));
    };

    image.src = objectUrl;
  });

const resizeAvatarForUpload = async (file) => {
  if (!file || !file.type.startsWith("image/")) {
    return file;
  }

  const image = await loadImageFromFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    return file;
  }

  const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  // Keep smaller avatars untouched unless they are still heavy.
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, AVATAR_OUTPUT_TYPE, AVATAR_OUTPUT_QUALITY);
  });

  if (!blob || blob.size === 0) {
    return file;
  }

  const stem = (file.name || "avatar").replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${stem}.jpg`, {
    type: AVATAR_OUTPUT_TYPE,
    lastModified: Date.now()
  });
};

function TitleBar({
  title,
  onBack,
  theme,
  onToggleTheme,
  showMenu,
  onAvatarClick,
  avatarDisabled,
  avatarUrl,
  activeUser,
  inviteLoading,
  onOpenProfile,
  onGenerateInvite,
  onLogout
}) {
  return (
    <div className="title-bar">
      <div className="title-left">
        {onBack ? (
          <button type="button" className="ghost back" onClick={onBack}>
            Back
          </button>
        ) : (
          <button
            type="button"
            className="ghost small theme-toggle"
            onClick={onToggleTheme}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? (<><span className="theme-icon">🌙</span><span className="theme-label">Dark</span></>) : (<><span className="theme-icon">☀️</span><span className="theme-label">Light</span></>)}
          </button>
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
            <button type="button" onClick={onOpenProfile} className="menu-item">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M4.5 19.5c1.8-3 4.6-4.5 7.5-4.5s5.7 1.5 7.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <span>Profile</span>
            </button>
            <div className="menu-divider" />
            <button
              type="button"
              onClick={onGenerateInvite}
              disabled={inviteLoading}
              className="menu-action menu-item"
            >
              {inviteLoading ? (
                "Generating..."
              ) : (
                <>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M9.5 14.5l-1.5 1.5a3 3 0 0 1-4.25-4.25l3.5-3.5a3 3 0 0 1 4.25 0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M14.5 9.5l1.5-1.5a3 3 0 0 1 4.25 4.25l-3.5 3.5a3 3 0 0 1-4.25 0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 15l6-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>Generate Invite</span>
                </>
              )}
            </button>
            <button type="button" onClick={onLogout} className="menu-action menu-item">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M14.5 7.5V6a2.5 2.5 0 0 0-2.5-2.5H6.5A2.5 2.5 0 0 0 4 6v12a2.5 2.5 0 0 0 2.5 2.5H12a2.5 2.5 0 0 0 2.5-2.5v-1.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M9.5 12h10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M16.5 9l3 3-3 3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Log out</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState("checking");
  const [theme, setTheme] = useState(() => {
    try {
      const stored = window.localStorage.getItem("nexgrex-theme");
      return stored === "light" ? "light" : "midnight";
    } catch {
      return "midnight";
    }
  });
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [signupInviteToken, setSignupInviteToken] = useState("");
  const [activeUser, setActiveUser] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [imageUploadModalOpen, setImageUploadModalOpen] = useState(false);
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
  const [avatarUploadModalOpen, setAvatarUploadModalOpen] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [oldestLoadedTs, setOldestLoadedTs] = useState(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const socketRef = useRef(null);
  const avatarUploadRef = useRef(null);
  const avatarCameraRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const qrRef = useRef(null);
  const preserveScrollRef = useRef(null);
  const skipAutoScrollRef = useRef(false);
  const lastNotifiedMessageIdRef = useRef(null);
  const activeUserRef = useRef("");
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    activeUserRef.current = activeUser || "";
  }, [activeUser]);

  const notifyIncomingMessage = async (message) => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    if (document.visibilityState === "visible") {
      return;
    }

    const title = message.user ? `${message.user} @ NEXGREX` : "NEXGREX";
    const body = buildNotificationBody(message);
    const options = {
      body,
      tag: message.id || `msg-${Date.now()}`,
      renotify: false
    };

    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
      } else {
        // Fallback when service worker is unavailable.
        new Notification(title, options);
      }
    } catch {
      // Ignore notification errors to avoid blocking chat flow.
    }
  };

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
        setStatus("logged-in");
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

  useLayoutEffect(() => {
    if (document.documentElement.dataset.theme !== theme) {
      document.documentElement.dataset.theme = theme;
    }
    try {
      if (window.localStorage.getItem("nexgrex-theme") !== theme) {
        window.localStorage.setItem("nexgrex-theme", theme);
      }
    } catch {
      // Ignore storage errors.
    }
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

    if (typeof window !== "undefined" && typeof Notification !== "undefined") {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, [status]);

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
      setHasMoreHistory(Boolean(payload.hasMore));
      setOldestLoadedTs(payload.nextBeforeTs || null);
    });

    socket.on("history:older", (payload) => {
      setLoadingOlderMessages(false);
      if (!payload || !Array.isArray(payload.messages)) {
        preserveScrollRef.current = null;
        return;
      }

      if (!payload.messages.length) {
        setHasMoreHistory(false);
        preserveScrollRef.current = null;
        return;
      }

      skipAutoScrollRef.current = true;
      setMessages((prev) => {
        const existing = new Set(prev.map((msg) => msg.id));
        const olderUnique = payload.messages.filter((msg) => !existing.has(msg.id));
        return [...olderUnique, ...prev];
      });
      setHasMoreHistory(Boolean(payload.hasMore));
      setOldestLoadedTs(payload.nextBeforeTs || null);
    });

    socket.on("message", (message) => {
      if (!message) {
        return;
      }

      if (message.id && lastNotifiedMessageIdRef.current === message.id) {
        return;
      }

      const isOwn = Boolean(activeUserRef.current && message.user === activeUserRef.current);
      if (!isOwn) {
        lastNotifiedMessageIdRef.current = message.id || null;
        notifyIncomingMessage(message);
      }

      setMessages((prev) => [...prev, { ...message, _live: true }]);
    });

    socket.connect();

    return () => {
      socket.off("history");
      socket.off("history:older");
      socket.off("message");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status]);

  useEffect(() => {
    if (status !== "logged-in") {
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      if (!socketRef.current || loadingOlderMessages || !hasMoreHistory || !oldestLoadedTs) {
        return;
      }
      if (container.scrollTop > 120) {
        return;
      }

      preserveScrollRef.current = container.scrollHeight;
      setLoadingOlderMessages(true);
      socketRef.current.emit("loadOlderMessages", { beforeTs: oldestLoadedTs });
    };

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [status, hasMoreHistory, loadingOlderMessages, oldestLoadedTs]);

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
    const container = messagesContainerRef.current;
    if (!container || !messagesEndRef.current) {
      return;
    }

    if (preserveScrollRef.current != null) {
      const previousHeight = preserveScrollRef.current;
      preserveScrollRef.current = null;
      container.scrollTop += container.scrollHeight - previousHeight;
      return;
    }

    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }

    messagesEndRef.current.scrollIntoView({ behavior: initialLoadDoneRef.current ? "smooth" : "instant" });
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
    }
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
        color: QR_PRIMARY,
        type: "rounded"
      },
      backgroundOptions: {
        color: QR_BG
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
  }, [inviteToken]);

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
    setStatus("logged-in");
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
    setMenuOpen(false);
    setStatus("logged-out");
    setConnected(false);
  };

  const uploadAvatarFile = async (file) => {
    if (!file) {
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Avatar must be 12 MB or smaller.");
      return;
    }
    setError("");
    setAvatarUploading(true);
    setAvatarUploadModalOpen(false);

    let uploadFile = file;
    try {
      uploadFile = await resizeAvatarForUpload(file);
    } catch (err) {
      uploadFile = file;
    }

    if (uploadFile.size > MAX_IMAGE_BYTES) {
      setError("Avatar is still too large after resize. Try a smaller image.");
      setAvatarUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadFile);

    try {
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
    } catch (err) {
      setError("Avatar upload failed.");
      setAvatarUploading(false);
    }
  };

  const handleAvatarUploadChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (avatarUploadRef.current) {
      avatarUploadRef.current.value = "";
    }
    await uploadAvatarFile(file);
  };

  const handleAvatarCameraChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (avatarCameraRef.current) {
      avatarCameraRef.current.value = "";
    }
    await uploadAvatarFile(file);
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
      // Use server proxy to bypass CORS
      const proxyUrl = `/api/download?url=${encodeURIComponent(imageUrl)}`;
      const response = await fetch(proxyUrl, { credentials: "include" });
      
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

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "midnight" : "light"));
  };

  const formatMessageDate = (timestamp) =>
    new Date(timestamp).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });

  return (
    <div className="page">
      {status !== "logged-in" && (
        <header className="hero">
          <div className="badge">NEXGREX</div>
          <h1>Signal the room</h1>
          <p>Private invites, a single shared feed, and a sharper way to keep the thread alive.</p>
        </header>
      )}

      {status === "logged-out" && (
        <section className="card login">
          <h2>{mode === "login" ? "Return to the exchange" : "Create your access"}</h2>
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
                Enter
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
                Join Nexgrex
              </button>
            </form>
          )}
        </section>
      )}

      {status === "checking" && null}

      {status === "logged-in" && (
        <section className="card app-shell">
          <>
            <TitleBar
              title="NEXGREX"
              onBack={null}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              showMenu={menuOpen}
              onAvatarClick={() => setMenuOpen((prev) => !prev)}
              avatarUrl={avatarUrl}
              activeUser={activeUser}
              inviteLoading={inviteLoading}
              onOpenProfile={() => { setProfileModalOpen(true); setMenuOpen(false); }}
              onGenerateInvite={() => { handleGenerateInvite(); setMenuOpen(false); }}
              onLogout={async () => { await handleLogout(); setMenuOpen(false); }}
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
              <div className="messages" ref={messagesContainerRef}>
                {loadingOlderMessages && <div className="history-status">Loading older messages...</div>}
                {messages.length === 0 && (
                  <div className="empty-state">
                    <h3>No messages yet</h3>
                    <p>Start the conversation with a photo or hello.</p>
                  </div>
                )}
                {messages.map((msg, index) => {
                  const isOwn = Boolean(activeUser && msg.user === activeUser);
                  const prevMessage = index > 0 ? messages[index - 1] : null;
                  const currentDayKey = new Date(msg.ts).toDateString();
                  const prevDayKey = prevMessage ? new Date(prevMessage.ts).toDateString() : null;
                  const showDateDivider = currentDayKey !== prevDayKey;

                  const formattedTime = new Date(msg.ts).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true
                  });

                  return (
                    <Fragment key={msg.id}>
                      {showDateDivider && (
                        <div className="date-divider" role="separator" aria-label={formatMessageDate(msg.ts)}>
                          <span>{formatMessageDate(msg.ts)}</span>
                        </div>
                      )}
                      <div className={isOwn ? "message-row own" : "message-row"}>
                        <div className={msg._live ? "message animate-in" : "message"}>
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
                        <div className={isOwn ? "message-footer own" : "message-footer"}>
                          {!isOwn && (
                            <div className="message-avatar" aria-hidden="true">
                              {msg.avatarUrl ? (
                                <img src={msg.avatarUrl} alt="" loading="lazy" />
                              ) : (
                                <span>{msg.user ? msg.user[0]?.toUpperCase() : "?"}</span>
                              )}
                            </div>
                          )}
                          {isOwn ? (
                            <span className="time">{formattedTime}</span>
                          ) : (
                            <>
                              <span className="user">{msg.user}</span>
                              <span className="time">{formattedTime}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form className="composer" onSubmit={handleSend}>
                <button
                  type="button"
                  className="composer-icon-button"
                  onClick={() => setImageUploadModalOpen(true)}
                  title="Upload image"
                  aria-label="Open image uploader"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4 7.5h3l1.5-2h7L17 7.5h3c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5h-16c-.83 0-1.5-.67-1.5-1.5v-8c0-.83.67-1.5 1.5-1.5zm8 2.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="14" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </button>
                <input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                    placeholder="Drop a signal"
                  className="composer-input"
                />
                <button
                  type="submit"
                  className="composer-icon-button"
                  disabled={uploading}
                  title="Send message"
                  aria-label="Send message"
                >
                  {uploading ? (
                    "…"
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3.5 11.5l16.5-7.5-4.5 16-3.5-5.5-8.5-3z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 14.5l3-7.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>
              </form>
              {imagePreview && (
                <div className="image-preview-inline">
                  <img src={imagePreview} alt="Preview" />
                  <button type="button" onClick={clearImage} className="delete-preview">
                    ✕
                  </button>
                </div>
              )}
            </div>
          </>

          {/* Image Upload Modal */}
          {imageUploadModalOpen && (
            <div className="modal-overlay" onClick={() => setImageUploadModalOpen(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>📸 Upload Image</h3>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setImageUploadModalOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="modal-body">
                  <div className="modal-section">
                    <label className="upload-option">
                      <div className="upload-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 7.5h6l2 2h8.5c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5h-16c-.83 0-1.5-.67-1.5-1.5v-9c0-.83.67-1.5 1.5-1.5z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <span>Choose from Gallery</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          handleImageChange(e);
                          setImageUploadModalOpen(false);
                        }}
                      />
                    </label>
                    <label className="upload-option">
                      <div className="upload-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 7.5h3l1.5-2h7L17 7.5h3c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5h-16c-.83 0-1.5-.67-1.5-1.5v-8c0-.83.67-1.5 1.5-1.5zm8 2.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                          />
                          <circle cx="12" cy="14" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                      </div>
                      <span>Take a Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          handleImageChange(e);
                          setImageUploadModalOpen(false);
                        }}
                      />
                    </label>
                  </div>
                  {imagePreview && (
                    <div className="modal-section">
                      <button type="button" className="danger" onClick={() => { clearImage(); setImageUploadModalOpen(false); }}>
                        Clear Selection
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
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
                    {avatarUrl && <img src={avatarUrl} alt="Current avatar" className="avatar-preview" />}
                    <button
                      type="button"
                      className="cta"
                      onClick={() => setAvatarUploadModalOpen(true)}
                      disabled={avatarUploading}
                    >
                      {avatarUploading ? "Uploading..." : "📸 Update avatar"}
                    </button>
                  </div>
                  {error && <p className="error">{error}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Avatar Upload Modal */}
          {avatarUploadModalOpen && (
            <div className="modal-overlay" onClick={() => setAvatarUploadModalOpen(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>📸 Update Avatar</h3>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setAvatarUploadModalOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="modal-body">
                  <div className="modal-section" style={{ gap: "12px" }}>
                    <label className="cta">
                      📷 Take Photo
                      <input
                        ref={avatarCameraRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleAvatarCameraChange}
                        disabled={avatarUploading}
                        style={{ display: "none" }}
                      />
                    </label>
                    <label className="cta">
                      📁 Upload Photo
                      <input
                        ref={avatarUploadRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUploadChange}
                        disabled={avatarUploading}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

        </section>
      )}
    </div>
  );
}
