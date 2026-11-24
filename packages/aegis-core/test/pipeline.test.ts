import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  codeSecurityPack,
  collectAudit,
  contractFraudPack,
  createSseStream,
  detectHits,
  diffDocuments,
  errorMessage,
  extractJsonObject,
  formatBytes,
  guessFileName,
  isDemoMode,
  normalizeCritique,
  readUploadedText,
  parseClauses,
  readByok,
  resolveLlmClient,
  runAudit,
  clampInput,
  redactSecrets,
  unifiedDiff,
  type AgentEvent,
  type LlmClient,
} from "../src/index";

const INSTANT = { stage: 0, log: 0 };

async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("json extraction", () => {
  it("finds a JSON object inside prose and fences", () => {
    const raw = 'Sure! Here you go:\n```json\n{"a": 1, "b": {"c": "}"}}\n```\nThanks.';
    assert.deepEqual(extractJsonObject(raw), { a: 1, b: { c: "}" } });
  });

  it("returns null for unusable output", () => {
    assert.equal(extractJsonObject("no json here"), null);
    assert.equal(extractJsonObject(""), null);
  });

  it("drops malformed findings but keeps valid ones", () => {
    const result = normalizeCritique({
      verdict: "ok",
      riskScore: 88,
      findings: [
        { title: "", evidence: "" },
        {
          id: "F-1",
          title: "SQL injection",
          score: 93,
          category: "Injection",
          location: "Line 9",
          evidence: "pool.query(\"...\" + email)",
          explanation: "x",
          recommendation: "y",
        },
      ],
    });
    assert.equal(result?.findings.length, 1);
    assert.equal(result?.findings[0]?.severity, "critical");
    assert.equal(result?.criticScore, 88);
  });
});

describe("diff", () => {
  it("classifies modified, added and removed lines", () => {
    const result = diffDocuments("a\nb\nc", "a\nB\nc\nd");
    assert.equal(result.stats.modified, 1);
    assert.equal(result.stats.added, 1);
    assert.equal(result.stats.unchanged, 2);
    assert.equal(result.coarse, false);
  });

  it("produces a unified hunk", () => {
    const diff = unifiedDiff("one\ntwo\nthree", "one\nTWO\nthree");
    assert.match(diff, /@@ -\d+,\d+ \+\d+,\d+ @@/);
    assert.match(diff, /^-two$/m);
    assert.match(diff, /^\+TWO$/m);
  });
});

describe("security helpers", () => {
  it("rejects empty and oversized input", () => {
    assert.equal(clampInput("   ", 100).ok, false);
    assert.equal(clampInput(123, 100).ok, false);
    assert.equal(clampInput("x".repeat(101), 100).ok, false);
    assert.equal(clampInput("ok", 100).ok, true);
  });

  it("redacts credential-shaped strings", () => {
    const redacted = redactSecrets("failed with sk-abcdefghijklmnop and AIzaABCDEFGHIJKLMNOPQRSTUV");
    assert.equal(redacted.includes("sk-abcdefghijklmnop"), false);
    assert.equal(redacted.includes("AIzaABCDEFGHIJKLMNOPQRSTUV"), false);
  });
});

describe("provider resolution", () => {
  it("defaults to the sandbox when no key is configured", () => {
    assert.equal(resolveLlmClient({}, codeSecurityPack).mode, "sandbox");
  });

  it("selects openai when a key exists", () => {
    const client = resolveLlmClient({ OPENAI_API_KEY: "sk-test-key-1234567890" }, codeSecurityPack);
    assert.equal(client.id, "openai");
    assert.equal(client.mode, "live");
  });

  it("honours an explicit sandbox override", () => {
    const client = resolveLlmClient(
      { AEGIS_PROVIDER: "demo", OPENAI_API_KEY: "sk-test-key-1234567890" },
      codeSecurityPack,
    );
    assert.equal(client.mode, "sandbox");
  });
});

