import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { useExamStore } from "../stores/exam.js";

const SCORING = { 单选: 1, 多选: 2, 判断: 1 };

export function useDocxExport() {
  const { state } = useExamStore();

  async function exportDocx() {
    if (!state.submitted || !state.results) return;
    const ch = [];
    ch.push(new Paragraph({ text: "模拟考试答卷", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
    ch.push(new Paragraph({ children: [new TextRun({ text: `总分: ${state.results.totalScore} / 100`, bold: true, size: 28 })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
    ch.push(new Paragraph({ spacing: { after: 200 } }));
    ch.push(new Paragraph({ children: [new TextRun({ text: "一、答卷详情", bold: true, size: 24 })], spacing: { after: 200 } }));

    for (let i = 0; i < state.questions.length; i++) {
      const q = state.questions[i];
      const ua = state.answers[i] || "未作答";
      const d = state.results.details[i];
      const st = d.correct ? "✓" : "✗";
      ch.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. [${q.type}] `, bold: true, size: 22 }), new TextRun({ text: q.question, size: 22 })], spacing: { before: 200, after: 100 } }));
      if (q.type !== "判断" && q.options) {
        for (const [l, txt] of Object.entries(q.options)) {
          const mk = ua.includes(l) ? "●" : "○";
          const ict = (q.answer || "").includes(l);
          ch.push(new Paragraph({ children: [new TextRun({ text: `  ${mk} ${l}. ${txt}`, size: 20, color: ict ? "22c55e" : (ua.includes(l) && !ict ? "ef4444" : "666666"), bold: ict })], spacing: { before: 40, after: 40 } }));
        }
      }
      ch.push(new Paragraph({ children: [new TextRun({ text: " 你的答案: ", size: 20, color: "888888" }), new TextRun({ text: ua, size: 20, bold: true, color: d.correct ? "22c55e" : "ef4444" }), new TextRun({ text: " 标准答案: ", size: 20, color: "888888" }), new TextRun({ text: q.answer || "", size: 20, bold: true, color: "22c55e" }), new TextRun({ text: `  ${st} ${d.correct ? d.points + "分" : "0分"}`, size: 20, bold: true, color: d.correct ? "22c55e" : "ef4444" })], spacing: { before: 60, after: 100 } }));
    }

    const wi = state.results.details.filter(d => !d.correct && d.attempted);
    if (wi.length > 0) {
      ch.push(new Paragraph({ spacing: { before: 400 } }));
      ch.push(new Paragraph({ children: [new TextRun({ text: `二、错题集（共${wi.length}题）`, bold: true, size: 24 })], spacing: { after: 200 } }));
      for (const d of wi) {
        const q = state.questions[d.index];
        const ua = state.answers[d.index] || "未作答";
        ch.push(new Paragraph({ children: [new TextRun({ text: `${d.index + 1}. [${q.type}] `, bold: true, size: 22 }), new TextRun({ text: q.question, size: 22 })], spacing: { before: 200, after: 100 } }));
        ch.push(new Paragraph({ children: [new TextRun({ text: " 你的答案: ", size: 20, color: "888888" }), new TextRun({ text: ua, size: 20, bold: true, color: "ef4444" }), new TextRun({ text: " 标准答案: ", size: 20, color: "888888" }), new TextRun({ text: q.answer || "", size: 20, bold: true, color: "22c55e" })], spacing: { before: 60, after: 100 } }));
      }
    }

    const doc = new Document({ sections: [{ children: ch }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `刷题答卷_${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { exportDocx };
}
