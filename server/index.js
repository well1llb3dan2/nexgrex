const express = require("express");
const http = require("http");
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const cookie = require("cookie");
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const NODE_ENV = process.env.NODE_ENV || "development";
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "nexgrex";
const SESSION_HOURS = 12;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true
  }
});

let usersCollection;
let sessionsCollection;
let messagesCollection;

app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /.+@.+\..+/.test(value);
}

async function createSession(username) {
  const sid = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await sessionsCollection.insertOne({ sid, username, expiresAt });
  return sid;
}

async function getSessionUsername(req) {
  const sid = req.cookies.sid;
  if (!sid) {
    return null;
  }

  const session = await sessionsCollection.findOne({ sid });
  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.username;
}

app.post("/api/signup", async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, and password required." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email." });
  }

  const existing = await usersCollection.findOne({
    $or: [{ username }, { email }]
  });
  if (existing) {
    return res.status(409).json({ error: "Username or email already exists." });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await usersCollection.insertOne({
      username,
      email,
      passwordHash,
      createdAt: new Date()
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ error: "Username or email already exists." });
    }
    return res.status(500).json({ error: "Could not create account." });
  }

  const sid = await createSession(username);
  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 12
  });

  return res.json({ username });
});

app.post("/api/login", async (req, res) => {
  const identifier = normalizeUsername(req.body.identifier);
  const password = String(req.body.password || "");

  if (!identifier || !password) {
    return res.status(400).json({ error: "Username or email and password required." });
  }

  const lookup = identifier.includes("@")
    ? { email: normalizeEmail(identifier) }
    : { username: identifier };

  const existing = await usersCollection.findOne(lookup);
  if (!existing) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const ok = await bcrypt.compare(password, existing.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const sid = await createSession(existing.username);
  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 12
  });

  return res.json({ username: existing.username });
});

app.post("/api/logout", (req, res) => {
  const sid = req.cookies.sid;
  if (sid) {
    sessionsCollection.deleteOne({ sid }).catch(() => {});
  }
  res.clearCookie("sid");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  getSessionUsername(req)
    .then((username) => {
      if (!username) {
        return res.status(401).json({ error: "Not signed in." });
      }
      return res.json({ username });
    })
    .catch(() => res.status(500).json({ error: "Server error." }));
});

if (NODE_ENV === "production") {
  const distPath = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

io.use(async (socket, next) => {
  try {
    const rawCookie = socket.handshake.headers.cookie || "";
    const parsed = cookie.parse(rawCookie);
    const sid = parsed.sid;
    if (!sid) {
      return next(new Error("unauthorized"));
    }

    const session = await sessionsCollection.findOne({ sid });
    if (!session || session.expiresAt < new Date()) {
      return next(new Error("unauthorized"));
    }

    socket.data.username = session.username;
    return next();
  } catch (error) {
    return next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.join("global");
  messagesCollection
    .find({})
    .sort({ ts: -1 })
    .limit(200)
    .toArray()
    .then((docs) => {
      socket.emit("history", docs.reverse());
    })
    .catch(() => {
      socket.emit("history", []);
    });

  socket.on("message", async (text) => {
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

    try {
      await messagesCollection.insertOne(msg);
      io.to("global").emit("message", msg);
    } catch (error) {
      socket.emit("error", "Message failed to save.");
    }
  });
});

async function start() {
  if (!MONGODB_URI) {
    console.error("Missing MONGODB_URI. Set it before starting the server.");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  usersCollection = db.collection("users");
  sessionsCollection = db.collection("sessions");
  messagesCollection = db.collection("messages");

  await usersCollection.createIndex({ username: 1 }, { unique: true });
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  await sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await messagesCollection.createIndex({ ts: -1 });

  server.listen(PORT, () => {
    console.log(`NEXGREX server listening on ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
