import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, "..");
const TMP_DB = path.join(os.tmpdir(), `quiz-smoke-${process.pid}.db`);
const PORT = 3200 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = "ci-smoke-secret-0123456789abcdef";
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin-test-pass";
const NODE = process.execPath;

const env = {
  ...process.env,
  PORT: String(PORT),
  DATABASE_PATH: TMP_DB,
  JWT_SECRET,
  ADMIN_USERNAME: ADMIN_USER,
  ADMIN_PASSWORD: ADMIN_PASS,
  FRONTEND_URL: "*",
  /* Always test against the bundled demo bank, never a local private bank. */
  SEED_FILE: path.join(BACKEND, "..", "questions.demo.json"),
};

let pass = 0;
let fail = 0;

function check(name, condition, extra = "") {
  if (condition) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(NODE, args, { cwd: BACKEND, env, stdio: "pipe" });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(out))));
  });
}

async function request(method, url, { token, device, body, form } = {}) {
  const headers = {};
  if (!form) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (device) headers["X-Device-Id"] = device;
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: form || (body === undefined ? undefined : JSON.stringify(body)),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function csvText(rows) {
  return "\uFEFF" + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function uploadForm(csv, name, mode) {
  const fd = new FormData();
  fd.append("file", new Blob([csv], { type: "text/csv" }), name);
  if (mode) fd.append("mode", mode);
  return fd;
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + "/api/health");
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  fs.rmSync(TMP_DB, { force: true });

  console.log("[1/9] seed demo question bank");
  await run(["src/seed.js"]);

  console.log("[2/9] start API");
  const server = spawn(NODE, ["src/index.js"], { cwd: BACKEND, env, stdio: "pipe" });
  let serverLog = "";
  server.stdout.on("data", (d) => { serverLog += d; });
  server.stderr.on("data", (d) => { serverLog += d; });

  try {
    check("health endpoint", await waitForHealth());

    console.log("[3/9] auth");
    const admin = await request("POST", "/api/auth/login", {
      body: { username: ADMIN_USER, password: ADMIN_PASS },
      device: "DEV-ADMIN",
    });
    check("admin login", admin.status === 200 && !!admin.data?.token, JSON.stringify(admin.data));
    const adminToken = admin.data.token;
    check("login returns user id", admin.data.id === 1);

    const invite = await request("POST", "/api/invites/generate", {
      token: adminToken,
      device: "DEV-ADMIN",
      body: { count: 1, type: "single", max_uses: 1 },
    });
    check("generate invite", invite.status === 201 && invite.data.codes?.length === 1);
    const code = invite.data.codes[0];

    const reg = await request("POST", "/api/auth/register", {
      body: { username: "tester", password: "pass1234", invite_code: code },
      device: "DEV-USER",
    });
    check("register with invite", reg.status === 201 && !!reg.data?.token, JSON.stringify(reg.data));
    const userToken = reg.data.token;

    const reuse = await request("POST", "/api/auth/register", {
      body: { username: "tester2", password: "pass1234", invite_code: code },
      device: "DEV-USER2",
    });
    check("single-use invite rejected", reuse.status === 400);

    console.log("[4/9] answer isolation");
    const bankUser = await request("GET", "/api/questions", { token: userToken, device: "DEV-USER" });
    check("user bank has 90 questions", Array.isArray(bankUser.data) && bankUser.data.length === 90);
    check("user bank hides answers", bankUser.data.every((q) => !("answer" in q)));
    const bankAnon = await request("GET", "/api/questions", { device: "DEV-ANON" });
    check("anonymous bank hides answers", bankAnon.data.every((q) => !("answer" in q)));
    const bankAdmin = await request("GET", "/api/questions", { token: adminToken, device: "DEV-ADMIN" });
    check("admin bank keeps answers", "answer" in bankAdmin.data[0]);
    const answerMap = new Map(bankAdmin.data.map((q) => [q.id, q]));

    console.log("[5/9] paper generation");
    const paper = await request("POST", "/api/exams/generate", {
      token: userToken,
      device: "DEV-USER",
      body: { mode: "normal" },
    });
    const questions = paper.data.questions || [];
    check("normal paper has 90 questions", questions.length === 90, String(questions.length));
    check("paper carries sessionId", typeof paper.data.sessionId === "string");
    check("paper leaks no answer", questions.every((q) => !("answer" in q)));
    check("demo bank has no placeholders", questions.every((q) => !q._placeholder));

    const smart = await request("POST", "/api/exams/generate", {
      token: userToken,
      device: "DEV-USER",
      body: { mode: "smart" },
    });
    check("smart paper fills every slot", (smart.data.questions || []).every((q) => !q._placeholder));

    const reviewAnon = await request("POST", "/api/exams/generate", { body: { mode: "review" }, device: "DEV-ANON" });
    check("review mode requires auth", reviewAnon.status === 401);

    console.log("[6/9] grading");
    const answers = {};
    let expected = 0;
    questions.forEach((q, i) => {
      const right = answerMap.get(q.id)?.answer || "";
      if (i < 10) { answers[i] = right; expected += 1; }
      else if (i < 15) { answers[i] = right === "A" ? "B" : "A"; }
    });
    const submit = await request("POST", "/api/exams/submit", {
      token: userToken,
      device: "DEV-USER",
      body: { session_id: paper.data.sessionId, answers },
    });
    check("submit accepted", submit.status === 200, JSON.stringify(submit.data));
    check(`server score is ${expected}`, submit.data.totalScore === expected, String(submit.data.totalScore));
    check("answers returned only after grading", submit.data.correctAnswers?.length === 90);

    const replay = await request("POST", "/api/exams/submit", {
      token: userToken,
      device: "DEV-USER",
      body: { session_id: paper.data.sessionId, answers },
    });
    check("paper replay rejected", replay.status === 409, String(replay.status));

    const forged = await request("POST", "/api/exams/submit", {
      token: userToken,
      device: "DEV-USER",
      body: { answers: { 0: "A" } },
    });
    check("submit without session rejected", forged.status === 400);

    console.log("[7/9] mistakes");
    const mistakes = await request("GET", "/api/mistakes", { token: userToken, device: "DEV-USER" });
    check("5 wrong answers recorded", mistakes.data.length === 5, String(mistakes.data.length));
    const target = mistakes.data[0];

    const review = await request("POST", "/api/exams/generate", {
      token: userToken,
      device: "DEV-USER",
      body: { mode: "review" },
    });
    check("review paper built from mistakes", (review.data.questions || []).length === 5);
    const index = review.data.questions.findIndex((q) => q.id === target.question_id);
    const newWrong = target.correct_answer === "A" ? "B" : "A";
    const reviewSubmit = await request("POST", "/api/exams/submit", {
      token: userToken,
      device: "DEV-USER",
      body: { session_id: review.data.sessionId, answers: index >= 0 ? { [index]: newWrong } : {} },
    });
    check("review submit accepted", reviewSubmit.status === 200);
    const updated = (await request("GET", "/api/mistakes", { token: userToken, device: "DEV-USER" }))
      .data.find((m) => m.question_id === target.question_id);
    check("mistake answer refreshed", updated?.wrong_answer === newWrong);

    console.log("[8/9] history and device ban");
    const history = await request("GET", "/api/exams/history", { token: userToken, device: "DEV-USER" });
    check("history has 2 exams", history.data.length === 2);

    const ban = await request("POST", "/api/device-bans", {
      token: adminToken,
      device: "DEV-ADMIN",
      body: { device_id: "DEV-BANNED", reason: "smoke test" },
    });
    check("admin bans device", ban.status === 200);
    const banned = await request("POST", "/api/auth/login", {
      body: { username: "tester", password: "pass1234" },
      device: "DEV-BANNED",
    });
    check("banned device cannot login", banned.status === 403);

    console.log("[9/10] question bank import");
    const header = ["external_id", "type", "question", "option_a", "option_b", "option_c", "option_d", "answer", "analysis"];
    const importBank = await request("POST", "/api/admin/banks", {
      token: adminToken, device: "DEV-ADMIN", body: { name: "导入冒烟" },
    });
    check("create question bank", importBank.status === 201 && importBank.data.id > 0);
    const importBankId = importBank.data.id;

    const badRows = csvText([header,
      ["i1", "单选", "1+1=?", "1", "2", "3", "4", "B", ""],
      ["i2", "单选", "2+2=?", "1", "2", "3", "4", "E", ""]]);
    const dry = await request("POST", `/api/admin/banks/${importBankId}/validate`, {
      token: adminToken, device: "DEV-ADMIN", form: uploadForm(badRows, "bad.csv"),
    });
    check("dry run reports one error", dry.status === 200 && dry.data.errorCount === 1 && dry.data.validCount === 1);

    const goodRows = csvText([header,
      ["i1", "单选", "1+1=?", "1", "2", "3", "4", "B", ""],
      ["i2", "单选", "2+2=?", "1", "2", "3", "4", "D", ""]]);
    const imported = await request("POST", `/api/admin/banks/${importBankId}/import`, {
      token: adminToken, device: "DEV-ADMIN", form: uploadForm(goodRows, "good.csv", "append"),
    });
    check("append imports two questions", imported.status === 201 && imported.data.stats.created === 2);

    const importedCounts = await request("GET", `/api/questions/count?bank_id=${importBankId}`, { token: userToken, device: "DEV-USER" });
    check("imported bank has two questions", importedCounts.data["单选"] === 2);

    const rollbackImport = await request("POST", `/api/admin/imports/${imported.data.batchId}/rollback`, {
      token: adminToken, device: "DEV-ADMIN",
    });
    check("rollback before exams succeeds", rollbackImport.status === 200);
    const rolledCounts = await request("GET", `/api/questions/count?bank_id=${importBankId}`, { token: userToken, device: "DEV-USER" });
    check("rollback empties the bank", !rolledCounts.data["单选"]);

    const snapshotBank = (await request("POST", "/api/admin/banks", {
      token: adminToken, device: "DEV-ADMIN", body: { name: "快照冒烟" },
    })).data.id;
    await request("POST", `/api/admin/banks/${snapshotBank}/import`, {
      token: adminToken, device: "DEV-ADMIN",
      form: uploadForm(csvText([header, ["s1", "单选", "1+1=?", "1", "2", "3", "4", "B", ""]]), "snap.csv", "append"),
    });
    const snapshotPaper = await request("POST", "/api/exams/generate", {
      token: userToken, device: "DEV-USER", body: { mode: "normal", bank_ids: [snapshotBank] },
    });
    const snapshotIndex = (snapshotPaper.data.questions || []).findIndex(q => q.question === "1+1=?");
    check("bank-scoped paper contains question", snapshotIndex >= 0);
    const snapshotQuestion = (await request("GET", `/api/admin/questions?bank_id=${snapshotBank}`, {
      token: adminToken, device: "DEV-ADMIN",
    })).data.rows.find(q => q.external_id === "s1");
    await request("PATCH", `/api/admin/questions/${snapshotQuestion.id}`, {
      token: adminToken, device: "DEV-ADMIN", body: { answer: "C" },
    });
    const snapshotSubmit = await request("POST", "/api/exams/submit", {
      token: userToken, device: "DEV-USER",
      body: { session_id: snapshotPaper.data.sessionId, answers: snapshotIndex >= 0 ? { [snapshotIndex]: "B" } : {} },
    });
    check("grading uses paper snapshot, not the edited answer",
      snapshotSubmit.status === 200 && snapshotSubmit.data.details[snapshotIndex]?.correct === true);

    console.log("[10/10] authorization and cleanup");
    const usersAsUser = await request("GET", "/api/users", { token: userToken, device: "DEV-USER" });
    check("non-admin blocked from user list", usersAsUser.status === 403);

    const del = await request("DELETE", "/api/users/2", { token: adminToken, device: "DEV-ADMIN" });
    check("admin deletes user", del.status === 200);
    const stale = await request("GET", "/api/mistakes", { token: userToken, device: "DEV-USER" });
    check("deleted user's token rejected", stale.status === 401);
    check("deleted user removed from list",
      (await request("GET", "/api/users", { token: adminToken, device: "DEV-ADMIN" })).data.every((u) => u.id !== 2));
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
    if (fail > 0) console.error(serverLog.slice(-2000));
    fs.rmSync(TMP_DB, { force: true });
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  fs.rmSync(TMP_DB, { force: true });
  process.exit(1);
});
