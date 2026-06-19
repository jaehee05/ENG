const admin = require("firebase-admin");
admin.initializeApp();

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { sendOne } = require("./ppurio");

setGlobalOptions({ region: "asia-northeast3", retry: false, maxInstances: 10 });

const VOCAB_PASS_THRESHOLD = 25;

function normalizeSchedule(raw) {
  const r = raw || {};
  return {
    enabled: !!r.enabled,
    cadence: r.cadence === "daily" ? "daily" : "weekly",
    dayOfWeek: Number.isInteger(r.dayOfWeek) ? r.dayOfWeek : 0,
    hour: Number.isInteger(r.hour) ? Math.min(23, Math.max(0, r.hour)) : 9,
    minute: Number.isInteger(r.minute) ? Math.min(59, Math.max(0, r.minute)) : 0,
    templateCode: String(r.templateCode || ""),
    messageType: String(r.messageType || "ALH"),
    notice: String(r.notice || ""),
    onlyIncomplete: !!r.onlyIncomplete,
    lastSentKey: String(r.lastSentKey || ""),
  };
}

function normalizeWeeklySchedule(raw) {
  const r = raw || {};
  return {
    enabled: !!r.enabled,
    dayOfWeek: Number.isInteger(r.dayOfWeek) ? r.dayOfWeek : 1,
    hour: Number.isInteger(r.hour) ? Math.min(23, Math.max(0, r.hour)) : 9,
    minute: Number.isInteger(r.minute) ? Math.min(59, Math.max(0, r.minute)) : 0,
    templateCode: String(r.templateCode || ""),
    messageType: String(r.messageType || "ALH"),
    closing: String(
      r.closing ||
        "이번 주에도 목표를 달성할 수 있도록 가정에서도 많은 칭찬과 격려 부탁드립니다!",
    ),
    lastSentKey: String(r.lastSentKey || ""),
  };
}

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

    if (action === "getSchedule") {
      const snap = await admin.firestore().doc("settings/notifySchedules").get();
      const d = snap.exists ? snap.data() : {};
      return res.json({
        assignmentStatus: normalizeSchedule(d.assignmentStatus),
        weeklyReport: normalizeWeeklySchedule(d.weeklyReport),
      });
    }

    if (action === "saveSchedule") {
      const p = payload || {};
      const update = { updatedAt: Date.now() };
      if (p.assignmentStatus) {
        update.assignmentStatus = normalizeSchedule(p.assignmentStatus);
      }
      if (p.weeklyReport) {
        update.weeklyReport = normalizeWeeklySchedule(p.weeklyReport);
      }
      await admin.firestore().doc("settings/notifySchedules").set(
        update,
        { merge: true },
      );
      return res.json({ ok: true });
    }

    if (action === "diagAuth") {
      const out = { ok: true };
      try {
        const app = admin.app();
        out.projectId = app.options.projectId || null;
        const cred = app.options.credential;
        out.hasCred = !!cred;
        if (cred && typeof cred.getAccessToken === "function") {
          try {
            const at = await cred.getAccessToken();
            out.hasToken = !!(at && at.access_token);
            out.tokenStart = at && at.access_token
              ? String(at.access_token).slice(0, 18) + "…"
              : null;
            out.expiresIn = at && at.expires_in ? at.expires_in : null;
          } catch (e) {
            out.tokenError = String(e && e.message || e).slice(0, 300);
          }
        }
        try {
          await admin.messaging().send(
            {
              token: "DIAGNOSTIC_INVALID_TOKEN_xxxxxxxxxxxxxxxxxxxxxxxxxx",
              notification: { title: "x", body: "x" },
            },
            true,
          );
          out.dryRun = "OK (예상치 못한 성공)";
        } catch (e) {
          out.dryRunCode = (e && e.code) || null;
          out.dryRunMessage = String((e && e.message) || "").slice(0, 400);
        }
      } catch (e) {
        out.ok = false;
        out.error = String((e && e.message) || e).slice(0, 300);
      }
      return res.json(out);
    }

    if (action === "purgeNotifications") {
      const db = admin.firestore();
      const snap = await db.collection("notifications").get();
      let deleted = 0;
      // 500개씩 batch 삭제
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 500) {
        const batch = db.batch();
        const slice = docs.slice(i, i + 500);
        for (const d of slice) batch.delete(d.ref);
        await batch.commit();
        deleted += slice.length;
      }
      return res.json({ ok: true, deleted });
    }

    if (action === "sendPush") {
      const p = payload || {};
      const title = String(p.title || "").trim();
      const body = String(p.body || "").trim();
      if (!title && !body) {
        return res.status(400).json({ error: "title 또는 body 필요" });
      }
      const db = admin.firestore();
      let targetIds = Array.isArray(p.uids) ? p.uids : [];
      if (p.all === true) {
        const snap = await db
          .collection("users")
          .where("role", "==", "student")
          .where("status", "==", "active")
          .get();
        targetIds = snap.docs.map((d) => d.id);
      }
      if (targetIds.length === 0) {
        return res.status(400).json({ error: "수신 대상이 없습니다." });
      }
      const tokens = [];
      const ownerByToken = new Map();
      for (const uid of targetIds) {
        const u = await db.collection("users").doc(uid).get();
        const arr = u.exists ? (u.data().fcmTokens || []) : [];
        for (const t of arr) {
          if (typeof t === "string" && t) {
            tokens.push(t);
            ownerByToken.set(t, uid);
          }
        }
      }
      if (tokens.length === 0) {
        return res.json({ ok: true, sent: 0, failed: 0, invalid: 0, results: [] });
      }
      // 푸시 발송 전에 각 학생 알림함에도 기록 (앱 안 켜도 알림함에 남음)
      for (const uid of targetIds) {
        await db.collection("notifications").add({
          recipientUid: uid,
          title,
          body,
          kind: "push",
          readAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      const message = {
        notification: { title, body },
        data: p.data && typeof p.data === "object" ? p.data : {},
        tokens,
      };
      const result = await admin.messaging().sendEachForMulticast(message);
      // 만료/invalid 토큰 정리
      let invalid = 0;
      for (let i = 0; i < result.responses.length; i++) {
        const r = result.responses[i];
        if (r.success) continue;
        const code = r.error && r.error.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          const t = tokens[i];
          const uid = ownerByToken.get(t);
          if (uid) {
            await db.collection("users").doc(uid).update({
              fcmTokens: admin.firestore.FieldValue.arrayRemove(t),
            }).catch(() => {});
            invalid++;
          }
        }
      }
      const errors = [];
      for (const r of result.responses) {
        if (!r.success && r.error) {
          errors.push({
            code: r.error.code || "unknown",
            message: String(r.error.message || ""),
          });
        }
      }
      return res.json({
        ok: true,
        sent: result.successCount,
        failed: result.failureCount,
        invalid,
        errors: errors.slice(0, 5),
      });
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

// ===== 자동 발송 스케줄러 =====
// KST 5분마다 점검. settings/notifySchedules.assignmentStatus가 enabled이고
// 현재 시각/요일이 매치하면 전체 학생에게 발송. 중복 방지를 위해 lastSentKey 비교.

function nowKstParts() {
  // toLocaleString trick은 부정확하므로 직접 KST(UTC+9) 계산
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    y: kst.getUTCFullYear(),
    m: kst.getUTCMonth() + 1,
    d: kst.getUTCDate(),
    dow: kst.getUTCDay(), // 0=Sun
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

function isAssignmentDoneSrv(asn, attempts) {
  if (asn.manualDone) return true;
  const matched = attempts.filter(
    (a) => a.type === asn.type && a.refId === asn.refId && !a.practice,
  );
  if (matched.length === 0) return false;
  if (asn.minCorrect && asn.minCorrect > 0) {
    return matched.some((a) => (a.correct || 0) >= asn.minCorrect);
  }
  return true;
}

function buildWeeklyReportVarsSrv(assignments, attempts) {
  const vocabAsn = assignments.filter((a) => a.type === "vocab");
  const readingAsn = assignments.filter((a) => a.type === "reading");
  const vocabDone = vocabAsn.filter((a) => isAssignmentDoneSrv(a, attempts)).length;
  const readingDone = readingAsn.filter((a) => isAssignmentDoneSrv(a, attempts)).length;
  const vocabPct = vocabAsn.length > 0 ? Math.round((vocabDone / vocabAsn.length) * 100) : 0;
  const readingPct = readingAsn.length > 0 ? Math.round((readingDone / readingAsn.length) * 100) : 0;

  const vocabAttempts = attempts.filter((a) => a.type === "vocab" && !a.practice);
  const totalWords = vocabAttempts.reduce((s, a) => s + (a.total || 0), 0);
  const totalCorrectV = vocabAttempts.reduce((s, a) => s + (a.correct || 0), 0);
  const passCount = vocabAttempts.filter((a) => (a.correct || 0) >= VOCAB_PASS_THRESHOLD).length;
  const sessionCount = vocabAttempts.length;

  const readingAttempts = attempts.filter((a) => a.type === "reading" && !a.practice);
  const totalR = readingAttempts.reduce((s, a) => s + (a.total || 0), 0);
  const totalCorrectR = readingAttempts.reduce((s, a) => s + (a.correct || 0), 0);
  const ratio = totalR > 0 ? Math.round((totalCorrectR / totalR) * 100) : 0;

  return {
    var1: [
      "📊 지난주 과제 성취도",
      `▫️ 단어 암기: ${vocabPct}% 완료`,
      `▫️ 문제 풀이: ${readingPct}% 완료`,
    ].join("\n"),
    var2: [
      "🔤 단어 시험",
      `▫️ 학습 ${vocabAsn.length}회분 · 단어 ${totalWords}개`,
      `▫️ 통과 ${passCount}/${sessionCount}회 (암기 ${totalCorrectV}개)`,
    ].join("\n"),
    var3: [
      "📝 문제 풀이",
      `▫️ 지문 ${readingDone}개 완료`,
      `▫️ 📈 정답률 ${ratio}% (${totalCorrectR}/${totalR}문항)`,
    ].join("\n"),
  };
}

async function runWeeklyReportBlast(schedule) {
  const db = admin.firestore();
  const studentsSnap = await db
    .collection("users")
    .where("role", "==", "student")
    .where("status", "==", "active")
    .get();
  const students = studentsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => (s.phone || "").trim() || (s.parentPhone || "").trim());

  const results = [];
  for (const s of students) {
    const [asnSnap, attSnap] = await Promise.all([
      db.collection("assignments").where("studentUid", "==", s.id).get(),
      db.collection("attempts").where("studentUid", "==", s.id).get(),
    ]);
    const assignments = asnSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
    const attempts = attSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
    const vars = buildWeeklyReportVarsSrv(assignments, attempts);
    const changeWord = {
      var1: vars.var1,
      var2: vars.var2,
      var3: vars.var3,
      var4: schedule.closing,
    };

    const recipients = [];
    if ((s.phone || "").trim()) {
      recipients.push({ phone: s.phone, label: `${s.displayName}(학생)` });
    }
    if ((s.parentPhone || "").trim()) {
      recipients.push({ phone: s.parentPhone, label: `${s.displayName}(학부모)` });
    }

    for (const r of recipients) {
      try {
        await sendOne({
          phone: r.phone,
          name: s.displayName,
          changeWord,
          templateCode: schedule.templateCode,
          messageType: schedule.messageType,
        });
        results.push({ label: r.label, ok: true });
      } catch (e) {
        console.error(`[weeklyReport] ${r.label} 실패:`, e);
        results.push({ label: r.label, ok: false, error: String(e.message || e) });
      }
    }
  }
  return {
    sent: results.filter((x) => x.ok).length,
    failed: results.filter((x) => !x.ok).length,
    results,
  };
}

const ASN_VAR_BYTE_LIMIT = 100;
function fitListToBytes(items, emptyText) {
  if (items.length === 0) return emptyText;
  const enc = new TextEncoder();
  const full = items.join("\n");
  if (enc.encode(full).length <= ASN_VAR_BYTE_LIMIT) return full;
  for (let n = items.length - 1; n >= 1; n--) {
    const head = items.slice(0, n - 1);
    const last = `${items[n - 1]} 외 ${items.length - n}개`;
    const text = [...head, last].join("\n");
    if (enc.encode(text).length <= ASN_VAR_BYTE_LIMIT) return text;
  }
  return `(총 ${items.length}개)`;
}

async function runAssignmentStatusBlast(schedule) {
  const db = admin.firestore();
  const studentsSnap = await db
    .collection("users")
    .where("role", "==", "student")
    .where("status", "==", "active")
    .get();
  const students = studentsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => (s.phone || "").trim());

  const recipients = [];
  for (const s of students) {
    const [asnSnap, attSnap] = await Promise.all([
      db.collection("assignments").where("studentUid", "==", s.id).get(),
      db.collection("attempts").where("studentUid", "==", s.id).get(),
    ]);
    const assignments = asnSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
    const attempts = attSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
    const done = assignments
      .filter((a) => isAssignmentDoneSrv(a, attempts))
      .map((a) => `▶ ${a.refTitle}`);
    const incomplete = assignments
      .filter((a) => !isAssignmentDoneSrv(a, attempts))
      .map((a) => `▶ ${a.refTitle}`);

    if (schedule.onlyIncomplete && incomplete.length === 0) continue;

    recipients.push({
      label: s.displayName,
      phone: s.phone,
      name: s.displayName,
      changeWord: {
        var1: fitListToBytes(done, "(완료한 과제가 없습니다)"),
        var2: fitListToBytes(incomplete, "(미완료 과제가 없습니다)"),
        var3: schedule.notice || "",
      },
    });
  }

  const results = [];
  for (const r of recipients) {
    try {
      await sendOne({
        phone: r.phone,
        name: r.name,
        changeWord: r.changeWord,
        templateCode: schedule.templateCode,
        messageType: schedule.messageType,
      });
      results.push({ label: r.label, ok: true });
    } catch (e) {
      console.error(`[scheduledNotify] ${r.label} 실패:`, e);
      results.push({ label: r.label, ok: false, error: String(e.message || e) });
    }
  }
  return { sent: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length, results };
}

function timeMatch(t, sched) {
  if (t.hour !== sched.hour) return false;
  if (Math.abs(t.minute - sched.minute) > 4) return false;
  return true;
}

function buildSentKey(t, sched) {
  return `${t.y}${String(t.m).padStart(2, "0")}${String(t.d).padStart(2, "0")}-${String(sched.hour).padStart(2, "0")}${String(sched.minute).padStart(2, "0")}`;
}

exports.scheduledNotify = onSchedule(
  { schedule: "every 5 minutes", timeZone: "Asia/Seoul" },
  async () => {
    const db = admin.firestore();
    const snap = await db.doc("settings/notifySchedules").get();
    if (!snap.exists) return;
    const d = snap.data() || {};
    const t = nowKstParts();
    const update = { updatedAt: Date.now() };
    let touched = false;

    // 1) 과제 현황 알림톡
    {
      const sched = normalizeSchedule(d.assignmentStatus);
      if (sched.enabled && sched.templateCode) {
        const dowOk = sched.cadence === "daily" || t.dow === sched.dayOfWeek;
        if (dowOk && timeMatch(t, sched)) {
          const key = buildSentKey(t, sched);
          if (sched.lastSentKey !== key) {
            console.log("[scheduledNotify] 과제현황 발송 시작", key);
            const result = await runAssignmentStatusBlast(sched);
            console.log("[scheduledNotify] 과제현황 발송 완료", key, result);
            update.assignmentStatus = { ...sched, lastSentKey: key };
            update.lastRunAssignmentStatus = { key, ...result, at: Date.now() };
            touched = true;
          }
        }
      }
    }

    // 3) 정기 푸시 알림 (pushSchedules 컬렉션)
    try {
      const pushSnap = await db.collection("pushSchedules").get();
      for (const sd of pushSnap.docs) {
        const data = sd.data() || {};
        if (!data.enabled || !data.title) continue;
        const hour = Number.isInteger(data.hour) ? data.hour : -1;
        const minute = Number.isInteger(data.minute) ? data.minute : -1;
        if (hour !== t.hour) continue;
        if (Math.abs(minute - t.minute) > 4) continue;
        if (data.cadence === "weekly") {
          const dow = Number.isInteger(data.dayOfWeek) ? data.dayOfWeek : -1;
          if (t.dow !== dow) continue;
        }
        const key = `${t.y}${String(t.m).padStart(2, "0")}${String(t.d).padStart(2, "0")}-${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`;
        if (data.lastSentKey === key) continue;
        console.log(`[scheduledNotify] 정기 푸시 발송: ${sd.id} ${key}`);
        // 활성 학생 전체에게 푸시 + notifications 컬렉션 기록
        const usersSnap = await db
          .collection("users")
          .where("role", "==", "student")
          .where("status", "==", "active")
          .get();
        const tokens = [];
        const targetIds = [];
        for (const u of usersSnap.docs) {
          targetIds.push(u.id);
          const arr = (u.data().fcmTokens || []);
          for (const tt of arr) {
            if (typeof tt === "string" && tt) tokens.push(tt);
          }
        }
        // 알림함 기록
        for (const uid of targetIds) {
          await db.collection("notifications").add({
            recipientUid: uid,
            title: data.title,
            body: data.body || "",
            kind: "push",
            readAt: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        // FCM
        if (tokens.length > 0) {
          try {
            await admin.messaging().sendEachForMulticast({
              notification: { title: data.title, body: data.body || "" },
              tokens,
            });
          } catch (e) {
            console.error("[scheduledNotify] FCM 발송 실패:", e);
          }
        }
        await sd.ref.update({ lastSentKey: key });
      }
    } catch (e) {
      console.error("[scheduledNotify] 정기 푸시 처리 실패:", e);
    }

    // 2) 주간 리포트
    {
      const sched = normalizeWeeklySchedule(d.weeklyReport);
      if (sched.enabled && sched.templateCode) {
        if (t.dow === sched.dayOfWeek && timeMatch(t, sched)) {
          const key = buildSentKey(t, sched);
          if (sched.lastSentKey !== key) {
            console.log("[scheduledNotify] 주간리포트 발송 시작", key);
            const result = await runWeeklyReportBlast(sched);
            console.log("[scheduledNotify] 주간리포트 발송 완료", key, result);
            update.weeklyReport = { ...sched, lastSentKey: key };
            update.lastRunWeeklyReport = { key, ...result, at: Date.now() };
            touched = true;
          }
        }
      }
    }

    if (touched) {
      await db.doc("settings/notifySchedules").set(update, { merge: true });
    }
  },
);
