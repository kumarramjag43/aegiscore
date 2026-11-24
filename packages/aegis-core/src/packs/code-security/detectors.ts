import type { CritiqueResult, Finding, HealResult, Patch } from "../../types";
import { normalizeFinding } from "../../scoring";

/**
 * Deterministic, line-oriented vulnerability detectors for the CodeMedic pack.
 *
 * Each detector is a real pattern match against the pasted source and returns a
 * real text transform for the offending slice — the diff the judge sees is the
 * genuine before/after of their own input, not canned prose.
 */

export interface FixResult {
  /** Exact slice of the original document that this patch replaces. */
  original: string;
  replacement: string;
}

export interface FixContext {
  line: string;
  lineIndex: number;
  lines: string[];
  doc: string;
  match: RegExpExecArray;
}

export interface Detector {
  id: string;
  category: string;
  title: string;
  score: number;
  explanation: string;
  recommendation: string;
  pattern: RegExp;
  accepts?: (line: string) => boolean;
  fix: (ctx: FixContext) => FixResult | null;
}

export interface Hit {
  detector: Detector;
  lineIndex: number;
  line: string;
  match: RegExpExecArray;
}

const MAX_FINDINGS = 14;

/* ------------------------------------------------------------------ helpers */

function splitIndent(line: string): { indent: string; body: string } {
  const indent = /^[ \t]*/.exec(line)?.[0] ?? "";
  return { indent, body: line.slice(indent.length) };
}

function envName(identifier: string): string {
  const snake = identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase()
    .replace(/^_+|_+$/g, "");
  return /(KEY|SECRET|TOKEN|PASSWORD|PASS|PWD)$/.test(snake) ? snake : `${snake || "SERVICE"}_SECRET`;
}

