const admin = require("firebase-admin");
admin.initializeApp();

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { sendOne } = require("./ppurio");

setGlobalOptions({ region: "asia-northeast3", retry: false, maxInstances: 10 });

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Admin-Secret");
}

function verifySecret(req) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const fromHeader = req.headers["x-admin-secret"];
  const fromBody = req.body && req.body.adminSecret;
  return fromHeader === expected || fromBody === expected;
}

exports.ppurioAdmin = onRequest({ invoker: "public" }, async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    if (!process.env.ADMIN_SECRET) {
      return res.status(500).json({ error: "서버에 ADMIN_SECRET 환경변수가 설정되지 않았습니다." });
    }
    if (!verifySecret(req)) {
      return res.status(401).json({ error: "관리자 인증 실패" });
    }

    const { action, payload } = req.body || {};

    if (action === "get") {
      const snap = await admin.firestore().doc("settings/ppurio").get();
      const d = snap.exists ? snap.data() : {};
      return res.json({
        ppurioAccount: d.ppurioAccount || "",
        senderProfile: d.senderProfile || "",
        apiKeyMasked: d.apiKey ? "••••" + String(d.apiKey).slice(-4) : "",
        hasApiKey: !!d.apiKey,
        footer: d.footer || "",
      });
    }

    if (action === "save") {
      const p = payload || {};
      const existingSnap = await admin.firestore().doc("settings/ppurio").get();
      const existing = existingSnap.exists ? existingSnap.data() : {};
      const update = {
        ppurioAccount: String(p.ppurioAccount || ""),
        senderProfile: String(p.senderProfile || ""),
        apiKey: p.apiKey ? String(p.apiKey) : (existing.apiKey || ""),
        footer: String(p.footer || ""),
        updatedAt: Date.now(),
      };
      await admin.firestore().doc("settings/ppurio").set(update);
      if (p.apiKey || p.ppurioAccount) {
        await admin.firestore().doc("settings/ppurio_token").delete().catch(() => {});
      }
      return res.json({ ok: true });
    }

    if (action === "sendBatch") {
      const p = payload || {};
      const templateCode = String(p.templateCode || "").trim();
      const messageType = String(p.messageType || "AT").trim();
      const recipients = Array.isArray(p.recipients) ? p.recipients : [];
      if (!templateCode) return res.status(400).json({ error: "templateCode 필요" });
      if (recipients.length === 0) return res.status(400).json({ error: "recipients 비어있음" });

      const results = [];
      for (const r of recipients) {
        const label = r.label || r.phone;
        try {
          const result = await sendOne({
            phone: r.phone,
            name: r.name || "",
            changeWord: r.changeWord || {},
            templateCode,
            messageType,
          });
          results.push({ label, phone: r.phone, ok: true, result });
        } catch (err) {
          console.error(`[sendBatch] ${label} 실패:`, err);
          results.push({ label, phone: r.phone, ok: false, error: String(err.message || err) });
        }
      }
      const sent = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      return res.json({ ok: true, sent, failed, results });
    }

    return res.status(400).json({ error: `unknown action: ${action}` });
  } catch (err) {
    console.error("ppurioAdmin 오류:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});
