import crypto from "crypto";

/* Normalised text is used for duplicate detection only; the original string is
   always what gets stored and displayed. NFKC folds full-width letters. */
export function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[，。！？；：、“”‘’（）【】《》〈〉…—·,.!?;:'"()\[\]<>]/g, "")
    .toLowerCase();
}

export function contentHash(value) {
  return crypto.createHash("sha256").update(normalizeText(value)).digest("hex");
}

export const QUESTION_TYPES = ["单选", "多选", "判断"];
export const OPTION_LETTERS = ["A", "B", "C", "D"];
