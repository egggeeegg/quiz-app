import "dotenv/config";
import { initDB, all, exec } from "./db.js";
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

  const stmt = "INSERT INTO questions (type, question, options, answer, source_file) VALUES (?, ?, ?, ?, ?)";
  const srcMap = { 单选: "单选.docx", 多选: "多选.docx", 判断: "判断.docx" };

  for (const q of questions) {
    exec(stmt, [q.type, q.question || "", JSON.stringify(q.options || {}), q.answer || "", srcMap[q.type] || "未知"]);
  }

  console.log(`Seeded ${questions.length} questions successfully.`);
}

main().catch(err => { console.error(err); process.exit(1); });