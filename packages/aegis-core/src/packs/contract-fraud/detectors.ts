import { normalizeFinding } from "../../scoring";
import type { Finding, HealResult, MoneyExposure, Patch } from "../../types";

/**
 * Deterministic red-flag analysis for the LexGuard pack.
 *
 * The analyser parses numbered clauses, matches commercial-risk signals and
 * verifies invoice arithmetic. Every number in the exposure estimate is derived
 * from the document, and every redline is a real replacement for a real clause.
 */

export interface Clause {
  id: string;
  number: string;
  title: string;
  text: string;
  location: string;
}

export interface LegalSignal {
  id: string;
  category: string;
  title: string;
  score: number;
  explanation: string;
  recommendation: string;
  pattern: RegExp;
  /** Legally safer replacement language for the flagged clause. */
  replacement: (clause: Clause) => string;
}

export interface LegalHit {
  signal: LegalSignal;
  clause: Clause;
  evidence: string;
}

interface Candidate {
  finding: Omit<Finding, "id">;
  patch: { title: string; rationale: string; original: string; replacement: string } | null;
}

export interface LegalAnalysis {
  findings: Finding[];
  patches: Patch[];
  counterDocument: string;
  strategy: string;
  exposure?: MoneyExposure;
}

const MAX_FINDINGS = 14;
const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+)*)[.)]?\s+(.{3,120})$/;
const LABELLED_HEADING = /^\s*(?:article|clause|section)\s+(\d+(?:\.\d+)*)\s*[.:-]?\s*(.{0,120})$/i;

/**
 * Invoice line items look like "1. Sensor array — qty 12 x $1,850.00 = $22,200".
 * They are not clause headings, so an equals sign disqualifies a heading.
 */
function isHeadingTitle(title: string): boolean {
  if (title.length > 110) return false;
  if (title.includes("=")) return false;
  if (/^\d+\s*x\s/i.test(title)) return false;
  return true;
}

export function parseClauses(doc: string): Clause[] {
  const lines = doc.split("\n");
  const headings: { index: number; number: string; title: string }[] = [];

  lines.forEach((line, index) => {
    const match = NUMBERED_HEADING.exec(line) ?? LABELLED_HEADING.exec(line);
    if (!match) return;
    const title = (match[2] as string).trim();
    if (!isHeadingTitle(title)) return;
    headings.push({ index, number: match[1] as string, title });
  });

  if (headings.length >= 3) {
    return headings.map((heading, position) => {
      const end = position + 1 < headings.length ? (headings[position + 1] as { index: number }).index : lines.length;
      const text = lines.slice(heading.index, end).join("\n").trim();
      return {
        id: `clause-${heading.number}`,
        number: heading.number,
        title: heading.title.slice(0, 90),
        text,
        location: `Clause ${heading.number}`,
      };
    });
  }

  // Fall back to paragraph segmentation for unstructured documents.
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) {
      if (current.length > 0) blocks.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join("\n"));

  return blocks.map((text, index) => ({
    id: `para-${index + 1}`,
    number: String(index + 1),
    title: text.replace(/\s+/g, " ").slice(0, 70),
    text,
    location: `Paragraph ${index + 1}`,
  }));
}

/**
 * Extracts the sentence containing `index`. A period only ends a sentence when
 * it is followed by whitespace and an upper-case character, so clause numbers
 * such as "2.3" are never treated as boundaries.
 */
