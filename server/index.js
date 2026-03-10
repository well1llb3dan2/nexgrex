const express = require("express");
const http = require("http");
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const cookie = require("cookie");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const NODE_ENV = process.env.NODE_ENV || "development";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true
  }
});

const users = new Map();
const sessions = new Map();
const messages = [];

app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

function normalizeUsername(value) {
  return String(value || "").trim();
}

function createSession(username) {
  const sid = uuidv4();
  sessions.set(sid, username);
  return sid;
}

function getSessionUsername(req) {
  const sid = req.cookies.sid;
  if (!sid) {
    return null;
  }
  return sessions.get(sid) || null;
}

app.post("/api/login", async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required." });
  }

  const existing = users.get(username);

  if (existing) {
    const ok = await bcrypt.compare(password, existing.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    users.set(username, { passwordHash });
  }

  const sid = createSession(username);
  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 12
  });

  return res.json({ username });
});

app.post("/api/logout", (req, res) => {
  const sid = req.cookies.sid;
  if (sid) {
    sessions.delete(sid);
  }
  res.clearCookie("sid");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const username = getSessionUsername(req);
  if (!username) {
    return res.status(401).json({ error: "Not signed in." });
  }
  return res.json({ username });
});

if (NODE_ENV === "production") {
  const distPath = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

io.use((socket, next) => {
  const rawCookie = socket.handshake.headers.cookie || "";
  const parsed = cookie.parse(rawCookie);
  const sid = parsed.sid;
  const username = sid ? sessions.get(sid) : null;

  if (!username) {
    return next(new Error("unauthorized"));
  }

  socket.data.username = username;
  return next();
});

io.on("connection", (socket) => {
  socket.join("global");
  socket.emit("history", messages);

  socket.on("message", (text) => {
    if (typeof text !== "string") {
      return;
    }
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) {
      return;
    }

    const msg = {
      id: uuidv4(),
      user: socket.data.username,
      text: trimmed,
      ts: Date.now()
    };

    messages.push(msg);
    if (messages.length > 200) {
      messages.shift();
    }

    io.to("global").emit("message", msg);
  });
});

server.listen(PORT, () => {
  console.log(`NEXGREX server listening on ${PORT}`);
});
