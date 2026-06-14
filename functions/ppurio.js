const admin = require("firebase-admin");

const TIMEOUT_MS = 10000;
const PROXY_URL = process.env.PPURIO_PROXY_URL;
const PROXY_SECRET = process.env.PPURIO_PROXY_SECRET;

let memToken = { token: null, expiresAt: 0 };

async function getSettings() {
  const snap = await admin.firestore().doc("settings/ppurio").get();
  if (!snap.exists) throw new Error("settings/ppurio 문서가 없습니다. 관리자 페이지에서 먼저 설정하세요.");
  const d = snap.data();
  if (!d.apiKey || !d.ppurioAccount || !d.senderProfile) {
    throw new Error("뿌리오 계정/API키/발신프로필이 누락되었습니다.");
  }
  return d;
}

async function ppurioFetch(path, headers, body) {
  if (!PROXY_URL || !PROXY_SECRET) {
    throw new Error("PPURIO_PROXY_URL / PPURIO_PROXY_SECRET 환경변수가 설정되지 않았습니다. functions/.env 확인.");
  }
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Proxy-Secret": PROXY_SECRET },
    body: JSON.stringify({ path, method: "POST", headers: headers || {}, body: body || {} }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: res.ok, status: res.status, body: parsed };
}

async function getToken(settings) {
  const now = Date.now();
  if (memToken.token && memToken.expiresAt > now + 60_000) return memToken.token;

  const persistedSnap = await admin.firestore().doc("settings/ppurio_token").get();
  const persisted = persistedSnap.exists ? persistedSnap.data() : null;
  if (persisted?.token && persisted.expiresAt > now + 60_000) {
    memToken = persisted;
    return persisted.token;
  }

  const basic = Buffer.from(`${settings.ppurioAccount}:${settings.apiKey}`).toString("base64");
  const { ok, status, body } = await ppurioFetch("/v1/token", { Authorization: `Basic ${basic}` }, {});
  if (!ok || !body.token) throw new Error(`토큰 발급 실패 (${status}): ${JSON.stringify(body)}`);

  const expiresAt = now + 23 * 60 * 60 * 1000;
  memToken = { token: body.token, expiresAt };
  await admin.firestore().doc("settings/ppurio_token").set(memToken);
  return body.token;
}

function randomRefKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 32);
}

async function sendOne({ phone, name, changeWord, templateCode, messageType }) {
  const settings = await getSettings();
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (cleanPhone.length < 9) throw new Error("phone 형식이 올바르지 않습니다.");

  const token = await getToken(settings);
  const merged = { footer: settings.footer || "", ...changeWord };

  const params = {
    account: settings.ppurioAccount,
    messageType: messageType || "AT",
    senderProfile: settings.senderProfile,
    templateCode,
    duplicateFlag: "Y",
    isResend: "N",
    targetCount: 1,
    targets: [{ to: cleanPhone, name: name || "", changeWord: merged }],
    refKey: randomRefKey("hw"),
  };

  const { ok, status, body } = await ppurioFetch("/v1/kakao", { Authorization: `Bearer ${token}` }, params);
  if (!ok) throw new Error(`발송 실패 (${status}): ${JSON.stringify(body)}`);
  return body;
}

module.exports = { sendOne, getSettings };
