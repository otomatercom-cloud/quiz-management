/**
 * Tiny spreadsheet engine for the in-exam sheet. No eval/Function: a hand-written parser over a closed grammar.
 * Cells: A1..Z99. Functions: SUM AVERAGE MIN MAX COUNT ROUND ABS SQRT POWER IF. Operators: + - * / ^ and comparisons.
 * Errors come back as strings: #ERR, #DIV/0!, #CIRC, #REF, #NUM.
 */
export type Sheet = Record<string, string>;
export type Value = number | string;

const ERR = { SYNTAX: "#ERR", DIV: "#DIV/0!", CIRC: "#CIRC", REF: "#REF", NUM: "#NUM" } as const;
class FormulaError extends Error {}
const fail = (code: string): never => { throw new FormulaError(code); };

type Tok = { t: "num" | "id" | "op" | "str"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " ") { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: num[0] }); i += num[0].length; continue; }
    const id = /^[A-Za-z]+\d*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0].toUpperCase() }); i += id[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "<>") { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/^(),:<>=".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    return fail(ERR.SYNTAX);
  }
  return out;
}

const CELL = /^([A-Z])(\d{1,2})$/;
export const COLS = "ABCDEFGHIJ".split("");
export const ROWS = 20;
const inGrid = (col: string, row: number) => COLS.includes(col) && row >= 1 && row <= ROWS;

export function evaluate(sheet: Sheet, ref: string, stack: string[] = [], memo: Map<string, Value> = new Map()): Value {
  if (memo.has(ref)) return memo.get(ref)!;
  if (stack.includes(ref)) return ERR.CIRC;
  const raw = (sheet[ref] ?? "").trim();
  let result: Value;
  if (!raw) result = 0;
  else if (!raw.startsWith("=")) {
    const n = Number(raw.replace(/,/g, ""));
    result = raw !== "" && Number.isFinite(n) ? n : raw;
  } else {
    try {
      result = run(raw.slice(1), sheet, [...stack, ref], memo);
    } catch (e) {
      result = e instanceof FormulaError ? e.message : ERR.SYNTAX;
    }
  }
  memo.set(ref, result);
  return result;
}

function run(src: string, sheet: Sheet, stack: string[], memo: Map<string, Value>): Value {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => { const t = toks[p]; if (!t || (v && t.v !== v)) return fail(ERR.SYNTAX); p++; return t; };
  const num = (v: Value): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.startsWith("#")) return fail(v);
    const n = Number(v);
    return Number.isFinite(n) ? n : fail(ERR.NUM);
  };
  const cellValue = (ref: string): Value => {
    const m = CELL.exec(ref);
    if (!m || !inGrid(m[1], Number(m[2]))) return fail(ERR.REF);
    const v = evaluate(sheet, ref, stack, memo);
    if (typeof v === "string" && v.startsWith("#")) return fail(v);
    return v;
  };
  const range = (a: string, b: string): Value[] => {
    const ma = CELL.exec(a), mb = CELL.exec(b);
    if (!ma || !mb) return fail(ERR.REF);
    const [c1, c2] = [ma[1], mb[1]].sort(), [r1, r2] = [Number(ma[2]), Number(mb[2])].sort((x, y) => x - y);
    const out: Value[] = [];
    for (let c = c1.charCodeAt(0); c <= c2.charCodeAt(0); c++)
      for (let r = r1; r <= r2; r++) out.push(cellValue(String.fromCharCode(c) + r));
    return out;
  };

  function expr(): Value { return compare(); }
  function compare(): Value {
    let l = add();
    while (peek() && [">", "<", ">=", "<=", "=", "<>"].includes(peek().v)) {
      const op = eat().v, r = add(), a = num(l), b = num(r);
      l = ({ ">": a > b, "<": a < b, ">=": a >= b, "<=": a <= b, "=": a === b, "<>": a !== b } as Record<string, boolean>)[op] ? 1 : 0;
    }
    return l;
  }
  function add(): Value {
    let l = mul();
    while (peek() && (peek().v === "+" || peek().v === "-")) { const op = eat().v, r = num(mul()); l = op === "+" ? num(l) + r : num(l) - r; }
    return l;
  }
  function mul(): Value {
    let l = pow();
    while (peek() && (peek().v === "*" || peek().v === "/")) {
      const op = eat().v, r = num(pow());
      if (op === "/" && r === 0) return fail(ERR.DIV);
      l = op === "*" ? num(l) * r : num(l) / r;
    }
    return l;
  }
  function pow(): Value {
    const base = unary();
    if (peek()?.v === "^") { eat(); const e = num(pow()); const r = Math.pow(num(base), e); return Number.isFinite(r) ? r : fail(ERR.NUM); }
    return base;
  }
  function unary(): Value {
    if (peek()?.v === "-") { eat(); return -num(unary()); }
    if (peek()?.v === "+") { eat(); return num(unary()); }
    return atom();
  }
  function args(): Value[] {
    const out: Value[] = [];
    eat("(");
    if (peek()?.v === ")") { eat(")"); return out; }
    for (;;) {
      const t = peek();
      if (t?.t === "id" && CELL.test(t.v) && toks[p + 1]?.v === ":") {
        eat(); eat(":"); const end = eat();
        out.push(...range(t.v, end.v));
      } else out.push(expr());
      if (peek()?.v === ",") { eat(","); continue; }
      eat(")");
      return out;
    }
  }
  function atom(): Value {
    const t = peek();
    if (!t) return fail(ERR.SYNTAX);
    if (t.t === "num") { eat(); return Number(t.v); }
    if (t.v === "(") { eat("("); const v = expr(); eat(")"); return v; }
    if (t.t === "id") {
      eat();
      if (peek()?.v === "(") {
        const a = args();
        const nums = () => a.map(num);
        switch (t.v) {
          case "SUM": return nums().reduce((x, y) => x + y, 0);
          case "AVERAGE": return a.length ? nums().reduce((x, y) => x + y, 0) / a.length : fail(ERR.DIV);
          case "MIN": return a.length ? Math.min(...nums()) : 0;
          case "MAX": return a.length ? Math.max(...nums()) : 0;
          case "COUNT": return a.filter((v) => typeof v === "number").length;
          case "ABS": return Math.abs(num(a[0]));
          case "SQRT": return num(a[0]) < 0 ? fail(ERR.NUM) : Math.sqrt(num(a[0]));
          case "POWER": { const r = Math.pow(num(a[0]), num(a[1])); return Number.isFinite(r) ? r : fail(ERR.NUM); }
          case "ROUND": { const d = Math.min(Math.max(Math.trunc(a[1] === undefined ? 0 : num(a[1])), 0), 10); const f = 10 ** d; return Math.round(num(a[0]) * f) / f; }
          case "IF": return num(a[0]) ? a[1] ?? 0 : a[2] ?? 0;
          default: return fail(ERR.SYNTAX);
        }
      }
      return cellValue(t.v);
    }
    return fail(ERR.SYNTAX);
  }

  const v = expr();
  if (p !== toks.length) return fail(ERR.SYNTAX);
  return v;
}

export function display(v: Value): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e8) / 1e8);
  return v;
}
