import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  codeSecurityPack,
  collectAudit,
  contractFraudPack,
  createSseStream,
  detectHits,
  diffDocuments,
  extractJsonObject,
  formatBytes,
  guessFileName,
  isDemoMode,
  normalizeCritique,
  readUploadedText,
  parseClauses,
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