describe("code security pack", () => {
  for (const preset of codeSecurityPack.presets) {
    it(`audits and repairs "${preset.label}"`, async () => {
      const report = await collectAudit({
        pack: codeSecurityPack,
        input: preset.content,
        title: preset.label,
        pace: INSTANT,
      });

      assert.ok(report, "report produced");
      assert.ok(report.findings.length >= 2, `expected findings, got ${report.findings.length}`);
      assert.ok(report.patches.length >= 1, "expected at least one patch");
      assert.notEqual(report.repairedDocument, preset.content, "document changed");
      assert.equal(report.provider.mode, "sandbox");
      assert.ok(report.risk.score > 50, `risk score ${report.risk.score}`);
      assert.ok(report.markdown.includes("AegisCore Audit"));
      assert.ok(report.markdown.includes("## 4. Verification"));

      const failed = report.verification.checks.filter((check) => !check.passed);
      assert.deepEqual(
        failed.map((check) => `${check.id}: ${check.detail}`),
        [],
        "all verification checks should pass",
      );
      assert.equal(report.verification.passed, true);
    });
  }

  it("parameterises the SQL injection preset", async () => {
    const preset = codeSecurityPack.presets[0];
    assert.ok(preset);
    const report = await collectAudit({
      pack: codeSecurityPack,
      input: preset.content,
      pace: INSTANT,
    });
    assert.ok(report);
    assert.match(report.repairedDocument, /\$1/);
    assert.equal(/\+\s*email/.test(report.repairedDocument), false);
    assert.equal(detectHits(report.repairedDocument).filter((h) => h.detector.score >= 75).length, 0);
  });

  it("moves the hardcoded key into the environment", async () => {
    const preset = codeSecurityPack.presets[1];
    assert.ok(preset);
    const report = await collectAudit({ pack: codeSecurityPack, input: preset.content, pace: INSTANT });
    assert.ok(report);
    assert.equal(report.repairedDocument.includes("sk_live_"), false);
    assert.match(report.repairedDocument, /process\.env\.STRIPE_SECRET_KEY/);
    assert.match(report.repairedDocument, /jwt\.verify\(/);
  });

  it("makes the withdrawal atomic", async () => {
    const preset = codeSecurityPack.presets[2];
    assert.ok(preset);
    const report = await collectAudit({ pack: codeSecurityPack, input: preset.content, pace: INSTANT });
    assert.ok(report);
    assert.match(report.repairedDocument, /findOneAndUpdate/);
    assert.equal(/\.balance\s*-=/.test(report.repairedDocument), false);
  });
});

describe("contract fraud pack", () => {
  for (const preset of contractFraudPack.presets) {
    it(`audits and redlines "${preset.label}"`, async () => {
      const report = await collectAudit({
        pack: contractFraudPack,
        input: preset.content,
        title: preset.label,
        pace: INSTANT,
      });

      assert.ok(report);
      assert.ok(report.findings.length >= 3, `expected findings, got ${report.findings.length}`);
      assert.ok(report.patches.length >= 2, "expected redlines");
      assert.ok(report.repairedDocument.includes("COUNTER-PROPOSAL AND AUDIT NOTICE"));
      assert.ok(report.repairedDocument.includes("Reservation of rights"));
      assert.ok(report.risk.score > 70);
      assert.ok(report.verification.passed, JSON.stringify(report.verification.checks.filter((c) => !c.passed)));

      const flat = (value: string) =>
        value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n");
      for (const patch of report.patches) {
        assert.ok(
          flat(report.repairedDocument).includes(flat(patch.replacement)),
          `redline ${patch.id} missing from counter-document`,
        );
      }
    });
  }

  it("reconciles the inflated invoice", async () => {
    const preset = contractFraudPack.presets[1];
    assert.ok(preset);
    const report = await collectAudit({ pack: contractFraudPack, input: preset.content, pace: INSTANT });
    assert.ok(report);
    const arithmetic = report.findings.find((finding) => finding.title.includes("arithmetic"));
    assert.ok(arithmetic, "arithmetic finding expected");
    assert.equal(arithmetic.severity, "critical");
    assert.ok(report.risk.exposure, "exposure expected");
    assert.ok((report.risk.exposure?.low ?? 0) >= 1000);
    assert.match(report.repairedDocument, /VAT \(19%\)/);
  });

  it("parses numbered clauses", () => {
    const clauses = parseClauses(contractFraudPack.presets[0]?.content ?? "");
    assert.ok(clauses.length >= 7);
    assert.equal(clauses[0]?.location, "Clause 1");
  });
});

describe("pipeline streaming", () => {
  it("emits the full event sequence", async () => {
    const events = await collect(
      runAudit({
        pack: codeSecurityPack,
        input: codeSecurityPack.presets[0]?.content ?? "",
        pace: INSTANT,
      }),
    );

    const types = events.map((event) => event.type);
    assert.equal(types[0], "run.started");
    assert.ok(types.includes("stage.started"));
    assert.ok(types.includes("stage.log"));
    assert.ok(types.includes("stage.completed"));
    assert.ok(types.includes("report.ready"));
    assert.equal(types[types.length - 1], "run.completed");

    const started = events.filter((event) => event.type === "stage.started");
    assert.equal(started.length, 4, "four agents must run");
  });

  it("rejects empty input with run.failed", async () => {
    const events = await collect(runAudit({ pack: codeSecurityPack, input: "   ", pace: INSTANT }));
    assert.equal(events[0]?.type, "run.failed");
  });

  it("falls back to deterministic analyzers when a live provider returns junk", async () => {
    const brokenClient: LlmClient = {
      id: "broken",
      label: "Broken Provider",
      mode: "live",
      async complete() {
        return "I cannot help with that.";
      },
    };

    const events = await collect(
      runAudit({
        pack: codeSecurityPack,
        input: codeSecurityPack.presets[0]?.content ?? "",
        pace: INSTANT,
        llm: brokenClient,
      }),
    );

    const report = events.find((event) => event.type === "report.ready");
    assert.ok(report && report.type === "report.ready");
    assert.ok(report.report.findings.length > 0);
    assert.ok(
      report.report.verification.notes.some((note) => note.includes("deterministic analyzers")),
      "fallback note expected",
    );
    const warnings = events.filter((event) => event.type === "stage.log" && event.level === "warn");
    assert.ok(warnings.length > 0, "fallback should be visible in the stream");
  });

  it("encodes SSE frames that a browser can parse", async () => {
    const stream = createSseStream(
      runAudit({ pack: codeSecurityPack, input: codeSecurityPack.presets[0]?.content ?? "", pace: INSTANT }),
    );
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }

    assert.match(text, /^retry: 3000/);
    assert.match(text, /event: run\.started\ndata: \{/);
    assert.match(text, /event: report\.ready\ndata: \{/);
    const frames = text.split("\n\n").filter((frame) => frame.startsWith("event:"));
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5))
        .join("");
      assert.doesNotThrow(() => JSON.parse(data));
    }
  });
});

