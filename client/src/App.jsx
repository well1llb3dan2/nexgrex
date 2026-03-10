import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socketOptions = {
  autoConnect: false,
  withCredentials: true
};

export default function App() {
  const [status, setStatus] = useState("checking");
  const [username, setUsername] = useState("");
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
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed.");
      return;
    }

    const data = await res.json();
    setActiveUser(data.username);
    setStatus("logged-in");
    setUsername("");
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
          <h2>Enter the room</h2>
          <form onSubmit={handleLogin}>
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
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Make it memorable"
                autoComplete="current-password"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="cta">
              Join NEXGREX
            </button>
          </form>
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
