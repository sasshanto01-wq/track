import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let db: Database.Database;
try {
  console.log("Initializing database...");
  db = new Database("devices.db");
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
  console.log("Database initialized successfully.");
} catch (err) {
  console.error("Failed to initialize database:", err);
  // Fallback to in-memory database if file fails
  console.log("Falling back to in-memory database.");
  db = new Database(":memory:");
}

async function startServer() {
  console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`);
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  try {
    // Ensure columns exist (Migration)
    console.log("Running database migrations...");
    const tableInfo = db.prepare("PRAGMA table_info(devices)").all() as any[];
    const columns = tableInfo.map(c => c.name);

    if (!columns.includes('model')) {
      db.exec("ALTER TABLE devices ADD COLUMN model TEXT");
      console.log("Added 'model' column to devices table.");
    }
    if (!columns.includes('color')) {
      db.exec("ALTER TABLE devices ADD COLUMN color TEXT");
      console.log("Added 'color' column to devices table.");
    }
    if (!columns.includes('storage')) {
      db.exec("ALTER TABLE devices ADD COLUMN storage TEXT");
      console.log("Added 'storage' column to devices table.");
    }
  } catch (err) {
    console.error("Database migration failed:", err);
  }
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

  app.get("/api/devices-with-locations", (req, res) => {
    try {
      const devices = db.prepare("SELECT * FROM devices ORDER BY created_at DESC").all() as any[];
      const devicesWithLocations = devices.map(device => {
        const location = db.prepare("SELECT * FROM locations WHERE imei = ? ORDER BY timestamp DESC LIMIT 1").get(device.imei);
        return { ...device, location };
      });
      res.json(devicesWithLocations);
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
