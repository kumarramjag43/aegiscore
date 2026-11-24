import type { DomainPack, PipelineContext, VerificationCheck, VerifyResult } from "./types";

/**
 * Core invariants are intentionally domain-agnostic: they prove that a
 * remediation exists, is anchored to real findings, actually changes the
 * artefact and contains no leftover placeholders. Domain packs add the rules
 * that only they can know (parameterised SQL, liability caps, ...).
 */
export function coreChecks(ctx: PipelineContext): VerificationCheck[] {
  const { input, heal, critique } = ctx;
  const findings = critique.findings;
  const patches = heal.patches;
  const repaired = heal.repairedDocument ?? "";

  const unresolvedCritical = findings
    .filter((finding) => finding.severity === "critical" || finding.severity === "high")
    .filter((finding) => !patches.some((patch) => patch.findingId === finding.id));

  const orphanPatches = patches.filter(
    (patch) => !findings.some((finding) => finding.id === patch.findingId),
  );

  const ineffective = patches.filter(
    (patch) => patch.replacement.trim().length === 0 || patch.replacement.trim() === patch.original.trim(),
  );

  const placeholder = /(?:\bTODO\b|\bFIXME\b|<insert\b|REPLACE_ME|YOUR_API_KEY|\[\.\.\.\])/i.test(repaired);

  return [
    {
      id: "core.artefact.present",
      label: "Remediated artefact produced",
      passed: repaired.trim().length >= 20,
      detail: `${repaired.trim().length.toLocaleString()} characters returned by the Auto-Healer.`,
    },
    {
      id: "core.artefact.changed",
      label: "Remediation differs from the original",
      passed: findings.length === 0 || repaired.trim() !== input.trim(),
      detail:
        findings.length === 0
          ? "No findings — the artefact was intentionally left unchanged."
          : repaired.trim() === input.trim()
            ? "The healer returned the input unchanged."
            : "The healer produced a materially different artefact.",
    },
    {
      id: "core.patch.coverage",
      label: "Every high/critical finding has a patch",
      passed: unresolvedCritical.length === 0,
      detail:
        unresolvedCritical.length === 0
          ? `${patches.length} patch(es) cover all ${findings.length} finding(s).`
          : `Unaddressed: ${unresolvedCritical.map((f) => f.id).join(", ")}.`,
    },
    {
      id: "core.patch.anchored",
      label: "Patches reference real findings",
      passed: orphanPatches.length === 0,
      detail:
        orphanPatches.length === 0
          ? "All patch → finding links resolve."
          : `Orphan patch ids: ${orphanPatches.map((p) => p.id).join(", ")}.`,
    },
    {
      id: "core.patch.effective",
      label: "Patches change the artefact",
      passed: ineffective.length === 0,
      detail:
        ineffective.length === 0
          ? "No patch is a no-op."
          : `No-op patches: ${ineffective.map((p) => p.id).join(", ")}.`,
    },
    {
      id: "core.no.placeholders",
      label: "No placeholders in the remediation",
      passed: !placeholder,
      detail: placeholder
        ? "The remediation still contains TODO/FIXME/placeholder markers."
        : "No placeholder markers found.",
    },
    {
      id: "core.evidence.quoted",
      label: "Findings quote their evidence",
      passed: findings.every((finding) => finding.evidence.trim().length >= 3),
      detail: findings.every((finding) => finding.evidence.trim().length >= 3)
        ? "Every finding is anchored to a verbatim excerpt."
        : "At least one finding has no supporting excerpt.",
    },
  ];
}

export interface VerifyMeta {
  /** True when the live provider failed and deterministic analyzers took over. */
  usedFallback: boolean;
  /** True when no model was involved at all (sandbox mode). */
  sandbox: boolean;
}

export function buildVerification(
  ctx: PipelineContext,
  pack: DomainPack,
  meta: VerifyMeta,
): VerifyResult {
  const checks = [...coreChecks(ctx), ...safePackChecks(pack, ctx)];
  const failed = checks.filter((check) => !check.passed).length;

  let confidence = failed === 0 ? 96 : Math.max(38, 96 - failed * 14);
  if (meta.usedFallback) confidence -= 8;
  if (meta.sandbox) confidence -= 4;

  const notes: string[] = [
    "The core recomputed the risk score from findings instead of trusting the Critic's number.",
  ];
  if (meta.sandbox) {
    notes.push("Sandbox mode: deterministic analyzers produced every stage; no model was called.");
  }
  if (meta.usedFallback) {
    notes.push("A live provider returned unusable output, so deterministic analyzers completed the run.");
  }
  if (failed > 0) {
    notes.push(`${failed} verification check(s) failed — review before shipping the remediation.`);
  }

  return {
    passed: failed === 0,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    checks,
    notes,
  };
}

function safePackChecks(pack: DomainPack, ctx: PipelineContext): VerificationCheck[] {
  try {
    return pack.verify(ctx);
  } catch {
    return [
      {
        id: "pack.verify.error",
        label: "Domain verification rules executed",
        passed: false,
        detail: "The domain pack verifier threw; results are incomplete.",
      },
    ];
  }
}
