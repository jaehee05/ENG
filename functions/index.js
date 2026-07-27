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

async function verifySecret(req) {
  const fromHeader = req.headers["x-admin-secret"];
  const fromBody = req.body && req.body.adminSecret;
  const provided = fromHeader || fromBody;
  if (!provided) return false;
  const envSecret = process.env.ADMIN_SECRET;
  if (envSecret && provided === envSecret) return true;
  const snap = await admin.firestore().doc("settings/notifyConfig").get();
  const dbSecret = snap.exists ? snap.data().adminSecret : null;
  return !!dbSecret && provided === dbSecret;
}

function normalizeManualDefaults(raw) {
  const r = raw || {};
  return {
    templateCode: String(r.templateCode || ""),
    messageType: String(r.messageType || "ALH"),
    notice: String(r.notice || ""),
  };
}

exports.ppurioAdmin = onRequest({ invoker: "public" }, async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { action, payload } = req.body || {};

    // bootstrap: uid+password 로 인증해서 adminSecret + manualDefaults 반환.
    // 클라이언트가 첫 로그인 직후 호출. localStorage 의존 없이 DB 에서 받아온다.
    if (action === "bootstrap") {
      const p = payload || {};
      const uid = String(p.uid || "");
      const password = String(p.password || "");
      if (!uid || !password) {
        return res.status(400).json({ error: "uid/password 필요" });
      }
      const userSnap = await admin.firestore().doc(`users/${uid}`).get();
      const user = userSnap.exists ? userSnap.data() : null;
      if (!user || user.password !== password || user.role !== "admin") {
        return res.status(401).json({ error: "관리자 인증 실패" });
      }
      const cfgSnap = await admin.firestore().doc("settings/notifyConfig").get();
      const cfg = cfgSnap.exists ? cfgSnap.data() : {};
      const ppurioSnap = await admin.firestore().doc("settings/ppurio").get();
      const ppurio = ppurioSnap.exists ? ppurioSnap.data() : {};
      return res.json({
        adminSecret: cfg.adminSecret || process.env.ADMIN_SECRET || "",
        manualDefaults: normalizeManualDefaults(ppurio.manualDefaults),
      });
    }

    if (!(await verifySecret(req))) {
      return res.status(401).json({ error: "관리자 인증 실패" });
    }

    if (action === "get") {
      const snap = await admin.firestore().doc("settings/ppurio").get();
      const d = snap.exists ? snap.data() : {};
      return res.json({
        ppurioAccount: d.ppurioAccount || "",
        senderProfile: d.senderProfile || "",
        apiKeyMasked: d.apiKey ? "••••" + String(d.apiKey).slice(-4) : "",
        hasApiKey: !!d.apiKey,
        footer: d.footer || "",
        manualDefaults: normalizeManualDefaults(d.manualDefaults),
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
      if (p.manualDefaults !== undefined) {
        update.manualDefaults = normalizeManualDefaults(p.manualDefaults);
      } else if (existing.manualDefaults) {
        update.manualDefaults = normalizeManualDefaults(existing.manualDefaults);
      }
      await admin.firestore().doc("settings/ppurio").set(update);
      if (p.apiKey || p.ppurioAccount) {
        await admin.firestore().doc("settings/ppurio_token").delete().catch(() => {});
      }
      return res.json({ ok: true });
    }

    // manualDefaults만 단독 저장 (입력 시마다 가벼운 동기화).
    if (action === "saveManualDefaults") {
      const p = payload || {};
      await admin.firestore().doc("settings/ppurio").set(
        {
          manualDefaults: normalizeManualDefaults(p),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      return res.json({ ok: true });
    }

    // settings/notifyConfig.adminSecret 를 갱신/설치. 호출 시점에는 env var
    // 혹은 기존 DB 값으로 인증되어야 함. 한 번 저장되면 그 이후엔 DB 값으로 인증 가능.
    if (action === "setAdminSecret") {
      const p = payload || {};
      const next = String(p.adminSecret || "");
      if (!next) return res.status(400).json({ error: "adminSecret 필요" });
      await admin.firestore().doc("settings/notifyConfig").set(
        { adminSecret: next, updatedAt: Date.now() },
        { merge: true },
      );
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
      const linkFromData =
        p.data && typeof p.data.link === "string" ? p.data.link : null;
      // 푸시 발송 전에 각 학생 알림함에도 기록 (앱 안 켜도 알림함에 남음)
      for (const uid of targetIds) {
        const notif = {
          recipientUid: uid,
          title,
          body,
          kind: "push",
          readAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (linkFromData) notif.link = linkFromData;
        await db.collection("notifications").add(notif);
      }

      const dataPayload =
        p.data && typeof p.data === "object" ? { ...p.data } : {};
      // FCM data 값은 문자열이어야 함
      for (const k of Object.keys(dataPayload)) {
        if (typeof dataPayload[k] !== "string") {
          dataPayload[k] = String(dataPayload[k]);
        }
      }
      const message = {
        notification: { title, body },
        data: dataPayload,
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

    if (action === "sendWeeklyReportNow") {
      const p = payload || {};
      const studentUid = String(p.studentUid || "").trim();
      if (!studentUid) return res.status(400).json({ error: "studentUid 필요" });

      const db = admin.firestore();
      const schedSnap = await db.doc("settings/notifySchedules").get();
      const sched = normalizeWeeklySchedule(
        schedSnap.exists ? schedSnap.data().weeklyReport : null,
      );
      if (!sched.templateCode) {
        return res.status(400).json({
          error: "주간 리포트 템플릿 코드가 알림톡/푸시 설정에 없어요.",
        });
      }

      const sDoc = await db.collection("users").doc(studentUid).get();
      if (!sDoc.exists) return res.status(404).json({ error: "학생을 찾을 수 없습니다." });
      const s = sDoc.data() || {};

      const [asnSnap, attSnap] = await Promise.all([
        db.collection("assignments").where("studentUid", "==", studentUid).get(),
        db.collection("attempts").where("studentUid", "==", studentUid).get(),
      ]);
      const assignments = asnSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
      const attempts = attSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
      const windowStart = Date.now() - WEEK_MS;
      const vars = buildWeeklyReportVarsSrv(assignments, attempts, windowStart);
      const changeWord = {
        var1: vars.var1,
        var2: vars.var2,
        var3: vars.var3,
        var4: sched.closing,
      };

      const recipients = [];
      if ((s.phone || "").trim()) {
        recipients.push({ phone: s.phone, label: `${s.displayName}(학생)` });
      }
      if ((s.parentPhone || "").trim()) {
        recipients.push({ phone: s.parentPhone, label: `${s.displayName}(학부모)` });
      }
      if (recipients.length === 0) {
        return res.status(400).json({ error: "학생/학부모 연락처가 없어요." });
      }

      const results = [];
      for (const r of recipients) {
        try {
          await sendOne({
            phone: r.phone,
            name: s.displayName,
            changeWord,
            templateCode: sched.templateCode,
            messageType: sched.messageType,
          });
          results.push({ label: r.label, phone: r.phone, ok: true });
        } catch (e) {
          console.error(`[sendWeeklyReportNow] ${r.label} 실패:`, e);
          results.push({
            label: r.label,
            phone: r.phone,
            ok: false,
            error: String(e.message || e),
          });
        }
      }
      return res.json({
        ok: true,
        sent: results.filter((x) => x.ok).length,
        failed: results.filter((x) => !x.ok).length,
        results,
      });
    }

    if (action === "sendAssignmentStatusNow") {
      const p = payload || {};
      const studentUid = String(p.studentUid || "").trim();
      if (!studentUid) return res.status(400).json({ error: "studentUid 필요" });

      const db = admin.firestore();
      const schedSnap = await db.doc("settings/notifySchedules").get();
      const sched = normalizeSchedule(
        schedSnap.exists ? schedSnap.data().assignmentStatus : null,
      );
      if (!sched.templateCode) {
        return res.status(400).json({
          error: "과제 현황 템플릿 코드가 알림톡/푸시 설정에 없어요.",
        });
      }

      const sDoc = await db.collection("users").doc(studentUid).get();
      if (!sDoc.exists) return res.status(404).json({ error: "학생을 찾을 수 없습니다." });
      const s = sDoc.data() || {};
      if (!(s.phone || "").trim()) {
        return res.status(400).json({ error: "학생 연락처가 없어요." });
      }

      const [asnSnap, attSnap] = await Promise.all([
        db.collection("assignments").where("studentUid", "==", studentUid).get(),
        db.collection("attempts").where("studentUid", "==", studentUid).get(),
      ]);
      const assignments = asnSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
      const attempts = attSnap.docs.map((x) => ({ id: x.id, ...x.data() }));
      const done = assignments
        .filter((a) => isAssignmentDoneSrv(a, attempts))
        .map((a) => `▶ ${a.refTitle}`);
      const incomplete = assignments
        .filter((a) => !isAssignmentDoneSrv(a, attempts))
        .map((a) => `▶ ${a.refTitle}`);
      const notice = typeof p.notice === "string" && p.notice.trim()
        ? p.notice.trim()
        : (sched.notice || "");

      try {
        await sendOne({
          phone: s.phone,
          name: s.displayName,
          changeWord: {
            var1: fitListToBytes(done, "(완료한 과제가 없습니다)"),
            var2: fitListToBytes(incomplete, "(미완료 과제가 없습니다)"),
            var3: notice,
          },
          templateCode: sched.templateCode,
          messageType: sched.messageType,
        });
        return res.json({
          ok: true,
          sent: 1,
          failed: 0,
          results: [{ label: s.displayName, phone: s.phone, ok: true }],
        });
      } catch (e) {
        console.error(`[sendAssignmentStatusNow] ${s.displayName} 실패:`, e);
        return res.json({
          ok: true,
          sent: 0,
          failed: 1,
          results: [{
            label: s.displayName,
            phone: s.phone,
            ok: false,
            error: String(e.message || e),
          }],
        });
      }
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

function isReadingAttemptCompleteSrv(a) {
  const total = a.total || 0;
  const correct = a.correct || 0;
  if (total > 0 && correct === total) return true;
  return !!a.wrongReviewedAt;
}

// 한 지문 응시에서 '실제로 푼 문항'만 집계 (안 푼 문항은 분모 제외).
function answeredStatsSrv(a) {
  const rr = a.readingResults;
  if (Array.isArray(rr) && rr.length > 0) {
    let answered = 0;
    let correct = 0;
    for (const r of rr) {
      const ua = typeof r.userAnswer === "number" ? r.userAnswer : -1;
      if (ua >= 0) {
        answered++;
        if (r.correct) correct++;
      }
    }
    return { answered, correct };
  }
  return { answered: a.total || 0, correct: a.correct || 0 };
}

function isAssignmentDoneSrv(asn, attempts) {
  // 관리자 수동 오버라이드 우선 (manualStatus), 없으면 legacy manualDone.
  if (asn.manualStatus === "done") return true;
  if (asn.manualStatus === "undone") return false;
  if (asn.manualDone) return true;
  const matched = attempts.filter(
    (a) => a.type === asn.type && a.refId === asn.refId && !a.practice,
  );
  if (matched.length === 0) return false;
  if (asn.type === "reading") {
    // 지문 문제풀이는 만점이거나 오답을 모두 검토해야 완료.
    return matched.some((a) => isReadingAttemptCompleteSrv(a));
  }
  if (asn.minCorrect && asn.minCorrect > 0) {
    return matched.some((a) => (a.correct || 0) >= asn.minCorrect);
  }
  return true;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// 지문 문제풀이를 학생에게서 내렸다(영어는 모의고사로 출제하고, 지문은 모의고사
// 오답 리뷰에서 보여주는 방식). 학생이 열 수도 풀 수도 없는 과제를 완료율 분모에
// 넣으면 학부모 주간 리포트에 영구 0%로 나가므로 집계에서 뺀다.
// 앱쪽 규칙(src/lib/types.ts isAssignmentVisibleToStudent)과 맞춘 값이므로,
// 지문을 다시 열 때 양쪽을 함께 되돌릴 것.
const READING_ASSIGNMENTS_VISIBLE = false;

function tsToMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts._seconds === "number") return ts._seconds * 1000;
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  return null;
}

/**
 * 지난 7일(롤링) 통계로 var1~var3 생성.
 * - 과제는 dueAt(없으면 createdAt)이 [windowStart, now] 안에 들어오는 것만 집계
 * - attempts는 createdAt이 윈도우 안인 것만 집계
 */
function buildWeeklyReportVarsSrv(assignments, attempts, windowStartMs) {
  const start = Number.isFinite(windowStartMs)
    ? windowStartMs
    : Date.now() - WEEK_MS;

  function inWindow(ts) {
    const ms = tsToMillis(ts);
    return ms != null && ms >= start;
  }

  const recentAsn = assignments.filter((a) => inWindow(a.dueAt || a.createdAt));
  const vocabAsn = recentAsn.filter((a) => a.type === "vocab");
  const readingAsn = READING_ASSIGNMENTS_VISIBLE
    ? recentAsn.filter((a) => a.type === "reading")
    : [];
  const vocabDone = vocabAsn.filter((a) => isAssignmentDoneSrv(a, attempts)).length;
  const readingDone = readingAsn.filter((a) => isAssignmentDoneSrv(a, attempts)).length;
  const vocabPct = vocabAsn.length > 0 ? Math.round((vocabDone / vocabAsn.length) * 100) : null;
  const readingPct = readingAsn.length > 0 ? Math.round((readingDone / readingAsn.length) * 100) : null;

  const recentAttempts = attempts.filter((a) => inWindow(a.createdAt));
  const vocabAttempts = recentAttempts.filter((a) => a.type === "vocab" && !a.practice);
  const totalCorrectV = vocabAttempts.reduce((s, a) => s + (a.correct || 0), 0);

  // 문제풀이 정답률: 지난주 '푼' 지문 문항만 집계 (안 푼 문항은 분모에서 제외).
  // 지문별로 가장 최근 응시 1개만 사용해 재시도가 중복 집계되지 않게 한다.
  const readingByLatest = new Map();
  for (const a of recentAttempts) {
    if (a.type !== "reading" || a.practice) continue;
    const cur = tsToMillis(a.createdAt) || 0;
    const prev = readingByLatest.get(a.refId);
    if (!prev || cur >= (tsToMillis(prev.createdAt) || 0)) {
      readingByLatest.set(a.refId, a);
    }
  }
  const solvedReadingAttempts = [...readingByLatest.values()];
  const doneReadingCount = solvedReadingAttempts.length;
  let totalR = 0;
  let totalCorrectR = 0;
  for (const a of solvedReadingAttempts) {
    const { answered, correct } = answeredStatsSrv(a);
    totalR += answered;
    totalCorrectR += correct;
  }
  const ratio = totalR > 0 ? Math.round((totalCorrectR / totalR) * 100) : null;

  const vocabPctLine =
    vocabPct == null ? "▫️ 단어 암기: 지난주 과제 없음" : `▫️ 단어 암기: ${vocabPct}% 완료`;
  const readingPctLine =
    readingPct == null ? "▫️ 문제 풀이: 지난주 과제 없음" : `▫️ 문제 풀이: ${readingPct}% 완료`;
  // 통과는 '시험 개수' 기준: 부여된 단어 시험 중 통과(완료)한 시험 수.
  const vocabBody = vocabAsn.length === 0
    ? "▫️ 지난주 단어 시험 과제 없음"
    : `▫️ 통과 ${vocabDone}/${vocabAsn.length}개 시험\n▫️ 누적 암기 ${totalCorrectV}개`;
  const readingBody = solvedReadingAttempts.length === 0
    ? "▫️ 지난주 푼 지문 없음"
    : `▫️ 지문 ${doneReadingCount}개 풀이\n▫️ 📈 정답률 ${ratio}% (${totalCorrectR}/${totalR}문항)`;

  return {
    var1: ["📊 지난주 과제 성취도", vocabPctLine, readingPctLine].join("\n"),
    var2: ["🔤 단어 시험", vocabBody].join("\n"),
    var3: ["📝 문제 풀이", readingBody].join("\n"),
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
    const windowStart = Date.now() - WEEK_MS;
    const vars = buildWeeklyReportVarsSrv(assignments, attempts, windowStart);
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
        const schedLink =
          typeof data.link === "string" && data.link ? data.link : "/notifications";
        // 알림함 기록
        for (const uid of targetIds) {
          await db.collection("notifications").add({
            recipientUid: uid,
            title: data.title,
            body: data.body || "",
            kind: "push",
            link: schedLink,
            readAt: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        // FCM
        if (tokens.length > 0) {
          try {
            await admin.messaging().sendEachForMulticast({
              notification: { title: data.title, body: data.body || "" },
              data: { link: schedLink },
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
