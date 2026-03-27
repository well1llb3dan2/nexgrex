const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const express = require("express");
const http = require("http");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const cookie = require("cookie");
const bcrypt = require("bcryptjs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require("uuid");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const NODE_ENV = process.env.NODE_ENV || "development";
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "nexgrex";
const SESSION_HOURS = 12;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const DEFAULT_THEME = "atlas";
const THEMES = new Set(["atlas", "velvet", "signal", "canyon", "glacier"]);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif"
]);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES }
});

let usersCollection;
let sessionsCollection;
let messagesCollection;

const GLOBAL_ROOM_ID = "global";

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

function ensureR2Config() {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    throw new Error("Missing R2 configuration.");
  }
}

function getFileExtension(mimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return null;
  }
}

async function uploadImageToR2(file, prefix) {
  ensureR2Config();
  const ext = getFileExtension(file.mimetype);
  if (!ext || !ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    const error = new Error("Unsupported image type.");
    error.code = "UNSUPPORTED_TYPE";
    throw error;
  }

  const key = `${prefix}/${uuidv4()}.${ext}`;
  const client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }));

  const baseUrl = String(R2_PUBLIC_URL || "").replace(/\/+$/, "");
  return {
    url: `${baseUrl}/${key}`,
    contentType: file.mimetype,
    size: file.size
  };
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

async function requireUser(req, res) {
  try {
    const username = await getSessionUsername(req);
    if (!username) {
      res.status(401).json({ error: "Not signed in." });
      return null;
    }
    return username;
  } catch (error) {
    res.status(500).json({ error: "Server error." });
    return null;
  }
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
      avatarUrl: null,
      theme: DEFAULT_THEME,
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

  return res.json({ username, avatarUrl: null, theme: DEFAULT_THEME });
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

  return res.json({
    username: existing.username,
    avatarUrl: existing.avatarUrl || null,
    theme: existing.theme || DEFAULT_THEME
  });
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
      return usersCollection
        .findOne({ username })
        .then((user) =>
          res.json({
            username,
            avatarUrl: user ? user.avatarUrl || null : null,
            theme: user ? user.theme || DEFAULT_THEME : DEFAULT_THEME
          })
        )
        .catch(() => res.status(500).json({ error: "Server error." }));
    })
    .catch(() => res.status(500).json({ error: "Server error." }));
});

app.patch("/api/preferences", async (req, res) => {
  const username = await requireUser(req, res);
  if (!username) {
    return;
  }

  const theme = String(req.body.theme || "").trim();
  if (!theme || !THEMES.has(theme)) {
    return res.status(400).json({ error: "Invalid theme." });
  }

  await usersCollection.updateOne({ username }, { $set: { theme } });
  return res.json({ theme });
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  const username = await requireUser(req, res);
  if (!username) {
    return;
  }

  if (!req.file) {
    return res.status(400).json({ error: "File required." });
  }

  try {
    const result = await uploadImageToR2(req.file, "messages");
    return res.json({ url: result.url, contentType: result.contentType, size: result.size });
  } catch (error) {
    if (error && error.code === "UNSUPPORTED_TYPE") {
      return res.status(400).json({ error: "Unsupported image type." });
    }
    return res.status(500).json({ error: "Upload failed." });
  }
});

app.post("/api/avatar", upload.single("file"), async (req, res) => {
  const username = await requireUser(req, res);
  if (!username) {
    return;
  }

  if (!req.file) {
    return res.status(400).json({ error: "File required." });
  }

  try {
    const result = await uploadImageToR2(req.file, "avatars");
    await usersCollection.updateOne(
      { username },
      { $set: { avatarUrl: result.url, avatarUpdatedAt: new Date() } }
    );
    return res.json({ avatarUrl: result.url });
  } catch (error) {
    if (error && error.code === "UNSUPPORTED_TYPE") {
      return res.status(400).json({ error: "Unsupported image type." });
    }
    return res.status(500).json({ error: "Avatar upload failed." });
  }
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
  socket.data.activeRoom = GLOBAL_ROOM_ID;
  socket.join(GLOBAL_ROOM_ID);

  messagesCollection
    .find({})
    .sort({ ts: -1 })
    .limit(200)
    .toArray()
    .then((docs) => {
      socket.emit("history", { messages: docs.reverse() });
    })
    .catch(() => {
      socket.emit("history", { messages: [] });
    });

  socket.on("message", async (payload) => {
    if (!payload) {
      return;
    }

    const text = typeof payload.text === "string" ? payload.text : "";
    const trimmed = text.trim().slice(0, 500);
    const imageUrl = typeof payload.imageUrl === "string" ? payload.imageUrl : null;
    const imageType = typeof payload.imageType === "string" ? payload.imageType : null;

    if (!trimmed && !imageUrl) {
      return;
    }

    const msg = {
      id: uuidv4(),
      user: socket.data.username,
      text: trimmed,
      imageUrl,
      imageType,
      ts: Date.now()
    };

    try {
      await messagesCollection.insertOne(msg);
      io.to(GLOBAL_ROOM_ID).emit("message", msg);
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
