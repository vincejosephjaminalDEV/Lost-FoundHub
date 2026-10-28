import express from "express";
import cors from "cors";
import multer from "multer";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, "foundit.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('user'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK(type IN ('Lost', 'Found')),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    color TEXT NOT NULL,
    location TEXT NOT NULL,
    item_date TEXT NOT NULL,
    description TEXT NOT NULL,
    photo_path TEXT,
    status TEXT NOT NULL DEFAULT 'Active'
      CHECK(status IN ('Active', 'Claim Pending', 'Approved', 'Rejected', 'Returned', 'Closed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    claimant_id INTEGER NOT NULL REFERENCES users(id),
    finder_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'Pending'
      CHECK(status IN ('Pending', 'More Proof Requested', 'Approved', 'Rejected', 'Returned')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(report_id, claimant_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    text TEXT NOT NULL DEFAULT '',
    image_path TEXT,
    message_type TEXT NOT NULL DEFAULT 'message'
      CHECK(message_type IN ('message', 'evidence', 'system')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const insertUser = db.prepare("INSERT OR IGNORE INTO users (name, role) VALUES (?, 'user')");
insertUser.run("Alex Finder");
insertUser.run("Jamie Claimant");
insertUser.run("Taylor Student");

const userId = (name) => db.prepare("SELECT id FROM users WHERE name = ?").get(name)?.id;
const alexId = userId("Alex Finder");
const jamieId = userId("Jamie Claimant");
const taylorId = userId("Taylor Student");

const reportCount = db.prepare("SELECT COUNT(*) AS count FROM reports").get().count;
if (reportCount === 0) {
  const insertReport = db.prepare(`
    INSERT INTO reports
    (user_id, type, name, category, color, location, item_date, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active')
  `);
  insertReport.run(alexId, "Found", "Black Smartphone", "Electronics", "Black", "University Canteen", "2026-10-27", "Black smartphone in a plain dark case. Claimants should describe distinguishing details.");
  insertReport.run(taylorId, "Lost", "Brown Leather Wallet", "Personal Items", "Brown", "Main Building", "2026-10-26", "Brown leather wallet, lost around the main building.");
  insertReport.run(jamieId, "Found", "Set of Keys", "Accessories", "Silver", "Library, 2nd Floor", "2026-10-27", "Small set of silver keys found near the study area.");
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    cb(null, true);
  }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadDir));

function reportRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    ownerName: row.owner_name,
    type: row.type,
    name: row.name,
    category: row.category,
    color: row.color,
    location: row.location,
    date: row.item_date,
    description: row.description,
    photo: row.photo_path,
    status: row.status,
    createdAt: row.created_at
  };
}

const reportSelect = `
  SELECT r.*, u.name AS owner_name
  FROM reports r JOIN users u ON u.id = r.user_id
`;

app.get("/api/users", (_req, res) => {
  const users = db.prepare("SELECT id, name, role FROM users ORDER BY id").all();
  res.json(users);
});

app.get("/api/reports", (_req, res) => {
  const rows = db.prepare(`${reportSelect} ORDER BY r.id DESC`).all();
  res.json(rows.map(reportRow));
});

app.post("/api/reports", upload.single("photo"), (req, res) => {
  const { userId: rawUserId, type, name, category, color, location, date, description } = req.body;
  const uid = Number(rawUserId);
  if (!db.prepare("SELECT id FROM users WHERE id = ?").get(uid)) {
    return res.status(400).json({ error: "Choose a valid demo user." });
  }
  if (!["Lost", "Found"].includes(type)) return res.status(400).json({ error: "Report type is invalid." });
  if (![name, category, color, location, date, description].every(v => typeof v === "string" && v.trim())) {
    return res.status(400).json({ error: "Please complete all report fields." });
  }
  if (date > new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: "The item date cannot be in the future." });
  }
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db.prepare(`
    INSERT INTO reports (user_id, type, name, category, color, location, item_date, description, photo_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uid, type, name.trim(), category, color.trim(), location.trim(), date, description.trim(), photoPath);
  const row = db.prepare(`${reportSelect} WHERE r.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(reportRow(row));
});

