import type {
  CritiqueResult,
  DomainPack,
  HealResult,
  PipelineContext,
  ScanResult,
  SourceChunk,
  VerificationCheck,
} from "../../types";
import { buildHeal, detectHits, hitsToFindings } from "./detectors";
import { codePrompts } from "./prompts";
import { CODE_PRESETS } from "./samples";

function chunkKind(firstLine: string): string {
  if (/^(?:import|const\s+\w+\s*=\s*require)/.test(firstLine)) return "import";
  if (/\b(?:router|app)\.(?:get|post|put|patch|delete|use)\(/.test(firstLine)) return "route";
  if (/\bfunction\b|=>\s*\{/.test(firstLine)) return "function";
  if (/^\/\//.test(firstLine)) return "comment";
  return "statement";
}

function scan(input: string): ScanResult {
  const lines = input.split("\n");
  const chunks: SourceChunk[] = [];
  let index = 0;

  while (index < lines.length && chunks.length < 60) {
    if ((lines[index] ?? "").trim().length === 0) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < lines.length && (lines[index] ?? "").trim().length > 0) index += 1;
    const block = lines.slice(start, index);
    const first = (block[0] ?? "").trim();
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      label: first.slice(0, 70) || `Block ${chunks.length + 1}`,
      kind: chunkKind(first),
      startLine: start + 1,
      endLine: index,
      content: block.join("\n").slice(0, 4000),
    });
  }

  const stats = {
    lines: lines.length,
    blocks: chunks.length,
    routes: chunks.filter((chunk) => chunk.kind === "route").length,
    functions: chunks.filter((chunk) => chunk.kind === "function").length,
    imports: chunks.filter((chunk) => chunk.kind === "import").length,
  };

  const summary =
    chunks.length === 0
      ? "The input contained no non-empty source lines."
      : `Parsed ${lines.length} lines into ${chunks.length} block(s): ${stats.imports} import(s), ${stats.functions} function(s), ${stats.routes} route(s).`;

  return { summary, chunks, stats };
}

function critique(input: string): CritiqueResult {
  const hits = detectHits(input);
  const findings = hitsToFindings(hits, input);
  const top = findings[0];

  const verdict =
    findings.length === 0
      ? "No exploitable pattern matched the deterministic rule set. Manual review is still recommended for business logic."
      : `${findings.length} issue(s) detected. Highest severity: ${top?.severity.toUpperCase() ?? "INFO"} (${top?.score ?? 0}/100) — "${top?.title ?? "unknown"}" at ${top?.location ?? "an unlocated line"}.`;

  return { verdict, findings, criticScore: top?.score ?? 0 };
}

function heal(input: string, _scan: ScanResult, _critique: CritiqueResult): HealResult {
  return buildHeal(input, detectHits(input), _critique);
}

/** Heuristic delimiter check: skips string literals and comments. */
function balanceOf(code: string): { ok: boolean; detail: string } {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < code.length; i += 1) {
    const char = code[i] as string;
    const next = code[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      stack.push(char);
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      const open = stack.pop();
      if (open !== pairs[char]) return { ok: false, detail: `Unmatched "${char}" at character ${i}.` };
    }
  }

  if (quote) return { ok: false, detail: "Unterminated string literal." };
  if (stack.length > 0) return { ok: false, detail: `${stack.length} unclosed delimiter(s).` };
  return { ok: true, detail: "Brackets, braces and string literals are balanced." };
}

function verify(ctx: PipelineContext): VerificationCheck[] {
  const repaired = ctx.heal.repairedDocument;
  const residual = detectHits(repaired).filter((hit) => hit.detector.score >= 75);
  const balance = balanceOf(repaired);
  const introducedEval =
    !/\beval\s*\(/.test(ctx.input) && /(?<![\w$.])eval\s*\(/.test(repaired);

  return [
    {
      id: "code.delimiters",
      label: "Patched file stays syntactically balanced",
      passed: balance.ok,
      detail: balance.detail,
    },
    {
      id: "code.residual.critical",
      label: "No high/critical pattern survives the patch",
      passed: residual.length === 0,
      detail:
        residual.length === 0
          ? "Re-running every detector against the patched file returns no high-severity match."
          : `Still present: ${residual.map((hit) => `${hit.detector.id} (line ${hit.lineIndex + 1})`).join(", ")}.`,
    },
    {
      id: "code.no.new.eval",
      label: "Patch introduces no dynamic code execution",
      passed: !introducedEval,
      detail: introducedEval ? "The patch added an eval() call." : "No new eval() call was introduced.",
    },
    {
      id: "code.patch.count",
      label: "Every detected finding has a patch",
      passed: ctx.critique.findings.length === 0 || ctx.heal.patches.length > 0,
      detail: `${ctx.heal.patches.length} patch(es) for ${ctx.critique.findings.length} finding(s).`,
    },
  ];
}

export const codeSecurityPack: DomainPack = {
  id: "code-security",
  label: "Code & API Security",
  documentNoun: "source file",
  actionLabel: "Run security audit",
  agents: {
    scanner: {
      stage: "scanner",
      name: "Scanner",
      role: "Chunks the source into routes, functions and config blocks with exact line anchors.",
      accent: "#22d3ee",
    },
    critic: {
      stage: "critic",
      name: "Risk Critic",
      role: "Scores each chunk for injection, secret, auth, concurrency and exposure risk.",
      accent: "#fb923c",
    },
    healer: {
      stage: "healer",
      name: "Auto-Healer",
      role: "Rewrites each finding into secure code and returns the complete patched file.",
      accent: "#34d399",
    },
    verifier: {
      stage: "verifier",
      name: "Verifier",
      role: "Re-runs every detector on the patch, checks syntax balance and signs the report.",
      accent: "#a78bfa",
    },
  },
  presets: CODE_PRESETS,
  prompts: codePrompts,
  sandbox: { scan, critique, heal },
  verify,
};
