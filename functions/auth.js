/**
 * 계정 API — users 컬렉션을 만지는 유일한 통로.
 *
 * 예전에는 클라이언트가 Firestore 의 users 를 직접 읽고 썼다. 그러려면 보안
 * 규칙을 열어둘 수밖에 없었고, Firebase 설정은 어차피 앱 번들에 들어 있으니
 * 사실상 누구나 학생 이름·전화·학부모 전화·비밀번호를 통째로 가져갈 수 있었다.
 *
 * 이제 users 는 규칙으로 닫고, 읽기·쓰기를 전부 여기로 옮긴다. Admin SDK 는
 * 규칙을 우회하므로 서버에서만 손댈 수 있다.
 *
 * 비밀번호는 bcrypt 해시로 저장한다. 관리자도 못 본다 — 원래도 화면에서 보는
 * 기능은 없었고 새 비밀번호를 넣어주기만 했으므로 잃는 것은 없다.
 */

const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const BCRYPT_ROUNDS = 10;
/** 세션 유효기간. 학생들이 자주 안 들어오는 편이라 넉넉히 둔다. */
const SESSION_DAYS = 180;

const db = () => admin.firestore();

/* ───────────────────────── 비밀번호 ───────────────────────── */

/** bcrypt 해시는 항상 $2a$/$2b$/$2y$ 로 시작한다. 평문과 구분하는 유일한 표식. */
function isHashed(value) {
  return typeof value === "string" && /^\$2[aby]\$/.test(value);
}

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * 저장된 값과 대조한다.
 *
 * 아직 평문인 계정이 남아 있을 수 있다(일괄 해시 전에 로그인하는 경우). 그때는
 * 평문으로 맞춰보고, 맞으면 그 자리에서 해시로 갈아끼운다 — 로그인할 때마다
 * 하나씩 정리되는 셈이다.
 */
async function verifyPassword(uid, stored, given) {
  if (!stored || !given) return false;
  if (isHashed(stored)) return bcrypt.compare(given, stored);
  if (stored !== given) return false;
  try {
    await db().doc(`users/${uid}`).update({ password: await hashPassword(given) });
  } catch {
    // 갈아끼우기 실패는 로그인을 막을 이유가 아니다. 다음 기회에 다시 한다.
  }
  return true;
}

function validatePassword(pw) {
  if (!pw || pw.length < 4) throw httpError(400, "비밀번호는 4자 이상이어야 합니다.");
  if (/^\d+$/.test(pw)) throw httpError(400, "유추하기 쉬운 암호는 사용할 수 없습니다.");
}

/* ───────────────────────── 세션 ───────────────────────── */

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createSession(uid) {
  const token = newToken();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  );
  await db().doc(`sessions/${token}`).set({
    uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });
  return token;
}

