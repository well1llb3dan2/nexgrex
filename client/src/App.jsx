import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socketOptions = {
  autoConnect: false,
  withCredentials: true
};

export default function App() {
  const [status, setStatus] = useState("checking");
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [activeUser, setActiveUser] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

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
        setStatus("logged-in");
      })
      .catch(() => {
        setStatus("logged-out");
      });
  }, []);

  useEffect(() => {
    if (status !== "logged-in") {
      return;
    }

    const socket = io("/", socketOptions);
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("history", (history) => {
      if (Array.isArray(history)) {
        setMessages(history);
      }
    });
    socket.on("message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
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
    setActiveUser("");
    setStatus("logged-out");
    setConnected(false);
  };

  const handleSend = (event) => {
    event.preventDefault();
    if (!text.trim() || !socketRef.current) {
      return;
    }
    socketRef.current.emit("message", text);
    setText("");
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
        <section className="card chat">
          <div className="chat-header">
            <div>
              <h2>Global Room</h2>
              <span className={connected ? "online" : "offline"}>
                {connected ? "Connected" : "Offline"}
              </span>
            </div>
            <div className="who">
              <span>{activeUser}</span>
              <button onClick={handleLogout} className="ghost">
                Sign out
              </button>
            </div>
          </div>

          <div className="messages">
            {messages.map((msg) => (
              <div className="message" key={msg.id}>
                <div className="meta">
                  <span className="user">{msg.user}</span>
                  <span className="time">
                    {new Date(msg.ts).toLocaleTimeString()}
                  </span>
                </div>
                <p>{msg.text}</p>
              </div>
            ))}
          </div>

          <form className="composer" onSubmit={handleSend}>
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Say something bright"
            />
            <button type="submit" className="cta small">
              Send
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