/* ------------------------------------------------------- uploads & demo mode */

describe("file intake", () => {
  const RULE = { extensions: [".ts", ".py"], maxBytes: 4096 };

  it("sanitises hostile names and forces an extension", () => {
    const escaped = guessFileName("../../etc/passwd", ".ts");
    assert.ok(!escaped.includes("/"), "path separators must not survive");
    assert.ok(escaped.endsWith(".ts"));

    assert.equal(guessFileName("api/users.js", ".ts"), "api-users.js");
    assert.equal(guessFileName("   ", ".md"), "aegis-export.md");
    assert.equal(guessFileName("x".repeat(200), ".ts").length <= 99, true);
  });

  it("formats byte counts for the UI", () => {
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(2048), "2.0 KB");
    assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
  });

  it("reads an accepted text file and strips a BOM", async () => {
    const result = await readUploadedText(new File(["\uFEFFconst a = 1;"], "route.ts"), RULE);
    assert.equal(result.ok, true);
    assert.equal(result.text, "const a = 1;");
    assert.equal(result.name, "route.ts");
  });

  it("rejects the wrong extension, empty files, binaries and oversize uploads", async () => {
    const wrongType = await readUploadedText(new File(["MZ\u0000"], "tool.exe"), RULE);
    assert.equal(wrongType.ok, false);
    assert.match(wrongType.error ?? "", /Unsupported file type/);

    const empty = await readUploadedText(new File([], "empty.ts"), RULE);
    assert.equal(empty.ok, false);

    const binary = await readUploadedText(new File(["a\u0000b"], "blob.ts"), RULE);
    assert.equal(binary.ok, false);
    assert.match(binary.error ?? "", /binary/);

    const huge = await readUploadedText(new File(["a".repeat(5000)], "big.ts"), RULE);
    assert.equal(huge.ok, false);
    assert.match(huge.error ?? "", /limit is/);
  });
});