/** 토큰 → 계정. 없거나 만료면 던진다. */
async function requireAccount(token) {
  if (!token) throw httpError(401, "로그인이 필요합니다.");
  const snap = await db().doc(`sessions/${String(token)}`).get();
  if (!snap.exists) throw httpError(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
  const s = snap.data();
  if (s.expiresAt && s.expiresAt.toMillis() < Date.now()) {
    await snap.ref.delete().catch(() => {});
    throw httpError(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
  }
  const user = await db().doc(`users/${s.uid}`).get();
  if (!user.exists) {
    await snap.ref.delete().catch(() => {});
    throw httpError(401, "계정을 찾을 수 없습니다.");
  }
  return toAccount(user);
}

async function requireAdmin(token) {
  const acc = await requireAccount(token);
  if (acc.role !== "admin" || acc.status !== "active") {
    throw httpError(403, "관리자만 할 수 있습니다.");
  }
  return acc;
}

/* ───────────────────────── 직렬화 ───────────────────────── */

/**
 * 클라이언트로 내보낼 모양. **비밀번호는 절대 담지 않는다** — 해시라도 내보내면
 * 오프라인으로 때려맞출 거리를 주는 셈이다.
 */
function toAccount(snap) {
  const d = snap.data() || {};
  const rawSubjects = Array.isArray(d.subjects) ? d.subjects : undefined;
  const subjects = rawSubjects
    ? rawSubjects.filter((x) => x === "korean" || x === "english")
    : undefined;
  const out = {
    id: snap.id,
    email: d.email || "",
    displayName: d.displayName || "",
    role: d.role === "admin" ? "admin" : "student",
    status: d.status === "active" || d.status === "rejected" ? d.status : "pending",
    createdAt: d.createdAt ? d.createdAt.toMillis() : null,
  };
  if (d.school) out.school = d.school;
  if (d.phone) out.phone = d.phone;
  if (d.parentPhone) out.parentPhone = d.parentPhone;
  if (subjects) out.subjects = subjects;
  if (d.readingAccess === true) out.readingAccess = true;
  if (typeof d.colorKey === "string") out.colorKey = d.colorKey;
  if (d.preregistered === true) out.preregistered = true;
  if (Array.isArray(d.fcmTokens)) out.fcmTokens = d.fcmTokens;
  return out;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/* ───────────────────────── 조회 도우미 ───────────────────────── */

async function findByEmail(email) {
  const hits = await db().collection("users").where("email", "==", email).limit(2).get();
  return hits.docs;
}

/* ───────────────────────── 동작 ───────────────────────── */

const actions = {
  async signIn({ email, password }) {
    const e = String(email || "").trim().toLowerCase();
    const docs = await findByEmail(e);
    const fail = httpError(401, "이메일 또는 비밀번호가 일치하지 않습니다.");
    if (!docs.length) throw fail;
    const snap = docs[0];
    const ok = await verifyPassword(snap.id, snap.data().password, String(password || ""));
    if (!ok) throw fail;
    return { token: await createSession(snap.id), account: toAccount(snap) };
  },

  async signUp(payload) {
    const password = String(payload.password || "");
    validatePassword(password);
    const email = String(payload.email || "").trim().toLowerCase();
    const displayName = String(payload.displayName || "").trim();
    const school = String(payload.school || "");
    const phone = String(payload.phone || "");
    const parentPhone = String(payload.parentPhone || "");
    const hashed = await hashPassword(password);

    // 1) 같은 이메일 — 사전 등록이면 활성화, 아니면 중복.
    const byEmail = await findByEmail(email);
    if (byEmail.length) {
      const existing = byEmail[0];
      if (existing.data().preregistered !== true) {
        throw httpError(409, "이미 가입된 이메일입니다.");
      }
      return activate(existing, { hashed, email, displayName, school, phone, parentPhone });
    }

    // 2) 이메일이 새 값이어도 (이름 + 전화) 로 사전 등록을 찾아 연결한다.
    if (displayName && phone) {
      const prereg = await db()
        .collection("users")
        .where("preregistered", "==", true)
        .where("displayName", "==", displayName)
        .where("phone", "==", phone)
        .limit(1)
        .get();
      if (!prereg.empty) {
        return activate(prereg.docs[0], {
          hashed,
          email,
          displayName,
          school,
          phone,
          parentPhone,
        });
      }
    }

    // 3) 새 계정. 첫 사용자는 관리자.
    const any = await db().collection("users").limit(1).get();
    const isFirst = any.empty;
    const ref = await db().collection("users").add({
      email,
      password: hashed,
      displayName,
      role: isFirst ? "admin" : "student",
      status: isFirst ? "active" : "pending",
      school,
      phone,
      parentPhone,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const created = await ref.get();
    return { token: await createSession(ref.id), account: toAccount(created) };
  },

  async me({ token }) {
    return { account: await requireAccount(token) };
  },

  async signOut({ token }) {
    if (token) await db().doc(`sessions/${String(token)}`).delete().catch(() => {});
    return { ok: true };
  },

  async listAccounts({ token }) {
    await requireAdmin(token);
    const snap = await db().collection("users").orderBy("createdAt", "desc").get();
    return { accounts: snap.docs.map(toAccount) };
  },

  /** 본인 것이거나 관리자면 통과. 학생이 남의 계정을 만지는 것을 막는다. */
  async getAccount({ token, id }) {
    const me = await requireAccount(token);
    if (me.id !== id && me.role !== "admin") throw httpError(403, "권한이 없습니다.");
    const snap = await db().doc(`users/${String(id)}`).get();
    return { account: snap.exists ? toAccount(snap) : null };
  },

  async setStatus({ token, id, status }) {
    await requireAdmin(token);
    if (!["pending", "active", "rejected"].includes(status)) {
      throw httpError(400, "알 수 없는 상태입니다.");
    }
    await db().doc(`users/${String(id)}`).update({ status });
    return { ok: true };
  },

  async setReadingAccess({ token, id, allowed }) {
    await requireAdmin(token);
    await db().doc(`users/${String(id)}`).update({ readingAccess: !!allowed });
    return { ok: true };
  },

  async setColorKey({ token, id, colorKey }) {
    await requireAdmin(token);
    await db().doc(`users/${String(id)}`).update({ colorKey: String(colorKey || "") });
    return { ok: true };
  },

  async setSubjects({ token, id, subjects }) {
    await requireAdmin(token);
    const list = Array.isArray(subjects)
      ? subjects.filter((x) => x === "korean" || x === "english")
      : [];
    await db().doc(`users/${String(id)}`).update({ subjects: list });
    return { ok: true };
  },

  async setPassword({ token, id, password }) {
    await requireAdmin(token);
    const pw = String(password || "");
    validatePassword(pw);
    await db().doc(`users/${String(id)}`).update({ password: await hashPassword(pw) });
    // 비밀번호가 바뀌면 그 계정의 기존 세션은 모두 끊는다.
    await dropSessionsFor(String(id));
    return { ok: true };
  },

  async updateProfile({ token, id, patch }) {
    const me = await requireAccount(token);
    if (me.id !== id && me.role !== "admin") throw httpError(403, "권한이 없습니다.");
    const p = patch || {};
    const displayName = String(p.displayName || "").trim();
    if (!displayName) throw httpError(400, "이름을 입력하세요.");
    const email = String(p.email || "").trim().toLowerCase();
    if (!email) throw httpError(400, "이메일을 입력하세요.");
    // limit(2) — 자기 자신이 걸릴 수 있어 하나로는 남의 것인지 못 가린다.
    const hits = await findByEmail(email);
    if (hits.some((d) => d.id !== id)) throw httpError(409, "이미 사용 중인 이메일입니다.");

    await db().doc(`users/${String(id)}`).update({
      displayName,
      email,
      school: String(p.school || ""),
      phone: String(p.phone || ""),
      parentPhone: String(p.parentPhone || ""),
    });
    const after = await db().doc(`users/${String(id)}`).get();
    return { account: toAccount(after) };
  },

  async createPreregistered({ token, displayName, phone, school, parentPhone, subjects }) {
    await requireAdmin(token);
    const name = String(displayName || "").trim();
    if (!name) throw httpError(400, "이름을 입력하세요.");
    const ph = String(phone || "");
    if (!ph) throw httpError(400, "학생 전화번호를 입력하세요. (가입 시 매칭에 필요)");

    const dup = await db()
      .collection("users")
      .where("displayName", "==", name)
      .where("phone", "==", ph)
      .limit(1)
      .get();
    if (!dup.empty) throw httpError(409, "같은 이름·전화의 계정이 이미 존재합니다.");

    const payload = {
      email: "",
      displayName: name,
      phone: ph,
      role: "student",
      status: "pending",
      preregistered: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (school) payload.school = String(school);
    if (parentPhone) payload.parentPhone = String(parentPhone);
    const list = Array.isArray(subjects)
      ? subjects.filter((x) => x === "korean" || x === "english")
      : [];
    if (list.length) payload.subjects = list;

    const ref = await db().collection("users").add(payload);
    return { account: toAccount(await ref.get()) };
  },

  /**
   * 본인 탈퇴이거나 관리자면 지운다.
   *
   * 관리자 전용으로 두면 안 된다 — 더보기 화면의 회원탈퇴가 학생 본인 손으로
   * 도는 길이고, App Store 는 계정을 만들 수 있는 앱에 앱 안에서의 계정 삭제를
   * 요구한다(5.1.1(v)).
   */
  async deleteAccount({ token, id }) {
    const me = await requireAccount(token);
    const target = String(id);
    if (me.id !== target && me.role !== "admin") throw httpError(403, "권한이 없습니다.");
    const removed = await purgeStudentData(target);
    await db().doc(`users/${target}`).delete();
    await dropSessionsFor(target);
    return { ok: true, removed };
  },

  /** 푸시 토큰은 본인 것만. */
  async addFcmToken({ token, fcmToken }) {
    const me = await requireAccount(token);
    const t = String(fcmToken || "");
    if (!t) throw httpError(400, "토큰이 없습니다.");
    // 다른 계정에 붙어 있던 같은 기기 토큰은 떼어낸다. 안 그러면 기기를
    // 넘겨받은 사람에게 이전 사용자의 푸시가 계속 간다.
    const others = await db()
      .collection("users")
      .where("fcmTokens", "array-contains", t)
      .get();
    const batch = db().batch();
    others.docs
      .filter((d) => d.id !== me.id)
      .forEach((d) =>
        batch.update(d.ref, { fcmTokens: admin.firestore.FieldValue.arrayRemove(t) }),
      );
    batch.update(db().doc(`users/${me.id}`), {
      fcmTokens: admin.firestore.FieldValue.arrayUnion(t),
    });
    await batch.commit();
    return { ok: true };
  },

  async removeFcmToken({ token, fcmToken }) {
    const me = await requireAccount(token);
    const t = String(fcmToken || "");
    if (!t) return { ok: true };
    await db()
      .doc(`users/${me.id}`)
      .update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(t) });
    return { ok: true };
  },

  /**
   * 두 계정 이상이 들고 있는 푸시 토큰을 모두에게서 떼어낸다 (관리자 정비용).
   * 기기를 물려주고 나서 이전 사용자에게도 푸시가 가던 것을 정리한다.
   */
  async cleanupDuplicateTokens({ token }) {
    await requireAdmin(token);
    const snap = await db().collection("users").get();
    const owners = new Map();
    for (const d of snap.docs) {
      const arr = d.data().fcmTokens;
      if (!Array.isArray(arr)) continue;
      for (const t of arr) {
        if (typeof t !== "string" || !t) continue;
        owners.set(t, (owners.get(t) || []).concat(d.id));
      }
    }
    const dupes = [...owners.entries()].filter(([, uids]) => uids.length > 1);
    if (!dupes.length) return { tokens: 0, accounts: 0 };

    const removeByUid = new Map();
    for (const [t, uids] of dupes) {
      for (const uid of uids) removeByUid.set(uid, (removeByUid.get(uid) || []).concat(t));
    }
    const batch = db().batch();
    for (const [uid, tokens] of removeByUid) {
      batch.update(db().doc(`users/${uid}`), {
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens),
      });
    }
    await batch.commit();
    return { tokens: dupes.length, accounts: removeByUid.size };
  },

  /**
   * 관리자 알림톡 화면이 쓰는 비밀키를 세션으로 받아온다.
   *
   * 예전에는 uid + 평문 비밀번호로 받아왔다(ppurioAdmin 의 bootstrap). 이제
   * 비밀번호가 해시라 클라이언트가 평문을 들고 있을 수 없어서, 이미 로그인한
   * 세션을 근거로 내준다.
   */
  async adminBootstrap({ token }) {
    await requireAdmin(token);
    const cfg = await db().doc("settings/notifyConfig").get();
    const ppurio = await db().doc("settings/ppurio").get();
    const raw = (ppurio.exists ? ppurio.data().manualDefaults : null) || {};
    return {
      adminSecret: (cfg.exists ? cfg.data().adminSecret : "") || process.env.ADMIN_SECRET || "",
      manualDefaults: {
        templateCode: String(raw.templateCode || ""),
        messageType: String(raw.messageType || "ALH"),
        notice: String(raw.notice || ""),
      },
    };
  },

  /**
   * 아직 평문으로 남아 있는 비밀번호를 한꺼번에 해시로 바꾼다.
   * 관리자가 한 번 누르면 끝. 여러 번 눌러도 안전하다 — 이미 해시인 것은 건너뛴다.
   */
  async hashAllPasswords({ token }) {
    await requireAdmin(token);
    const snap = await db().collection("users").get();
    let hashed = 0;
    let already = 0;
    let empty = 0;
    for (const d of snap.docs) {
      const pw = d.data().password;
      if (!pw) {
        empty++;
        continue;
      }
      if (isHashed(pw)) {
        already++;
        continue;
      }
      await d.ref.update({ password: await hashPassword(String(pw)) });
      hashed++;
    }
    return { total: snap.size, hashed, already, empty };
  },
};

async function activate(snap, { hashed, email, displayName, school, phone, parentPhone }) {
  const patch = { password: hashed, status: "active", preregistered: false };
  // 학생이 적어낸 값이 있으면 관리자가 넣어둔 값을 덮는다 (본인이 정정 가능하도록).
  if (email) patch.email = email;
  if (displayName) patch.displayName = displayName;
  if (school) patch.school = school;
  if (phone) patch.phone = phone;
  if (parentPhone) patch.parentPhone = parentPhone;
  await snap.ref.update(patch);
  const after = await snap.ref.get();
  return { token: await createSession(snap.id), account: toAccount(after) };
}

/**
 * 탈퇴한 학생의 흔적을 지운다.
 *
 * 계정 문서만 지우면 응시 기록·과제·알림에 이름과 uid 가 그대로 남는다.
 * 개인정보처리방침에 "탈퇴 시 파기한다" 고 적으려면 실제로 지워야 한다.
 *
 * **결제·수납 기록(payments)은 남긴다.** 학원 운영상 거래 증빙이라 관련 법령에
 * 따라 보존해야 하는 쪽에 가깝다. 이건 판단이 필요한 지점이라 방침에도 그렇게
 * 적어야 하고, 같이 지우기로 정하면 아래 목록에 payments 를 더하면 된다.
 */
const OWNED_BY_STUDENT = [
  { collection: "attempts", field: "studentUid" },
  { collection: "assignments", field: "studentUid" },
  { collection: "classSessions", field: "studentUid" },
  { collection: "todos", field: "studentUid" },
  { collection: "notifications", field: "recipientUid" },
];

/** 시험지를 볼 수 있는 학생 목록에서 이름을 빼야 하는 곳. */
const AUDIENCE_LISTS = ["vocabSets", "vocabSeries"];

async function purgeStudentData(uid) {
  const removed = {};

  for (const { collection, field } of OWNED_BY_STUDENT) {
    const snap = await db().collection(collection).where(field, "==", uid).get();
    await deleteInChunks(snap.docs);
    if (snap.size) removed[collection] = snap.size;
  }

  // 단어장은 계정 문서 아래 서브컬렉션이다. 부모 문서를 지워도 같이 안 지워진다.
  const words = await db().collection(`users/${uid}/wordLookups`).get();
  await deleteInChunks(words.docs);
  if (words.size) removed.wordLookups = words.size;

  for (const collection of AUDIENCE_LISTS) {
    const snap = await db()
      .collection(collection)
      .where("studentUids", "array-contains", uid)
      .get();
    for (const d of snap.docs) {
      await d.ref.update({
        studentUids: admin.firestore.FieldValue.arrayRemove(uid),
      });
    }
    if (snap.size) removed[collection] = snap.size;
  }

  return removed;
}

/** 배치 하나에 500 개까지만 담긴다. */
async function deleteInChunks(docs) {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db().batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function dropSessionsFor(uid) {
  const snap = await db().collection("sessions").where("uid", "==", uid).get();
  const batch = db().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

module.exports = { actions, requireAccount, requireAdmin, verifyPassword, isHashed };