app.delete("/api/reports/:id", (req, res) => {
  const uid = Number(req.query.userId);
  const id = Number(req.params.id);
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  if (!report) return res.status(404).json({ error: "Report not found." });
  if (report.user_id !== uid) return res.status(403).json({ error: "You can only delete your own report." });
  db.prepare("DELETE FROM reports WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.get("/api/conversations", (req, res) => {
  const uid = Number(req.query.userId);
  const rows = db.prepare(`
    SELECT c.*, r.name AS report_name, r.type AS report_type,
      claimant.name AS claimant_name, finder.name AS finder_name,
      (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_message,
      (SELECT image_path FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_image
    FROM conversations c
    JOIN reports r ON r.id = c.report_id
    JOIN users claimant ON claimant.id = c.claimant_id
    JOIN users finder ON finder.id = c.finder_id
    WHERE c.claimant_id = ? OR c.finder_id = ?
    ORDER BY c.id DESC
  `).all(uid, uid);
  res.json(rows.map(row => ({
    id: row.id, reportId: row.report_id, reportName: row.report_name,
    reportType: row.report_type, claimantId: row.claimant_id, finderId: row.finder_id,
    claimantName: row.claimant_name, finderName: row.finder_name,
    status: row.status, lastMessage: row.last_message || (row.last_image ? "Image attachment" : ""),
    lastImage: row.last_image, createdAt: row.created_at
  })));
});

app.post("/api/conversations", (req, res) => {
  const { reportId: rawReportId, claimantId: rawClaimantId } = req.body;
  const reportId = Number(rawReportId);
  const claimantId = Number(rawClaimantId);
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(reportId);
  if (!report) return res.status(404).json({ error: "Report not found." });
  if (report.type !== "Found") return res.status(400).json({ error: "You can start a claim conversation on a Found report." });
  if (report.user_id === claimantId) return res.status(400).json({ error: "You cannot claim your own found report." });
  const existing = db.prepare("SELECT id FROM conversations WHERE report_id = ? AND claimant_id = ?").get(reportId, claimantId);
  if (existing) return res.json({ id: existing.id, existing: true });
  const result = db.prepare("INSERT INTO conversations (report_id, claimant_id, finder_id) VALUES (?, ?, ?)").run(reportId, claimantId, report.user_id);
  const conversationId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO messages (conversation_id, sender_id, text, message_type) VALUES (?, ?, ?, 'system')").run(conversationId, claimantId, "Conversation started. Describe the item and provide evidence without revealing sensitive information.");
  res.status(201).json({ id: conversationId });
});

app.get("/api/conversations/:id/messages", (req, res) => {
  const conversationId = Number(req.params.id);
  const uid = Number(req.query.userId);
  const conversation = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (![conversation.claimant_id, conversation.finder_id].includes(uid)) {
    return res.status(403).json({ error: "This conversation is private." });
  }
  const messages = db.prepare(`
    SELECT m.*, u.name AS sender_name
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ? ORDER BY m.id
  `).all(conversationId);
  res.json(messages.map(m => ({
    id: m.id, conversationId: m.conversation_id, senderId: m.sender_id,
    senderName: m.sender_name, text: m.text, image: m.image_path,
    type: m.message_type, createdAt: m.created_at
  })));
});

app.post("/api/conversations/:id/messages", upload.single("image"), (req, res) => {
  const conversationId = Number(req.params.id);
  const senderId = Number(req.body.senderId);
  const text = (req.body.text || "").trim();
  const conversation = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (![conversation.claimant_id, conversation.finder_id].includes(senderId)) {
    return res.status(403).json({ error: "You are not part of this conversation." });
  }
  if (!text && !req.file) return res.status(400).json({ error: "Write a message or attach an image." });
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db.prepare(`
    INSERT INTO messages (conversation_id, sender_id, text, image_path, message_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(conversationId, senderId, text, imagePath, req.file ? "evidence" : "message");
  const message = db.prepare(`
    SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({
    id: message.id, conversationId: message.conversation_id, senderId: message.sender_id,
    senderName: message.sender_name, text: message.text, image: message.image_path,
    type: message.message_type, createdAt: message.created_at
  });
});

app.post("/api/conversations/:id/decision", (req, res) => {
  const conversationId = Number(req.params.id);
  const { userId: rawUserId, decision } = req.body;
  const uid = Number(rawUserId);
  const conversation = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (conversation.finder_id !== uid) return res.status(403).json({ error: "Only the finder can decide this claim." });
  if (!["Approved", "More Proof Requested", "Rejected"].includes(decision)) {
    return res.status(400).json({ error: "Invalid decision." });
  }
  db.prepare("UPDATE conversations SET status = ? WHERE id = ?").run(decision, conversationId);
  db.prepare("UPDATE reports SET status = ? WHERE id = ?").run(
    decision === "Approved" ? "Approved" : decision === "Rejected" ? "Rejected" : "Claim Pending",
    conversation.report_id
  );
  const senderId = uid;
  const note = decision === "Approved"
    ? "The finder approved the claim. Please coordinate a safe handover."
    : decision === "Rejected"
      ? "The finder rejected the claim."
      : "The finder requested more proof. Please send additional details or an image.";
  db.prepare("INSERT INTO messages (conversation_id, sender_id, text, message_type) VALUES (?, ?, ?, 'system')").run(conversationId, senderId, note);
  res.json({ ok: true, status: decision });
});

app.post("/api/conversations/:id/returned", (req, res) => {
  const conversationId = Number(req.params.id);
  const uid = Number(req.body.userId);
  const conversation = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (![conversation.claimant_id, conversation.finder_id].includes(uid)) return res.status(403).json({ error: "Not a participant." });
  if (conversation.status !== "Approved" && conversation.status !== "Returned") {
    return res.status(400).json({ error: "The finder must approve the claim before return confirmation." });
  }
  db.prepare("UPDATE conversations SET status = 'Returned' WHERE id = ?").run(conversationId);
  db.prepare("UPDATE reports SET status = 'Returned' WHERE id = ?").run(conversation.report_id);
  db.prepare("INSERT INTO messages (conversation_id, sender_id, text, message_type) VALUES (?, ?, ?, 'system')").run(conversationId, uid, "Item return confirmed in this demo.");
  res.json({ ok: true, status: "Returned" });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Something went wrong." });
});

const PORT = 3001;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`FoundIt API running at http://127.0.0.1:${PORT}`);
});