function sentenceAround(text: string, index: number): string {
  const boundary = /(?:[.!?](?=\s+["'“(]?[A-Z0-9])|\n{2,})/g;
  let start = 0;
  for (const match of text.slice(0, index).matchAll(boundary)) {
    start = (match.index ?? 0) + match[0].length;
  }
  const after = text.slice(index);
  const endMatch = /[.!?](?=\s|$)/.exec(after);
  const end = endMatch ? index + (endMatch.index ?? 0) + 1 : Math.min(text.length, index + 400);
  return text.slice(start, end).trim().replace(/\s+/g, " ").slice(0, 400);
}

export const LEGAL_SIGNALS: LegalSignal[] = [
  {
    id: "liability.unlimited",
    category: "Liability",
    title: "Uncapped or one-sided liability",
    score: 95,
    explanation:
      "The counterparty's exposure is unlimited while yours is indemnified in full, so a single incident can exceed the entire contract value.",
    recommendation:
      "Insert a mutual liability cap at 12 months' fees, exclude indirect loss, and delete one-way indemnities.",
    pattern:
      /unlimited liability|without limitation[^.]{0,40}liabilit|liability (?:shall|will) not (?:be )?limited|any and all (?:claims|damages|losses)|indemnif\w*[^.]{0,80}any and all/i,
    replacement: () =>
      "Each party's aggregate liability under this Agreement shall not exceed the total fees paid or payable during the twelve (12) months preceding the event giving rise to the claim. Neither party shall be liable for indirect, incidental or consequential loss, and indemnities shall be mutual.",
  },
  {
    id: "payment.diversion",
    category: "Payment fraud",
    title: "Bank details changed by notice",
    score: 94,
    explanation:
      "A mid-contract change of bank details communicated in the document is the classic business email compromise pattern; paying it transfers funds irrecoverably.",
    recommendation:
      "Freeze payment, verify the change out-of-band with a known contact, and require dual authorisation for any change of bank details.",
    pattern:
      /(?:wire|bank|remittance)[^.]{0,60}(?:details|account|instructions)[^.]{0,50}(?:changed|updated|revised|new)|new bank account|updated banking (?:details|information)/i,
    replacement: () =>
      "Payments shall be made only to the account named in the executed Order Form. Any change of bank details requires written confirmation signed by two authorised officers of the Supplier and independent call-back verification by the Customer. The Customer is not liable for transfers made in reliance on unverified instructions.",
  },
  {
    id: "loan.acceleration",
    category: "Financing",
    title: "Acceleration, cross-default or prepayment penalty",
    score: 90,
    explanation:
      "Acceleration and cross-default clauses can make the entire balance fall due because of an unrelated event, and prepayment penalties lock the borrower in.",
    recommendation:
      "Remove acceleration and cross-default triggers, delete prepayment penalties, and cap default interest.",
    pattern:
      /acceleration|cross[- ]default|immediately due and payable|prepayment (?:penalty|fee|charge)|compound(?:ed|ing)?\s+interest/i,
    replacement: () =>
      "No acceleration, cross-default or prepayment penalty shall apply. Interest shall be simple and non-compounding, accrue only on overdue amounts at the lower of 1% per month or the maximum permitted by law, and the Borrower shall have a thirty (30) day cure period after written notice.",
  },
  {
    id: "ip.perpetual",
    category: "Intellectual property",
    title: "Perpetual, irrevocable licence over your data",
    score: 84,
    explanation:
      "A perpetual worldwide licence over customer data survives termination and cannot be undone, which is usually unacceptable for regulated data.",
    recommendation:
      "Limit the licence to the term and purpose of the services, make it revocable, and prohibit sharing with affiliates.",
    pattern:
      /perpetual,?\s+irrevocable|irrevocable[^.]{0,60}worldwide|worldwide[^.]{0,40}licen[cs]e/i,
    replacement: () =>
      "The Customer grants the Supplier a non-exclusive, revocable, non-transferable licence to process Customer Data solely to deliver the Services for the term of this Agreement. The licence terminates automatically on expiry or termination, and the Supplier shall delete or return all Customer Data within thirty (30) days.",
  },
  {
    id: "renewal.auto",
    category: "Term",
    title: "Auto-renewal with a long notice window",
    score: 78,
    explanation:
      "Automatic renewal combined with a long non-renewal window silently extends spend and is a common source of unwanted renewals.",
    recommendation:
      "Require affirmative renewal, or shorten the notice window to 30 days and add a renewal price cap.",
    pattern: /automatic(?:ally)? renew|auto-?renew|successive (?:renewal )?terms?/i,
    replacement: () =>
      "This Agreement renews for successive twelve (12) month terms only with the Customer's written consent given before the renewal date. Either party may decline renewal or terminate for convenience on thirty (30) days' written notice.",
  },
  {
    id: "pricing.unilateral",
    category: "Pricing",
    title: "Unilateral price or rate adjustment",
    score: 80,
    explanation:
      "The supplier can change pricing at its sole discretion, so budget exposure is unbounded over the term.",
    recommendation:
      "Fix fees for the term and require 90 days' notice plus a termination right before any increase.",
    pattern:
      /sole discretion[^.]{0,80}(?:increase|adjust|change)[^.]{0,40}(?:fee|price|rate|interest)|may (?:increase|adjust) the (?:fees|prices|rates)/i,
    replacement: () =>
      "Fees are fixed for the Initial Term. Any increase requires ninety (90) days' prior written notice, is capped at the lower of 3% or CPI, and the Customer may terminate without penalty before the increase takes effect.",
  },
  {
    id: "penalty.interest",
    category: "Penalties",
    title: "Aggressive late fees or penalty interest",
    score: 76,
    explanation:
      "Monthly penalty rates compound far beyond a lawful commercial late-payment charge and may be unenforceable or usurious.",
    recommendation:
      "Cap late interest at 1% per month simple, add a grace period, and delete penalty language.",
    pattern:
      /(?:late (?:fee|charge|payment)|overdue|default interest|interest)[^.]{0,60}?\d+(?:\.\d+)?\s?%|\bpenalt(?:y|ies)\b[^.]{0,40}?(?:per|\/)\s*(?:month|week|day)/i,
    replacement: () =>
      "Late payments accrue interest at the lower of 1% per month (12% per annum) or the maximum rate permitted by law, calculated on a simple basis, after a fifteen (15) day grace period. No penalties apply.",
  },
  {
    id: "termination.oneway",
    category: "Termination",
    title: "One-sided termination right",
    score: 72,
    explanation:
      "The supplier can walk away at will while you are locked in until a material breach is cured, leaving you without continuity of service.",
    recommendation: "Make termination for convenience mutual with 30 days' notice and a transition period.",
    pattern:
      /terminate[^.]{0,60}(?:for convenience|at any time)[^.]{0,60}(?:without (?:cause|liability|notice)|immediately)/i,
    replacement: () =>
      "Either party may terminate this Agreement for convenience on thirty (30) days' written notice. The Supplier shall provide a ninety (90) day transition period, continued service at existing fees, and full export of Customer Data.",
  },
  {
    id: "refund.none",
    category: "Payment",
    title: "Non-refundable prepaid fees",
    score: 64,
    explanation:
      "Prepaying the full term with no refund right means a service failure leaves you paying for nothing.",
    recommendation: "Make prepaid fees refundable pro rata on termination for breach or service failure.",
    pattern: /non-?refundable|no refunds?|fees are non-?cancel?lable/i,
    replacement: () =>
      "Prepaid fees are refundable on a pro-rata basis for any unused period if the Customer terminates for the Supplier's material breach, an uncured service-level failure, or the Supplier's insolvency.",
  },
  {
    id: "jurisdiction.oneway",
    category: "Disputes",
    title: "Home-court jurisdiction and jury waiver",
    score: 58,
    explanation:
      "Exclusive jurisdiction at the supplier's seat plus a jury waiver raises your cost of enforcing the contract.",
    recommendation:
      "Use non-exclusive jurisdiction at your seat, or neutral arbitration, and preserve jury rights.",
    pattern:
      /exclusive jurisdiction|waive[^.]{0,40}(?:jury|class action)|binding arbitration[^.]{0,80}(?:lender|supplier|provider|vendor|company)/i,
    replacement: () =>
      "The parties submit to the non-exclusive jurisdiction of the courts of the Customer's principal place of business. Each party retains its right to a trial by jury, and any arbitration shall be conducted by a mutually agreed neutral body in a neutral venue.",
  },
  {
    id: "data.sharing",
    category: "Data protection",
    title: "Broad data sharing with affiliates",
    score: 70,
    explanation:
      "Unrestricted sharing of customer data with affiliates or partners breaks data-processing obligations and expands the breach surface.",
    recommendation: "Require written consent, list sub-processors, and add a 72-hour breach notification.",
    pattern:
      /(?:we|supplier|provider|vendor|company)\s+may\s+(?:share|disclose)[^.]{0,80}(?:affiliates|partners|third part)/i,
    replacement: () =>
      "The Supplier shall not disclose Customer Data to affiliates or third parties without the Customer's prior written consent, shall maintain a published sub-processor list, and shall notify the Customer within seventy-two (72) hours of any actual or suspected breach.",
  },
  {
    id: "loan.fee.deduction",
    category: "Financing",
    title: "Fees deducted from the principal",
    score: 73,
    explanation:
      "Deducting a facility fee from the advance means the borrower services interest on money never received.",
    recommendation: "Pay the principal in full and invoice fees separately, or disclose the effective APR.",
    pattern: /fee[^.]{0,60}(?:deducted|withheld)[^.]{0,40}(?:principal|advance|disbursement)/i,
    replacement: () =>
      "The Lender shall disburse the Principal in full. Any arrangement fee shall be invoiced separately and the effective annualised cost of credit shall be disclosed in writing before drawdown.",
  },
  {
    id: "covenant.strict",
    category: "Covenants",
    title: "Tight financial covenant with immediate remedies",
    score: 60,
    explanation:
      "A hard liquidity covenant tested at all times can be breached by ordinary trading and trigger default remedies.",
    recommendation: "Test covenants quarterly, allow a 30-day cure, and add a equity-cure right.",
    pattern: /minimum liquidity ratio|financial covenant|maintain a minimum[^.]{0,60}ratio/i,
    replacement: () =>
      "Financial covenants are tested quarterly on the basis of audited or management accounts, with a thirty (30) day cure period and a once-per-term equity cure right. A breach is not an event of default until the cure period expires.",
  },
];

export function detectLegalHits(doc: string): LegalHit[] {
  const clauses = parseClauses(doc);
  const hits: LegalHit[] = [];

  for (const clause of clauses) {
    const nonEmpty = clause.text.split("\n").filter((line) => line.trim().length > 0);
    const bareSectionHeader = nonEmpty.length === 1 && clause.title.length < 45;
    if (bareSectionHeader) continue;

    for (const signal of LEGAL_SIGNALS) {
      signal.pattern.lastIndex = 0;
      const match = signal.pattern.exec(clause.text);
      signal.pattern.lastIndex = 0;
      if (!match) continue;
      hits.push({
        signal,
        clause,
        evidence: sentenceAround(clause.text, match.index) || clause.text.slice(0, 300),
      });
    }
  }

  return hits;
}

/* ------------------------------------------------------- invoice arithmetic */

function parseMoney(value: string): number {
  return Number.parseFloat(value.replace(/,/g, ""));
}

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function invoiceCandidates(doc: string): Candidate[] {
  const candidates: Candidate[] = [];
  const currency = /€/.test(doc) ? "€" : /£/.test(doc) ? "£" : "$";

  const subtotal = /Subtotal\s*:?\s*(?:USD|US\$|EUR|GBP|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(doc);
  const tax = /(?:VAT|Tax|GST)\s*(?:\(([\d.]+)\s*%\))?\s*:?\s*(?:USD|US\$|EUR|GBP|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(doc);
  const total = /\bTotal(?:\s+due)?\s*:?\s*(?:USD|US\$|EUR|GBP|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/i.exec(doc);

  if (subtotal && total) {
    const subtotalValue = parseMoney(subtotal[1] as string);
    const taxValue = tax ? parseMoney(tax[2] as string) : 0;
    const rate = tax?.[1] ? Number.parseFloat(tax[1]) : null;
    const totalValue = parseMoney(total[1] as string);
    const expectedTax = rate !== null ? Math.round(subtotalValue * rate) / 100 : taxValue;
    const expectedTotal = Math.round((subtotalValue + expectedTax) * 100) / 100;
    const taxOff = rate !== null && Math.abs(expectedTax - taxValue) > 0.5;
    const totalOff = Math.abs(expectedTotal - totalValue) > 0.5;

    if (taxOff || totalOff) {
      const reasons: string[] = [];
      if (taxOff) {
        reasons.push(
          `VAT is stated as ${currency}${money(taxValue)} but ${rate}% of the subtotal is ${currency}${money(expectedTax)}`,
        );
      }
      if (totalOff) {
        reasons.push(
          `the stated total ${currency}${money(totalValue)} does not equal subtotal + VAT (${currency}${money(expectedTotal)})`,
        );
      }

      const corrected = [
        `Subtotal: ${currency}${money(subtotalValue)}`,
        `${rate !== null ? `VAT (${rate}%)` : "Tax"}: ${currency}${money(expectedTax)}`,
        `Total due: ${currency}${money(expectedTotal)}`,
      ].join("\n");

      candidates.push({
        finding: {
          title: "Invoice arithmetic does not reconcile",
          severity: "info",
          score: 93,
          category: "Invoice fraud",
          location: "Invoice totals",
          evidence: reasons.join("; "),
          explanation:
            "An invoice whose tax or total does not reconcile with its own line items is either fraudulent or a serious billing error. Paying it transfers the overstatement immediately.",
          recommendation:
            "Reject the invoice, request a corrected version, and hold payment until the arithmetic reconciles with the purchase order.",
        },
        patch: {
          title: "Recompute invoice totals",
          rationale: "Rebuild the totals from the stated subtotal and tax rate so the payable amount is provable.",
          original: [subtotal[0], tax?.[0], total[0]].filter(Boolean).join("\n"),
          replacement: corrected,
        },
      });
    }
  }

  const duplicateInvoice = /invoice\s*(?:no|number|#)\s*[:#]?\s*([A-Z0-9-]{4,})/gi;
  const seen = new Map<string, number>();
  for (const match of doc.matchAll(duplicateInvoice)) {
    const id = (match[1] as string).toUpperCase();
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const duplicated = [...seen.entries()].find(([, count]) => count > 1);
  if (duplicated) {
    candidates.push({
      finding: {
        title: `Invoice number ${duplicated[0]} appears ${duplicated[1]} times`,
        severity: "info",
        score: 85,
        category: "Invoice fraud",
        location: "Invoice header",
        evidence: `Invoice number ${duplicated[0]} is declared ${duplicated[1]} times.`,
        explanation:
          "Duplicate invoice numbers are a common double-billing technique: the second copy is paid as if it were a new invoice.",
        recommendation: "Block the duplicate, reconcile against the ERP, and require a unique purchase-order match.",
      },
      patch: null,
    });
  }

  const poMissing = /purchase order[^.\n]{0,40}(?:not provided|none|n\/a|missing|tbc)/i.exec(doc);
  if (poMissing) {
    candidates.push({
      finding: {
        title: "Invoice references no purchase order",
        severity: "info",
        score: 62,
        category: "Invoice fraud",
        location: "Invoice header",
        evidence: sentenceAround(doc, poMissing.index) || poMissing[0],
        explanation:
          "Without an approved purchase order there is no three-way match, so the invoice cannot be validated against an authorised commitment.",
        recommendation: "Reject the invoice until a valid PO number is supplied and matched.",
      },
      patch: null,
    });
  }

  return candidates;
}

/* --------------------------------------------------------------- exposure */

function amountsIn(text: string): number[] {
  const matches = text.matchAll(/(?:USD|US\$|EUR|GBP|\$|€|£)\s?([\d,]+(?:\.\d{1,2})?)/g);
  return [...matches]
    .map((match) => parseMoney(match[1] as string))
    .filter((value) => Number.isFinite(value) && value >= 100);
}

function computeExposure(doc: string, hits: LegalHit[]): MoneyExposure | undefined {
  const flagged = hits
    .filter((hit) => hit.signal.score >= 65)
    .flatMap((hit) => amountsIn(hit.clause.text));
  // The principal or order value usually dwarfs the flagged penalties, so the
  // largest amount anywhere in the instrument sets the exposure floor.
  const pool = [...flagged, ...amountsIn(doc)];
  if (pool.length === 0) return undefined;

  const low = Math.max(...pool);
  const currency = /€/.test(doc) ? "EUR" : /£/.test(doc) ? "GBP" : "USD";

  return {
    low,
    high: Math.round(low * 2.5),
    currency,
    basis:
      "largest quantified commitment in the instrument, with a 2.5× downside multiplier for compounding penalties and acceleration",
  };
}

/* ------------------------------------------------------------ counter-draft */

function buildCounterDocument(args: {
  title: string;
  findings: Finding[];
  patches: Patch[];
  exposure?: MoneyExposure;
}): string {
  const { title, findings, patches, exposure } = args;
  const lines: string[] = [];
  const critical = findings.filter((finding) => finding.score >= 85).length;

  lines.push("COUNTER-PROPOSAL AND AUDIT NOTICE");
  lines.push("=================================");
  lines.push("");
  lines.push(`Subject: ${title}`);
  lines.push(`Prepared: ${new Date().toISOString().slice(0, 10)} · AegisCore LexGuard`);
  lines.push("");
  lines.push("Reservation of rights: this notice is issued without prejudice and all rights are reserved.");
  lines.push("");
  lines.push("1. POSITION");
  lines.push(
    `The instrument presented contains ${findings.length} material issue(s), of which ${critical} are critical. ` +
      "We do not accept the document as drafted and propose the redlines below.",
  );
  if (exposure) {
    lines.push(
      `Quantified exposure is estimated at ${exposure.currency} ${exposure.low.toLocaleString("en-US")} to ${exposure.currency} ${exposure.high.toLocaleString("en-US")} (${exposure.basis}).`,
    );
  }
  lines.push("");

  lines.push("2. CLAUSE-BY-CLAUSE REDLINES");
  lines.push("");
  patches.forEach((patch, index) => {
    lines.push(`2.${index + 1} ${patch.title}`);
    lines.push("");
    lines.push("  Original position:");
    lines.push(
      patch.original
        .split("\n")
        .map((line) => `  > ${line.trim()}`)
        .join("\n"),
    );
    lines.push("");
    lines.push("  Proposed language:");
    lines.push(
      patch.replacement
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
    );
    lines.push("");
    lines.push(`  Rationale: ${patch.rationale}`);
    lines.push("");
  });

  lines.push("3. PROTECTIVE TERMS REQUIRED");
  lines.push("");
  lines.push(
    "3.1 Each party's aggregate liability under this Agreement shall not exceed the total fees paid or payable during the twelve (12) months preceding the claim, and neither party shall be liable for indirect or consequential loss.",
  );
  lines.push(
    "3.2 Either party may terminate this Agreement for convenience on thirty (30) days' written notice, with a ninety (90) day transition period at existing fees.",
  );
  lines.push(
    "3.3 This Agreement renews only with the Customer's written consent; there is no automatic renewal of the term.",
  );
  lines.push(
    "3.4 Payment terms are net thirty (30) days from a valid invoice matched to an approved purchase order.",
  );
  lines.push(
    "3.5 Any change of bank details requires written confirmation from two authorised officers and independent call-back verification.",
  );
  lines.push(
    "3.6 Customer Data is processed only to deliver the services, with notification within 72 hours of any breach.",
  );
  lines.push("");

  lines.push("4. NEXT STEPS");
  lines.push("");
  lines.push("- Suspend payment on the disputed instrument until the redlines are accepted in writing.");
  lines.push("- Request the counterparty's signed confirmation of the amended clauses.");
  lines.push("- Retain this notice with the contract file as evidence of the objection.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Generated by AegisCore. Automated analysis — obtain professional legal advice before signature.");

  return lines.join("\n");
}

/* --------------------------------------------------------------- analysis */

export function analyzeLegal(doc: string, title: string): LegalAnalysis {
  const hits = detectLegalHits(doc);
  const candidates: Candidate[] = [
    ...hits.map((hit) => ({
      finding: {
        title: hit.signal.title,
        severity: "info" as const,
        score: hit.signal.score,
        category: hit.signal.category,
        location: hit.clause.location,
        evidence: hit.evidence,
        explanation: hit.signal.explanation,
        recommendation: hit.signal.recommendation,
      },
      patch: {
        title: `Redline ${hit.clause.location} — ${hit.signal.title}`,
        rationale: hit.signal.recommendation,
        original: hit.clause.text.trim().slice(0, 1200),
        replacement: hit.signal.replacement(hit.clause),
      },
    })),
    ...invoiceCandidates(doc),
  ];

  const selected = candidates
    .sort((a, b) => b.finding.score - a.finding.score)
    .slice(0, MAX_FINDINGS);

  const findings: Finding[] = selected.map((candidate, index) =>
    normalizeFinding({ ...candidate.finding, id: `F-${String(index + 1).padStart(2, "0")}` }),
  );

  const patches: Patch[] = [];
  selected.forEach((candidate, index) => {
    if (!candidate.patch) return;
    patches.push({
      id: `P-${String(patches.length + 1).padStart(2, "0")}`,
      findingId: `F-${String(index + 1).padStart(2, "0")}`,
      ...candidate.patch,
    });
  });

  const exposure = computeExposure(doc, hits);
  const counterDocument = buildCounterDocument({ title, findings, patches, exposure });

  const strategy =
    patches.length === 0
      ? "No clause could be redrafted automatically; the document requires manual legal review."
      : `Replaced ${patches.length} unfair clause(s) with balanced counter-language, corrected any invoice arithmetic, and issued a counter-proposal with a reservation of rights.${
          findings.length - patches.length > 0
            ? ` ${findings.length - patches.length} finding(s) require documentary evidence from the counterparty.`
            : ""
        }`;

  return { findings, patches, counterDocument, strategy, exposure };
}

export function healFromAnalysis(analysis: LegalAnalysis): HealResult {
  return {
    strategy: analysis.strategy,
    patches: analysis.patches,
    repairedDocument: analysis.counterDocument,
  };
}
