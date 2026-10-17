export type Question = {
  seq: number;
  type: "mcq" | "true_false" | "descriptive";
  text: string;
  marks: number;
  options: { id: number; text: string }[];
  selected: number[];
  text_answer: string;
  marked: boolean;
};

export type QStatus = "answered" | "review" | "unanswered";

export function statusOf(q: Question): QStatus {
  if (q.marked) return "review";
  return q.selected.length > 0 || q.text_answer.trim() !== "" ? "answered" : "unanswered";
}

export function summarize(qs: Question[]) {
  const answered = qs.filter((q) => q.selected.length > 0 || q.text_answer.trim() !== "").length;
  return { total: qs.length, answered, unanswered: qs.length - answered, marked: qs.filter((q) => q.marked).length };
}

export function selectOption(qs: Question[], seq: number, optionId: number): Question[] {
  return qs.map((q) => (q.seq === seq ? { ...q, selected: q.selected[0] === optionId ? [] : [optionId] } : q));
}

/**
 * Save queue: only the latest pending payload per question is sent (older ones are superseded), failed saves stay
 * queued so they are retried; nothing is ever dropped silently.
 */
export type SavePayload = { seq: number; option_ids?: number[]; text?: string; marked?: boolean };

export function enqueue(queue: SavePayload[], item: SavePayload): SavePayload[] {
  const idx = queue.findIndex((p) => p.seq === item.seq);
  if (idx === -1) return [...queue, item];
  const merged = { ...queue[idx], ...item };
  return queue.map((p, i) => (i === idx ? merged : p));
}
