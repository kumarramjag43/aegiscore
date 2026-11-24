/**
 * Line diffing for the side-by-side remediation viewer and the markdown report.
 *
 * Memory is bounded: the LCS table is a Uint16Array and documents longer than
 * `MAX_LCS_LINES` fall back to an index-aligned comparison instead of a
 * quadratic table, so a 200 KB paste cannot exhaust the server.
 */

export type DiffKind = "same" | "modify" | "remove" | "add";

export interface DiffCell {
  no: number;
  text: string;
}

export interface DiffRow {
  kind: DiffKind;
  left?: DiffCell;
  right?: DiffCell;
}

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

export interface DiffResult {
  rows: DiffRow[];
  stats: DiffStats;
  /** True when the document was too large for a precise LCS diff. */
  coarse: boolean;
}

const MAX_LCS_LINES = 900;

type Op = { t: "eq" | "del" | "ins"; text: string };

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const table = new Uint16Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[at(i, j)] =
        a[i] === b[j]
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: "eq", text: a[i] as string });
      i += 1;
      j += 1;
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
      ops.push({ t: "del", text: a[i] as string });
      i += 1;
    } else {
      ops.push({ t: "ins", text: b[j] as string });
      j += 1;
    }
  }
  while (i < n) ops.push({ t: "del", text: a[i++] as string });
  while (j < m) ops.push({ t: "ins", text: b[j++] as string });
  return ops;
}

function indexAlignedOps(a: string[], b: string[]): Op[] {
  const ops: Op[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === right && left !== undefined) ops.push({ t: "eq", text: left });
    else {
      if (left !== undefined) ops.push({ t: "del", text: left });
      if (right !== undefined) ops.push({ t: "ins", text: right });
    }
  }
  return ops;
}

function opsToRows(ops: Op[]): { rows: DiffRow[]; stats: DiffStats } {
  const rows: DiffRow[] = [];
  const stats: DiffStats = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  let leftNo = 1;
  let rightNo = 1;
  let i = 0;

  while (i < ops.length) {
    const op = ops[i] as Op;
    if (op.t === "eq") {
      rows.push({
        kind: "same",
        left: { no: leftNo, text: op.text },
        right: { no: rightNo, text: op.text },
      });
      leftNo += 1;
      rightNo += 1;
      stats.unchanged += 1;
      i += 1;
      continue;
    }

    const removed: string[] = [];
    const added: string[] = [];
    while (i < ops.length && (ops[i] as Op).t !== "eq") {
      const current = ops[i] as Op;
      if (current.t === "del") removed.push(current.text);
      else added.push(current.text);
      i += 1;
    }

    const paired = Math.min(removed.length, added.length);
    for (let k = 0; k < paired; k += 1) {
      rows.push({
        kind: "modify",
        left: { no: leftNo, text: removed[k] as string },
        right: { no: rightNo, text: added[k] as string },
      });
      leftNo += 1;
      rightNo += 1;
      stats.modified += 1;
    }
    for (let k = paired; k < removed.length; k += 1) {
      rows.push({ kind: "remove", left: { no: leftNo, text: removed[k] as string } });
      leftNo += 1;
      stats.removed += 1;
    }
    for (let k = paired; k < added.length; k += 1) {
      rows.push({ kind: "add", right: { no: rightNo, text: added[k] as string } });
      rightNo += 1;
      stats.added += 1;
    }
  }

  return { rows, stats };
}

export function diffDocuments(before: string, after: string): DiffResult {
  const a = splitLines(before);
  const b = splitLines(after);
  const coarse = a.length > MAX_LCS_LINES || b.length > MAX_LCS_LINES;
  const ops = coarse ? indexAlignedOps(a, b) : lcsOps(a, b);
  const { rows, stats } = opsToRows(ops);
  return { rows, stats, coarse };
}

/** Compact unified diff for the downloadable markdown report. */
export function unifiedDiff(before: string, after: string, context = 3): string {
  const a = splitLines(before);
  const b = splitLines(after);
  const coarse = a.length > MAX_LCS_LINES || b.length > MAX_LCS_LINES;
  const ops = coarse ? indexAlignedOps(a, b) : lcsOps(a, b);

  type Line = { marker: " " | "-" | "+"; text: string; aNo: number; bNo: number };
  const lines: Line[] = [];
  let aNo = 1;
  let bNo = 1;
  for (const op of ops) {
    if (op.t === "eq") {
      lines.push({ marker: " ", text: op.text, aNo, bNo });
      aNo += 1;
      bNo += 1;
    } else if (op.t === "del") {
      lines.push({ marker: "-", text: op.text, aNo, bNo });
      aNo += 1;
    } else {
      lines.push({ marker: "+", text: op.text, aNo, bNo });
      bNo += 1;
    }
  }

  const changed = lines.map((line, index) => (line.marker === " " ? -1 : index)).filter((i) => i >= 0);
  if (changed.length === 0) return "";

  const hunks: { start: number; end: number }[] = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(lines.length - 1, index + context);
    const last = hunks[hunks.length - 1];
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end);
    else hunks.push({ start, end });
  }

  const out: string[] = [];
  for (const hunk of hunks) {
    const slice = lines.slice(hunk.start, hunk.end + 1);
    const aStart = slice[0]?.aNo ?? 1;
    const bStart = slice[0]?.bNo ?? 1;
    const aCount = slice.filter((line) => line.marker !== "+").length;
    const bCount = slice.filter((line) => line.marker !== "-").length;
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (const line of slice) out.push(`${line.marker}${line.text}`);
  }
  return out.join("\n");
}
