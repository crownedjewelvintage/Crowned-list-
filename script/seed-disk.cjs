// Run before `npm start` on Render.
// If DB_PATH points at a persistent disk and that disk doesn't yet have a database file,
// copy the bundled data.db (and uploads/) from the repo into the persistent disk.
// This runs as `node script/seed-disk.cjs` before `node dist/index.cjs`.
const fs = require("fs");
const path = require("path");

const dbPath = process.env.DB_PATH;
const uploadDir = process.env.UPLOAD_DIR;
const bundledDb = path.resolve(__dirname, "..", "data.db");
const bundledUploads = path.resolve(__dirname, "..", "uploads");

function log(msg) {
  console.log(`[seed-disk] ${msg}`);
}

if (!dbPath || !uploadDir) {
  log("DB_PATH or UPLOAD_DIR not set — skipping (running from project dir).");
  process.exit(0);
}

// Seed DB
try {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(bundledDb)) {
      fs.copyFileSync(bundledDb, dbPath);
      log(`Seeded database from bundled data.db -> ${dbPath}`);
    } else {
      log(`No bundled data.db; database will be created empty at ${dbPath}`);
    }
  } else {
    log(`Database already exists at ${dbPath}; preserving.`);
  }
} catch (err) {
  log(`Database seeding failed: ${err.message}`);
}

// Seed uploads
try {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const existing = fs.readdirSync(uploadDir);
  if (existing.length === 0 && fs.existsSync(bundledUploads)) {
    for (const f of fs.readdirSync(bundledUploads)) {
      fs.copyFileSync(path.join(bundledUploads, f), path.join(uploadDir, f));
    }
    log(`Seeded ${fs.readdirSync(uploadDir).length} files from bundled uploads/ -> ${uploadDir}`);
  } else {
    log(`Uploads dir has ${existing.length} files; preserving.`);
  }
} catch (err) {
  log(`Upload seeding failed: ${err.message}`);
}
