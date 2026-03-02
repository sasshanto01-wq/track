import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("devices.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    imei TEXT PRIMARY KEY,
    name TEXT,
    model TEXT,
    color TEXT,
    storage TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imei TEXT,
    latitude REAL,
    longitude REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(imei) REFERENCES devices(imei)
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API Routes
  app.post("/api/register", (req, res) => {
    const { imei, name, model, color, storage } = req.body;
    if (!imei || !name) return res.status(400).json({ error: "IMEI and Name required" });

    try {
      const stmt = db.prepare("INSERT OR REPLACE INTO devices (imei, name, model, color, storage) VALUES (?, ?, ?, ?, ?)");
      stmt.run(imei, name, model || null, color || null, storage || null);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/update-location", (req, res) => {
    const { imei, latitude, longitude } = req.body;
    if (!imei || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "Missing data" });
    }

    try {
      const stmt = db.prepare("INSERT INTO locations (imei, latitude, longitude) VALUES (?, ?, ?)");
      stmt.run(imei, latitude, longitude);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/devices", (req, res) => {
    try {
      const devices = db.prepare("SELECT * FROM devices ORDER BY created_at DESC").all();
      res.json(devices);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/devices/:imei", (req, res) => {
    const { imei } = req.params;
    try {
      db.prepare("DELETE FROM locations WHERE imei = ?").run(imei);
      db.prepare("DELETE FROM devices WHERE imei = ?").run(imei);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/history/:imei", (req, res) => {
    const { imei } = req.params;
    try {
      const history = db.prepare("SELECT * FROM locations WHERE imei = ? ORDER BY timestamp DESC LIMIT 50").all();
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/find/:imei", (req, res) => {
    const { imei } = req.params;
    try {
      const device = db.prepare("SELECT * FROM devices WHERE imei = ?").get(imei);
      if (!device) return res.status(404).json({ error: "Device not found" });

      const location = db.prepare("SELECT * FROM locations WHERE imei = ? ORDER BY timestamp DESC LIMIT 1").get(imei);
      res.json({ device, location });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
