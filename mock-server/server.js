// ============================================================================
// Collatio mock server
// Stands in for the real Collatio API during development. Two endpoints:
//   POST /collatio/validate-and-reconcile   -> three-way-match result (JSON)
//   POST /collatio/upload-and-download       -> multipart file upload ack
//
// Run:   npm install && npm start
// Config (env):
//   PORT             listen port            (default 8000, matches the curl)
//   MOCK_LATENCY_MS  simulated delay in ms  (default 600)
// The responses are canned JSON under ./responses so they're easy to edit.
// ============================================================================
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Keep uploaded files in memory — we only ack them, never persist.
const upload = multer({ storage: multer.memoryStorage() });

const PORT = parseInt(process.env.PORT || "8000", 10);
const LATENCY = parseInt(process.env.MOCK_LATENCY_MS || "600", 10);

const reconcileResponse = require(path.join(
  __dirname,
  "responses",
  "validate-and-reconcile.json"
));

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 3-way match
app.post("/collatio/validate-and-reconcile", async (req, res) => {
  await delay(LATENCY);
  console.log(`[${new Date().toISOString()}] validate-and-reconcile`, req.body || {});
  res.json(reconcileResponse);
});

// ---------------------------------------------------------------- file upload
// upload.any() accepts the `file` form-field plus the clientName / appName /
// documentType text fields exactly like the provided curl.
app.post("/collatio/upload-and-download", upload.any(), async (req, res) => {
  await delay(LATENCY);
  const files = req.files || [];
  const documentId = crypto.randomBytes(12).toString("hex"); // 24-char hex id
  console.log(
    `[${new Date().toISOString()}] upload-and-download`,
    { fields: req.body, files: files.map((f) => ({ name: f.originalname, bytes: f.size })) }
  );
  res.json({
    upload_response: {
      Status: "success",
      Message: `${files.length || 1} file(s) queued for processing.`,
      Data: [documentId],
    },
    documentId,
    download_response: {},
  });
});

// ---------------------------------------------------------------- health check
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`Collatio mock server listening on http://0.0.0.0:${PORT}`);
  console.log(`  POST /collatio/validate-and-reconcile`);
  console.log(`  POST /collatio/upload-and-download`);
  console.log(`  GET  /health   (latency=${LATENCY}ms)`);
});