describe("demo mode", () => {
  it("parses the switch conservatively", () => {
    assert.equal(isDemoMode({ DEMO_MODE: "true" }), true);
    assert.equal(isDemoMode({ DEMO_MODE: "1" }), true);
    assert.equal(isDemoMode({ DEMO_MODE: " ON " }), true);
    assert.equal(isDemoMode({ DEMO_MODE: "false" }), false);
    assert.equal(isDemoMode({}), false);
  });

  it("pins the sandbox even when a key is present", () => {
    const client = resolveLlmClient({ DEMO_MODE: "true", OPENAI_API_KEY: "sk-not-a-real-key" }, codeSecurityPack);
    assert.equal(client.mode, "sandbox");
  });

  it("uses the live provider once demo mode is off", () => {
    const client = resolveLlmClient({ OPENAI_API_KEY: "sk-not-a-real-key" }, codeSecurityPack);
    assert.equal(client.mode, "live");
  });
});

/* ------------------------------------------------------------------ BYOK */

/** Minimal `Headers` stand-in: enough for `readByok`, no DOM dependency. */
function headersOf(init: Record<string, string>) {
  const lower = new Map(Object.entries(init).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

describe("byok request keys", () => {
  it("turns a pasted key into an env overlay that outranks DEMO_MODE", () => {
    const key = "AIzaSyD-byok-test-key-1234567890";
    const result = readByok(
      headersOf({ "x-aegis-api-key": key, "x-aegis-provider": "gemini" }),
      { DEMO_MODE: "true", OPENAI_API_KEY: "sk-server-side-key" },
    );

    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.config.provider, "gemini");
    assert.equal(result.config.env.GEMINI_API_KEY, key);
    assert.equal(result.config.env.DEMO_MODE, "false", "an explicit key must beat DEMO_MODE");
    assert.equal(result.config.env.AEGIS_PROVIDER, "gemini");
    assert.deepEqual(result.config.redact, [key]);

    const client = resolveLlmClient(result.config.env, codeSecurityPack);
    assert.equal(client.id, "gemini");
    assert.equal(client.mode, "live");
  });

  it("infers the provider from the key prefix when no header is sent", () => {
    const cases: Array<[string, string]> = [
      ["AIzaSyD-byok-test-key-1234567890", "gemini"],
      ["gsk_byoktestkey1234567890", "groq"],
      ["sk-byok-test-key-1234567890", "openai"],
    ];
    for (const [key, provider] of cases) {
      const result = readByok(headersOf({ "x-aegis-api-key": key }));
      assert.equal(result.kind, "ok", `${provider} key should validate`);
      if (result.kind === "ok") assert.equal(result.config.provider, provider);
    }
  });

  it("ignores requests without a key and rejects malformed ones", () => {
    assert.equal(readByok(headersOf({})).kind, "none");

    const tooShort = readByok(headersOf({ "x-aegis-api-key": "abc" }));
    assert.equal(tooShort.kind, "invalid");

    const spaced = readByok(headersOf({ "x-aegis-api-key": "sk-with a space in it 123" }));
    assert.equal(spaced.kind, "invalid");

    const unknown = readByok(
      headersOf({ "x-aegis-api-key": "sk-byok-test-key-1234567890", "x-aegis-provider": "mistral" }),
    );
    assert.equal(unknown.kind, "invalid");

    const providerOnly = readByok(headersOf({ "x-aegis-provider": "openai" }));
    assert.equal(providerOnly.kind, "invalid");

    const oversized = readByok(headersOf({ "x-aegis-api-key": `sk-${"a".repeat(600)}` }));
    assert.equal(oversized.kind, "invalid");
  });

  it("never lets a request key reach an error message", () => {
    const key = "sk-byok-secret-value-abcdef123456";
    const message = errorMessage(new Error(`Provider rejected key ${key} with 401`), [key]);
    assert.equal(message.includes(key), false);
    assert.ok(message.includes("[redacted]"));
    assert.equal(redactSecrets(`token=${key}`, 400, [key]).includes(key), false);
  });
});

/* ------------------------------------------- negative & incomplete-fix QA */

const CLEAN_API = `// api/invoices.js — parameterised, validated, no secrets
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/invoices/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid invoice id" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT id, amount_cents, status FROM invoices WHERE id = $1 AND tenant_id = $2",
      [id, req.tenant.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json(rows[0]);
  } catch {
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
`;

const FAIR_CONTRACT = `MUTUAL SERVICES AGREEMENT

1. Term. This Agreement begins on the Effective Date and continues for twelve (12) months. Either
party may decline to extend it by written notice given thirty (30) days before the end of the term.

2. Fees. Fees are fixed for the Initial Term at the amounts stated in the Order Form. Any increase
requires ninety (90) days' prior written notice, is capped at the lower of 3% or CPI, and the
Customer may terminate without penalty before the increase takes effect.

3. Payment. Invoices are payable net thirty (30) days. Late payments accrue simple interest at the
lower of 1% per month or the maximum rate permitted by law, after a fifteen (15) day grace period.

4. Liability. Each party's aggregate liability under this Agreement shall not exceed the total fees
paid or payable during the twelve (12) months preceding the event giving rise to the claim. Neither
party shall be liable for indirect, incidental or consequential loss.

5. Confidentiality. Each party shall protect the other's confidential information with at least the
care it uses for its own, and shall return or delete it within thirty (30) days of termination.

6. Data. The Supplier processes Customer Data solely to deliver the Services and shall delete or
return all Customer Data within thirty (30) days of termination.

7. Termination. Either party may terminate for convenience on thirty (30) days' written notice, or
immediately for an uncured material breach after a thirty (30) day cure period. The Supplier shall
provide a sixty (60) day transition period and full export of Customer Data.

8. Governing law. This Agreement is governed by the laws of England and Wales, and the parties
submit to the non-exclusive jurisdiction of its courts.
`;

describe("negative cases — no false-positive criticals", () => {
  it("a hardened API handler produces zero critical findings", async () => {
    const report = await collectAudit({
      pack: codeSecurityPack,
      input: CLEAN_API,
      pace: INSTANT,
      env: {},
    });

    assert.ok(report, "a report is still produced");
    const critical = report.findings.filter((finding) => finding.severity === "critical");
    assert.equal(
      critical.length,
      0,
      `unexpected critical findings: ${critical.map((finding) => finding.title).join(" | ")}`,
    );
    assert.ok(report.risk.score < 60, `risk should stay low, got ${report.risk.score}`);
  });

  it("a balanced contract produces zero critical findings", async () => {
    const report = await collectAudit({
      pack: contractFraudPack,
      input: FAIR_CONTRACT,
      pace: INSTANT,
      env: {},
    });

    assert.ok(report, "a report is still produced");
    const critical = report.findings.filter((finding) => finding.severity === "critical");
    assert.equal(
      critical.length,
      0,
      `unexpected critical findings: ${critical.map((finding) => finding.title).join(" | ")}`,
    );
    assert.ok(report.risk.score < 60, `risk should stay low, got ${report.risk.score}`);
  });
});

describe("negative cases — the verifier rejects broken fixes", () => {
  const input = codeSecurityPack.presets[0]?.content ?? "";

  /** A live provider that reports the real findings but refuses to fix them. */
  function lazyHealer(): LlmClient {
    const scan = codeSecurityPack.sandbox.scan(input);
    const critique = codeSecurityPack.sandbox.critique(input, scan);
    return {
      id: "lazy",
      label: "Lazy Provider",
      mode: "live",
      async complete(request) {
        switch (request.stage) {
          case "scanner":
            return JSON.stringify(scan);
          case "critic":
            return JSON.stringify(critique);
          case "healer":
            return JSON.stringify({
              strategy: "Acknowledged but unchanged.",
              patches: [],
              repairedDocument: input,
            });
          default:
            return JSON.stringify([]);
        }
      },
    };
  }

  it("fails verification when the healer returns the artefact unchanged", async () => {
    const report = await collectAudit({
      pack: codeSecurityPack,
      input,
      pace: INSTANT,
      llm: lazyHealer(),
    });

    assert.ok(report);
    assert.ok(
      report.findings.some((finding) => finding.severity === "critical"),
      "the critic must still find the SQL injection",
    );
    assert.equal(report.verification.passed, false);

    const failed = report.verification.checks.filter((check) => !check.passed).map((check) => check.id);
    assert.ok(failed.includes("core.patch.coverage"), `expected coverage failure, got ${failed.join(",")}`);
    assert.ok(failed.includes("core.artefact.changed"), `expected unchanged-artefact failure`);
    assert.ok(report.verification.confidence < 96, "confidence must drop for a rejected fix");
    assert.ok(
      report.verification.notes.some((note) => note.includes("verification check(s) failed")),
      "the report must say why it was rejected",
    );
  });

  it("fails verification when patches are no-ops that change nothing", async () => {
    const scan = codeSecurityPack.sandbox.scan(input);
    const critique = codeSecurityPack.sandbox.critique(input, scan);
    const critical = critique.findings.find((finding) => finding.severity === "critical");
    assert.ok(critical, "preset must contain a critical finding");

    const noopClient: LlmClient = {
      id: "noop",
      label: "No-op Provider",
      mode: "live",
      async complete(request) {
        switch (request.stage) {
          case "scanner":
            return JSON.stringify(scan);
          case "critic":
            return JSON.stringify(critique);
          case "healer":
            return JSON.stringify({
              strategy: "Touch nothing.",
              patches: [
                {
                  id: "P-01",
                  findingId: critical.id,
                  title: "No-op patch",
                  rationale: "Left as-is.",
                  original: "const q = req.query.id;",
                  replacement: "const q = req.query.id;",
                },
              ],
              // Different from the input, but the vulnerable line is untouched.
              repairedDocument: `${input}\n// reviewed`,
            });
          default:
            return JSON.stringify([]);
        }
      },
    };

    const report = await collectAudit({
      pack: codeSecurityPack,
      input,
      pace: INSTANT,
      llm: noopClient,
    });

    assert.ok(report);
    assert.equal(report.verification.passed, false);
    const failed = report.verification.checks.filter((check) => !check.passed).map((check) => check.id);
    assert.ok(
      failed.includes("core.patch.effective"),
      `expected no-op patch failure, got ${failed.join(",")}`,
    );
  });
});