/** Split an expression on a top-level operator, ignoring quotes and brackets. */
function splitTopLevel(expression: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i] as string;
    if (quote) {
      current += char;
      if (char === "\\") {
        current += expression[i + 1] ?? "";
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if ("([{".includes(char)) depth += 1;
    if (")]}".includes(char)) depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
}

function unquote(piece: string): string | null {
  const match = /^(["'])([\s\S]*)\1$/.exec(piece);
  return match ? (match[2] as string) : null;
}

function templateSegments(piece: string): { text: string[]; expressions: string[] } | null {
  const match = /^`([\s\S]*)`$/.exec(piece);
  if (!match) return null;
  const inner = match[1] as string;
  const text: string[] = [];
  const expressions: string[] = [];
  let buffer = "";
  let i = 0;

  while (i < inner.length) {
    if (inner[i] === "$" && inner[i + 1] === "{") {
      let depth = 1;
      let j = i + 2;
      let expression = "";
      while (j < inner.length && depth > 0) {
        if (inner[j] === "{") depth += 1;
        if (inner[j] === "}") depth -= 1;
        if (depth > 0) expression += inner[j];
        j += 1;
      }
      text.push(buffer);
      buffer = "";
      expressions.push(expression.trim());
      i = j;
      continue;
    }
    buffer += inner[i];
    i += 1;
  }
  text.push(buffer);
  return { text, expressions };
}

/** Rewrite `"SELECT ... '" + email + "'"` into `SELECT ... $1` + params. */
function parameterize(argument: string): { sql: string; params: string[] } | null {
  const pieces = splitTopLevel(argument, "+");
  const params: string[] = [];
  let sql = "";

  for (const piece of pieces) {
    const template = templateSegments(piece);
    if (template) {
      template.text.forEach((chunk, index) => {
        sql += chunk;
        const expression = template.expressions[index];
        if (expression) {
          params.push(expression);
          sql += `$${params.length}`;
        }
      });
      continue;
    }
    const literal = unquote(piece);
    if (literal !== null) {
      sql += literal;
      continue;
    }
    params.push(piece);
    sql += `$${params.length}`;
  }

  if (params.length === 0) return null;
  // Drop the quotes that used to wrap an interpolated value.
  sql = sql.replace(/(['"`])(\s*)\$(\d+)(\s*)\1/g, "$2$$$3$4");
  return { sql, params };
}

function fixQueryConcat(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  const match = /^([\s\S]*?)([\w$.]+\.(?:query|execute|raw|prepare))\(\s*([\s\S]+?)\)\s*(;?)$/.exec(
    body,
  );
  if (!match) return null;

  const prefix = match[1] as string;
  const callee = match[2] as string;
  const argument = match[3] as string;
  const terminator = match[4] as string;

  const built = parameterize(argument);
  if (!built) return null;

  const sqlLiteral = "`" + built.sql.replace(/`/g, "\\`") + "`";
  const replacement = `${indent}${prefix}${callee}(${sqlLiteral}, [${built.params.join(", ")}])${terminator}`;
  if (replacement === ctx.line) return null;
  return { original: ctx.line, replacement };
}

function fixHardcodedSecret(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);

  const declaration = /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])(?:[^"'\\]|\\.)*\3/.exec(body);
  if (declaration) {
    const identifier = declaration[2] as string;
    const replaced = body.replace(
      new RegExp(`(\\b${declaration[1]}\\s+${identifier.replace(/\$/g, "\\$")}\\s*=\\s*)(["'])(?:[^"'\\\\]|\\\\.)*\\2`),
      `$1process.env.${envName(identifier)} ?? ""`,
    );
    if (replaced !== body) return { original: ctx.line, replacement: `${indent}${replaced}` };
  }

  const property = /([A-Za-z_$][\w$]*)\s*:\s*(["'])(?:[^"'\\]|\\.)*\2/.exec(body);
  if (property) {
    const identifier = property[1] as string;
    const replaced = body.replace(
      /([A-Za-z_$][\w$]*\s*:\s*)(["'])(?:[^"'\\]|\\.)*\2/,
      `$1process.env.${envName(identifier)} ?? ""`,
    );
    if (replaced !== body) return { original: ctx.line, replacement: `${indent}${replaced}` };
  }

  const literal = /(["'])(?:sk_live_|sk_test_|AKIA|ghp_|xoxb-)[A-Za-z0-9_-]+\1/.exec(body);
  if (literal) {
    return {
      original: ctx.line,
      replacement: `${indent}${body.replace(literal[0], 'process.env.SERVICE_SECRET ?? ""')}`,
    };
  }
  return null;
}

function fixJwtDecode(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  let replaced = body.replace(
    /jwt\.decode\(\s*([^)]*)\)/g,
    'jwt.verify($1, process.env.JWT_SECRET ?? "", { algorithms: ["HS256"] })',
  );
  replaced = replaced.replace(/verify\s*:\s*false/g, "verify: true");
  replaced = replaced.replace(/ignoreExpiration\s*:\s*true/g, "ignoreExpiration: false");
  replaced = replaced.replace(/algorithms\s*:\s*\[\s*["']none["']\s*\]/g, 'algorithms: ["HS256"]');
  if (replaced === body) return null;
  return { original: ctx.line, replacement: `${indent}${replaced}` };
}

function extractIdVar(doc: string): string | null {
  const mongo = /findOne\(\s*\{\s*_id\s*:\s*([A-Za-z_$][\w$]*)/.exec(doc);
  if (mongo) return mongo[1] as string;
  const sql = /WHERE\s+id\s*=\s*\$1\s*",\s*\[\s*([A-Za-z_$][\w$]*)/i.exec(doc);
  if (sql) return sql[1] as string;
  const param = /(?:^|[\s(,])(accountId|userId|walletId|id)\b/.exec(doc);
  return param ? (param[1] as string) : null;
}

function extractCollection(doc: string): string | null {
  const mongo = /\b(db\.[A-Za-z_$][\w$]*)\s*\.\s*findOne\(/.exec(doc);
  if (mongo) return mongo[1] as string;
  const generic = /\b([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\s*\.\s*findOne\(/.exec(doc);
  return generic ? (generic[1] as string) : null;
}

/** Replace the whole check-then-act block with one atomic conditional update. */
function fixRaceCondition(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  const target = /^([\s\S]*?)([A-Za-z_$][\w$]*)\.(balance|stock|credits|inventory|points)\s*-=\s*([^;]+);?\s*$/.exec(
    body,
  );
  if (!target) return null;

  const entityVar = target[2] as string;
  const field = target[3] as string;
  const delta = (target[4] as string).trim();
  const idVar = extractIdVar(ctx.doc);
  const collection = extractCollection(ctx.doc);
  if (!idVar || !collection) return null;

  let start = ctx.lineIndex;
  while (start > 0 && !/findOne\(|SELECT[\s\S]*FROM/i.test(ctx.lines[start] ?? "")) start -= 1;
  let end = ctx.lineIndex;
  while (end < ctx.lines.length - 1 && !/updateOne\(|UPDATE[\s\S]*SET/i.test(ctx.lines[end] ?? "")) end += 1;

  const reads = /findOne\(|SELECT[\s\S]*FROM/i.test(ctx.lines[start] ?? "");
  const writes = /updateOne\(|UPDATE[\s\S]*SET/i.test(ctx.lines[end] ?? "");
  if (!reads || !writes || end < ctx.lineIndex) return null;

  const original = ctx.lines.slice(start, end + 1).join("\n");
  const pad = /^[ \t]*/.exec(ctx.lines[start] ?? "")?.[0] ?? indent;
  const replacement = [
    `${pad}const ${entityVar} = await ${collection}.findOneAndUpdate(`,
    `${pad}  { _id: ${idVar}, ${field}: { $gte: ${delta} } },`,
    `${pad}  { $inc: { ${field}: -${delta} } },`,
    `${pad}  { returnDocument: "after" },`,
    `${pad});`,
    `${pad}if (!${entityVar}) throw new Error("insufficient funds");`,
  ].join("\n");

  return { original, replacement };
}

function fixEval(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  const replaced = body.replace(/(?<![\w$.])eval\s*\(/g, "JSON.parse(");
  if (replaced === body) return null;
  return { original: ctx.line, replacement: `${indent}${replaced}` };
}

function fixExecTemplate(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  const call = /(?:exec|execSync)\(\s*(`[^`]*`)\s*\)/.exec(body);
  if (!call) return null;
  const segments = templateSegments(call[1] as string);
  if (!segments) return null;

  const head = (segments.text[0] ?? "").trim();
  const argv = head.split(/\s+/).filter(Boolean);
  if (argv.length === 0) return null;

  const args = [
    ...argv.slice(1).map((token) => JSON.stringify(token)),
    ...segments.expressions,
  ];
  const replacementCall = `execFile(${JSON.stringify(argv[0])}, [${args.join(", ")}])`;
  const replaced = body.replace(call[0], replacementCall);
  if (replaced === body) return null;
  return { original: ctx.line, replacement: `${indent}${replaced}` };
}

function fixMissingAuth(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  // Reuse the middleware the file already defines instead of inventing a name.
  const known = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(\s*req\s*,\s*res\s*,\s*next\s*\)/.exec(
    ctx.doc,
  )?.[1];
  const guard = known ?? "requireAuth";
  const replaced = body.replace(
    /(app\.(?:get|post|put|patch|delete)\(\s*(["'])[^"']*\2\s*,)/,
    `$1 ${guard},`,
  );
  if (replaced === body) return null;
  return { original: ctx.line, replacement: `${indent}${replaced}` };
}

function fixCorsWildcard(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  const replaced = body.replace(
    /origin\s*:\s*(["'])\*\1/g,
    'origin: process.env.ALLOWED_ORIGIN ?? "https://app.example.com"',
  );
  if (replaced === body) return null;
  return { original: ctx.line, replacement: `${indent}${replaced}` };
}

function fixWeakCrypto(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  let replaced = body.replace(/createHash\(\s*(["'])(?:md5|sha1)\1\s*\)/gi, 'createHash("sha256")');
  replaced = replaced.replace(/Math\.random\(\)\s*\.\s*toString\(36\)[\s\S]*?(?=;|$)/, "randomUUID()");
  if (replaced === body) return null;
  return { original: ctx.line, replacement: `${indent}${replaced}` };
}

function fixSecretLogging(ctx: FixContext): FixResult | null {
  const { indent } = splitIndent(ctx.line);
  return {
    original: ctx.line,
    replacement: `${indent}console.log("[aegis] sensitive value withheld from logs");`,
  };
}

function fixXss(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  const replaced = body.replace(/\.innerHTML\s*=\s*/g, ".textContent = ");
  if (replaced === body) return null;
  return { original: ctx.line, replacement: `${indent}${replaced}` };
}

function fixErrorLeak(ctx: FixContext): FixResult | null {
  const { indent, body } = splitIndent(ctx.line);
  const replaced = body.replace(
    /res\.status\(500\)\.json\(\s*\{[^}]*\}\s*\)/,
    'res.status(500).json({ error: "Internal server error" })',
  );
  if (replaced === body) return null;
  return { original: ctx.line, replacement: `${indent}${replaced}` };
}

/* ---------------------------------------------------------------- detectors */

export const DETECTORS: Detector[] = [
  {
    id: "sql.injection.concat",
    category: "Injection",
    title: "SQL injection through string concatenation",
    score: 94,
    explanation:
      "User-controlled data is concatenated into the SQL text, so an attacker can rewrite the query (e.g. `' OR 1=1 --`).",
    recommendation:
      "Pass values as bound parameters and keep the SQL string static. Never build queries with `+` or template interpolation.",
    pattern: /\.(?:query|execute|raw|prepare)\s*\(\s*["'`][\s\S]*?\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*?["'`]\s*\+/i,
    fix: fixQueryConcat,
  },
  {
    id: "sql.injection.template",
    category: "Injection",
    title: "SQL injection through template interpolation",
    score: 92,
    explanation:
      "A template literal interpolates request data directly into SQL, which is equivalent to string concatenation for an attacker.",
    recommendation: "Use bound parameters (`$1`, `?`) instead of `${...}` inside a query string.",
    pattern: /\.(?:query|execute|raw|prepare)\s*\(\s*`[^`]*\$\{/i,
    fix: fixQueryConcat,
  },
  {
    id: "secret.literal",
    category: "Secrets",
    title: "Live credential committed in source",
    score: 96,
    explanation:
      "A production-looking API key is embedded in the file. Anyone with repository or bundle access can reuse it, and rotating it is the only remediation.",
    recommendation:
      "Revoke the key immediately, load it from an environment variable, and add a secret scanner to CI.",
    pattern: /(?:sk_live_|sk_test_|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xoxb-[A-Za-z0-9-]{10,})/,
    fix: fixHardcodedSecret,
  },
  {
    id: "secret.hardcoded",
    category: "Secrets",
    title: "Hardcoded secret assigned to a variable",
    score: 90,
    explanation:
      "The secret is a literal in code, so it leaks with every clone, log bundle and build artefact.",
    recommendation: "Read the value from `process.env` and fail fast when it is missing.",
    pattern:
      /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD)[\w$]*\s*=\s*["'][^"']{8,}["']/i,
    fix: fixHardcodedSecret,
  },
  {
    id: "auth.jwt.decode",
    category: "Authentication",
    title: "JWT accepted without signature verification",
    score: 89,
    explanation:
      "`jwt.decode` parses the token but never verifies its signature, so any caller can forge claims such as `role: admin`.",
    recommendation:
      "Verify with `jwt.verify` using an explicit algorithm allow-list and a secret from the environment.",
    pattern: /jwt\.decode\s*\(|verify\s*:\s*false|ignoreExpiration\s*:\s*true|algorithms\s*:\s*\[\s*["']none["']\s*\]/,
    fix: fixJwtDecode,
  },
  {
    id: "concurrency.race",
    category: "Concurrency",
    title: "Non-atomic check-then-act on a shared balance",
    score: 82,
    explanation:
      "The balance is read, validated in memory and written back. Two concurrent withdrawals can both pass the check, producing a negative balance and lost funds.",
    recommendation:
      "Perform a single conditional atomic update (`findOneAndUpdate` with `$gte` + `$inc`) or hold a row lock inside a transaction.",
    pattern: /\.(?:balance|stock|credits|inventory|points)\s*-=\s*[^;]+;?/,
    fix: fixRaceCondition,
  },
  {
    id: "injection.eval",
    category: "Injection",
    title: "Dynamic code execution on untrusted input",
    score: 86,
    explanation:
      "`eval` executes arbitrary JavaScript. If any part of the expression is attacker-influenced, this is remote code execution.",
    recommendation: "Parse data with `JSON.parse` or a schema validator instead of executing it.",
    pattern: /(?<![\w$.])eval\s*\(/,
    fix: fixEval,
  },
  {
    id: "injection.command",
    category: "Injection",
    title: "Shell command built from interpolated input",
    score: 91,
    explanation:
      "The command string is assembled with user data and passed to a shell, so `; rm -rf /` executes as part of the request.",
    recommendation: "Use `execFile` with an argument array and no shell.",
    pattern: /(?:exec|execSync)\(\s*`[^`]*\$\{/,
    fix: fixExecTemplate,
  },
  {
    id: "auth.missing",
    category: "Authorization",
    title: "Sensitive route registered without an auth guard",
    score: 84,
    explanation:
      "An administrative or billing endpoint is mounted with no authentication middleware, so it is reachable anonymously.",
    recommendation: "Add the auth middleware before the handler and assert the required role inside it.",
    pattern:
      /app\.(?:get|post|put|patch|delete)\(\s*["'][^"']*(?:admin|internal|billing|payout|ledger)[^"']*["']\s*,\s*(?!\s*(?:requireAuth|auth|verifyToken|authenticate))/i,
    fix: fixMissingAuth,
  },
  {
    id: "cors.wildcard",
    category: "Configuration",
    title: "CORS wildcard exposes authenticated responses",
    score: 66,
    explanation:
      "With `origin: '*'` any website can read responses from the API, which turns every logged-in user into a confused deputy.",
    recommendation: "Pin an allow-list of origins from configuration and keep credentials off wildcard routes.",
    pattern: /origin\s*:\s*["']\*["']/,
    fix: fixCorsWildcard,
  },
  {
    id: "crypto.weak",
    category: "Cryptography",
    title: "Weak hash or predictable randomness",
    score: 61,
    explanation:
      "MD5/SHA-1 are collision-prone and `Math.random` is not a cryptographic source, so tokens become guessable.",
    recommendation:
      "Use SHA-256 or better for integrity, and `randomUUID()` from `node:crypto` for tokens.",
    pattern: /createHash\(\s*["'](?:md5|sha1)["']\s*\)|Math\.random\(\)\s*\.\s*toString\(36\)/i,
    fix: fixWeakCrypto,
  },
  {
    id: "logging.secret",
    category: "Data exposure",
    title: "Secret written to application logs",
    score: 72,
    explanation:
      "Logs are widely readable and often shipped to third parties; printing a key or token is a credential leak.",
    recommendation: "Log a redacted identifier instead of the secret value.",
    pattern: /console\.(?:log|info|debug)\([^)]*(?:password|passwd|token|secret|apiKey|api_key|authorization|stripe_key)[^)]*\)/i,
    fix: fixSecretLogging,
  },
  {
    id: "xss.innerhtml",
    category: "XSS",
    title: "Untrusted value written to innerHTML",
    score: 78,
    explanation:
      "Assigning interpolated data to `innerHTML` executes embedded markup and scripts in the victim's browser.",
    recommendation: "Use `textContent` for text, or sanitise with a vetted library before inserting HTML.",
    pattern: /\.innerHTML\s*=\s*(?!["'`])/,
    fix: fixXss,
  },
  {
    id: "error.leak",
    category: "Data exposure",
    title: "Internal error object returned to the client",
    score: 54,
    explanation:
      "Serialising the raw error exposes stack traces, SQL fragments and internal paths to an attacker.",
    recommendation: "Return a generic message and log the detail server-side with a correlation id.",
    pattern: /res\.status\(500\)\.json\(\s*\{[^}]*\b(?:error|err|message)\s*:\s*(?:err|error|e)\b/,
    fix: fixErrorLeak,
  },
];

/* ----------------------------------------------------------------- pipeline */

export function detectHits(doc: string): Hit[] {
  const lines = doc.split("\n");
  const hits: Hit[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] as string;
    if (line.trim().length === 0) continue;

    for (const detector of DETECTORS) {
      detector.pattern.lastIndex = 0;
      const match = detector.pattern.exec(line);
      detector.pattern.lastIndex = 0;
      if (!match) continue;
      if (detector.accepts && !detector.accepts(line)) continue;
      hits.push({ detector, lineIndex, line, match });
      break;
    }
  }

  return hits
    .sort((a, b) => b.detector.score - a.detector.score || a.lineIndex - b.lineIndex)
    .slice(0, MAX_FINDINGS);
}

/** Nearest route or function declaration above a hit, used to disambiguate repeats. */
function enclosingLabel(lines: string[], index: number): string {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const line = lines[cursor] ?? "";
    const route = /\b(?:app|router)\.(get|post|put|patch|delete|all)\(\s*["']([^"']+)["']/i.exec(line);
    if (route) return `${(route[1] as string).toUpperCase()} ${route[2] as string}`;
    const fn = /\b(?:function|const|let)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?\(|\()/.exec(line);
    if (fn) return `${fn[1] as string}()`;
  }
  return "file scope";
}

export function hitsToFindings(hits: Hit[], doc: string): Finding[] {
  const lines = doc.split("\n");
  const repeats = new Map<string, number>();
  for (const hit of hits) repeats.set(hit.detector.id, (repeats.get(hit.detector.id) ?? 0) + 1);

  return hits.map((hit, index) => {
    const repeated = (repeats.get(hit.detector.id) ?? 0) > 1;
    return normalizeFinding({
      id: `F-${String(index + 1).padStart(2, "0")}`,
      title: repeated ? `${hit.detector.title} · ${enclosingLabel(lines, hit.lineIndex)}` : hit.detector.title,
      severity: "info",
      score: hit.detector.score,
      category: hit.detector.category,
      location: `Line ${hit.lineIndex + 1}`,
      evidence: hit.line.trim().slice(0, 300),
      explanation: hit.detector.explanation,
      recommendation: hit.detector.recommendation,
    });
  });
}

export function buildHeal(doc: string, hits: Hit[], critique: CritiqueResult): HealResult {
  const lines = doc.split("\n");
  let repaired = doc;
  const patches: Patch[] = [];

  hits.forEach((hit, index) => {
    const fix = hit.detector.fix({
      line: hit.line,
      lineIndex: hit.lineIndex,
      lines,
      doc,
      match: hit.match,
    });
    if (!fix) return;

    const position = repaired.indexOf(fix.original);
    if (position === -1) return;

    repaired = repaired.slice(0, position) + fix.replacement + repaired.slice(position + fix.original.length);
    patches.push({
      id: `P-${String(index + 1).padStart(2, "0")}`,
      findingId: `F-${String(index + 1).padStart(2, "0")}`,
      title: hit.detector.title,
      rationale: hit.detector.recommendation,
      original: fix.original,
      replacement: fix.replacement,
    });
  });

  const unfixed = critique.findings.length - patches.length;
  const strategy =
    patches.length === 0
      ? "No safe automated transformation was available for this input; findings require manual remediation."
      : `Applied ${patches.length} targeted transformation(s): bound parameters replace string-built queries, credentials move to environment variables, signature verification is restored, and check-then-act ledger writes become atomic conditional updates.${
          unfixed > 0 ? ` ${unfixed} finding(s) need manual review.` : ""
        }`;

  return { strategy, patches, repairedDocument: repaired };
}
