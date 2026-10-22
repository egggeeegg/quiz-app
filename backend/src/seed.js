import "dotenv/config";
import { initDB, all, get, exec } from "./db.js";
import { contentHash } from "./utils/questionText.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Let the API process create the first admin instead of this one-shot script. */
process.env.SKIP_ADMIN_BOOTSTRAP = "1";

async function main() {
  await initDB();

  const count = all("SELECT COUNT(*) as c FROM questions")[0].c;
  if (count > 0) {
    console.log(`Database already has ${count} questions, skipping seed.`);
    return;
  }

  /* SEED_FILE > private bank > bundled demo bank */
  const candidates = [
    process.env.SEED_FILE,
    path.join(process.cwd(), "questions.json"),
    path.join(process.cwd(), "questions.demo.json"),
    path.join(__dirname, "..", "questions.json"),
    path.join(__dirname, "..", "questions.demo.json"),
    path.join(__dirname, "..", "..", "questions.json"),
    path.join(__dirname, "..", "..", "questions.demo.json"),
  ].filter(Boolean);

  let qPath = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) { qPath = p; break; }
  }

  if (!qPath) {
    console.error("No question bank found. Provide questions.json or questions.demo.json.");
    console.error("Searched: " + candidates.join(", "));
    process.exit(1);
  }

  const raw = fs.readFileSync(qPath, "utf-8");
  const questions = JSON.parse(raw);
  console.log(`Loaded ${questions.length} questions from ${qPath}`);

  const bank = get("SELECT id FROM question_banks WHERE is_default = 1")
    || get("SELECT id FROM question_banks ORDER BY id LIMIT 1");
  if (!bank) throw new Error("No question bank available; run migrations first.");

  const stmt = `INSERT INTO questions
    (type, question, options, answer, source_file, bank_id, external_id, status, content_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)`;
  const srcMap = { 单选: "单选.docx", 多选: "多选.docx", 判断: "判断.docx" };

  questions.forEach((q, index) => {
    const question = q.question || "";
    const externalId = q.external_id || (q.id != null ? `seed-${q.id}` : `seed-${index + 1}`);
    exec(stmt, [
      q.type, question, JSON.stringify(q.options || {}), q.answer || "",
      srcMap[q.type] || "未知", bank.id, String(externalId), contentHash(question),
    ]);
  });

  console.log(`Seeded ${questions.length} questions successfully.`);
}

main().catch(err => { console.error(err); process.exit(1); });