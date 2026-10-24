import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { EmailResult, Run } from "@/lib/domain/types";
import { toSubmission } from "@/lib/domain/submission";
import { classifyByRules, latestMessage } from "@/lib/pipeline/classify-rules";
import { compareField, decideCheck } from "@/lib/pipeline/compare";
import { claimedRoleFromName, detectKind } from "@/lib/pipeline/doctype";
import { extractFields, fieldForLabel, makeValue, splitLabelled } from "@/lib/pipeline/fields";
import {
  isPlaceholder,
  normalizePort,
  parseContainerCount,
  parseWeightKg,
  samePort,
} from "@/lib/pipeline/normalize";
import { processInbox } from "@/lib/pipeline/pipeline";
import { BundleSource, parseEmailRecord } from "@/lib/sources";

const email = (body: string, extra: Partial<Parameters<typeof classifyByRules>[0]> = {}) => ({
  email_id: "email_x",
  from: "ops@example.com",
  subject: "RE_ TO CONFIRM DOCS",
  body,
  attachments: [],
  ...extra,
});

describe("normalize", () => {
  it("treats blanks and placeholders as missing, never as values", () => {
    for (const blank of ["", "  ", "N/A", "TBA", "____MT", "_______ MTS", "??? MTS", "--"]) {
      expect(isPlaceholder(blank), blank).toBe(true);
    }
    for (const value of ["NANTONG, CHINA", "6 x 40'HC", "131,058 KG", "UAB NOVAKOPA"]) {
      expect(isPlaceholder(value), value).toBe(false);
    }
  });

  it("reads weights in any common format as kilograms", () => {
    expect(parseWeightKg("131,058 KG")).toBe(131058);
    expect(parseWeightKg("131058")).toBe(131058);
    expect(parseWeightKg("131.058 KG")).toBe(131058);
    expect(parseWeightKg("131.058 MT")).toBe(131058);
    expect(parseWeightKg("22,000.50 KGS")).toBe(22000.5);
    expect(parseWeightKg("22.000,50 kg")).toBe(22000.5);
  });

  it("counts containers across notations", () => {
    expect(parseContainerCount("6 x 40'HC")).toBe(6);
    expect(parseContainerCount("3 x 20'GP + 2 x 40'HC")).toBe(5);
    expect(parseContainerCount("SIX (6) CONTAINERS")).toBe(6);
    expect(parseContainerCount("12x20'FCL")).toBe(12);
  });

  it("compares ports by name: codes and repeated city-states are formatting", () => {
    expect(normalizePort("NANTONG, CHINA (CNNTG)")).toBe("NANTONG, CHINA");
    expect(samePort("SINGAPORE (SGSIN)", "SINGAPORE, SINGAPORE")).toBe(true);
    expect(samePort("NHAVA SHEVA, INDIA", "NHAVA SHEVA, INDIA (INNSA)")).toBe(true);
    expect(samePort("PORT KLANG (WESTPORT), MALAYSIA", "PORT KLANG (WESTPORT), MALAYSIA (MYPKG)")).toBe(true);
    // A wrong port keeps the SI's code in this data: the name must decide.
    expect(samePort("MOMBASA, KENYA (KEMBA)", "TUTICORIN, INDIA (KEMBA)")).toBe(false);
  });
});

describe("labels", () => {
  it("aligns different labels by meaning", () => {
    const cases: Array<[string, string]> = [
      ["Port of Loading (POL)", "port_of_loading"],
      ["Load Port", "port_of_loading"],
      ["PORT OF LOADING (装货港)", "port_of_loading"],
      ["POD", "port_of_discharge"],
      ["Discharge Port", "port_of_discharge"],
      ["To the Order of", "consignee"],
      ["Consignee (Non-Negotiable)", "consignee"],
      ["Notify Party/Intermediate Consignee", "notify_party"],
      ["Shipper (Principal or Seller)", "shipper"],
      ["No. of Containers or Packages", "container_count"],
      ["Total Containers", "container_count"],
      ["Gross Weight毛重(KGS)", "gross_weight_kg"],
      ["Gross Wt (kgs)", "gross_weight_kg"],
      ["TOTAL Gross Weightnn(KGS)", "gross_weight_kg"],
    ];
    for (const [label, field] of cases) expect(fieldForLabel(label), label).toBe(field);
    expect(fieldForLabel("NET WEIGHT")).toBeNull();
    expect(fieldForLabel("Export Carrier (vessel, voyage)")).toBeNull();
  });

  it("splits colon-less PDF lines, including glued labels", () => {
    expect(splitLabelled("Load Port BUATAN, INDONESIA")?.value).toBe("BUATAN, INDONESIA");
    expect(splitLabelled("Notify Party/Intermediate ConsigneeCERIEX")).toMatchObject({
      label: "Notify Party/Intermediate Consignee",
      value: "CERIEX",
    });
    expect(splitLabelled("CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)")).toBeNull();
    expect(splitLabelled("POLAND IS NOT A LABEL")).toBeNull();
  });

  it("keeps a labelled blank blank instead of borrowing the next line", () => {
    const fields = extractFields(["SHIPPER: ", "CONSIGNEE: UAB NOVAKOPA"]);
    expect(fields.shipper?.missing).toBe(true);
    expect(fields.consignee?.raw).toBe("UAB NOVAKOPA");
  });

  it("prefers a TOTAL line over a per-row value", () => {
    const fields = extractFields([
      "Gross Weight: 21,887 KG",
      "TOTAL Gross Weight (KG): 131,322 KG",
    ]);
    expect(fields.gross_weight_kg?.normalized).toBe(131322);
  });
});

describe("document kind", () => {
  it("decides by content, not filename", () => {
    expect(detectKind(["COMMERCIAL INVOICE", "Invoice No.: 1"]).kind).toBe("COMMERCIAL_INVOICE");
    expect(detectKind(["BILL OF LADING INSTRUCTION"]).kind).toBe("SI");
    expect(detectKind(["BILL OF LADING (DRAFT)"]).kind).toBe("BL");
    expect(detectKind(["ACME PTE LTD", "", "BL INSTRUCTION: 3154303911"]).kind).toBe("SI");
    expect(claimedRoleFromName("email_501_BL.txt")).toBe("BL");
  });
});

describe("compare", () => {
  it("flags only the differing field and shows both values", () => {
    const si = makeValue("container_count", "3 x 20'GP", "Containers", "Containers: 3 x 20'GP");
    const bl = makeValue("container_count", "4 x 20'GP", "Containers", "Containers: 4 x 20'GP");
    const result = compareField("container_count", si, bl);
    expect(result.outcome).toBe("mismatch");
    expect(result.note).toBe("SI: 3 x 20'GP / BL: 4 x 20'GP");
    const weightA = makeValue("gross_weight_kg", "22,000 KG", null, null);
    const weightB = makeValue("gross_weight_kg", "22000", null, null);
    expect(compareField("gross_weight_kg", weightA, weightB).outcome).toBe("match");
  });

  it("escalates a check without attachments instead of guessing", () => {
    const check = decideCheck([], 0);
    expect(check.status).toBe("NEEDS_REVIEW");
    expect(check.reviewReason).toBe("missing_attachment");
  });
});

describe("classification rules", () => {
  it("reads the body, not a misleading subject", () => {
    const followUp = email("Dear Hari,\n\nPlease assist to send the draft BL for SIN832764835 for checking asap.");
    expect(classifyByRules(followUp).category).toBe("GENERAL");
    const check = email("Please compare the SI and draft BL for I756178688 and confirm (the draft BL is still missing).");
    expect(classifyByRules(check).category).toBe("BL_COMPARISON");
  });

  it("separates SI requests, invoices, notices and spam", () => {
    expect(classifyByRules(email("Hi Lee\n\nPlease find Shipping instruction for 5RUS-08632.\n\nPOL: NANTONG\nPOD: KARACHI\nShipper:\nACME")).category).toBe("SI_REQUEST");
    expect(classifyByRules(email("Query on invoice 5250075931: is the THC / local charge included?")).category).toBe("INVOICE_QUERY");
    expect(classifyByRules(email("This is an automated notification. The India HSS SD Billing Process for NAP 914 has completed successfully. No action required.")).category).toBe("GENERAL");
    expect(classifyByRules(email("Dear user, your mailbox has exceeded its storage limit. Verify your account within 24 hours: http://webmail-verify.co")).category).toBe("SPAM");
    expect(classifyByRules(email("Hello Dear, I am a bank officer with an urgent business proposal involving USD 4.5 million. Please reply with your bank details to proceed.")).category).toBe("SPAM");
  });

  it("ignores quoted history", () => {
    expect(latestMessage("New text\n\n______________________________\nFrom: A <a@b.c>\nold")).toBe("New text\n");
  });
});

describe("source records", () => {
  it("rejects malformed records at the boundary", () => {
    expect(() => parseEmailRecord({ email_id: "x" })).toThrow();
    expect(() => parseEmailRecord({ email_id: "x", from: "a", subject: "s", body: "b", attachments: [1] })).toThrow();
  });

  it("refuses attachment paths that escape the bundle", async () => {
    const source = new BundleSource(path.join(process.cwd(), "data", "sample"));
    await expect(source.readAttachment("../../package.json")).rejects.toThrow(/escapes/);
  });
});

describe("the sample inbox end to end (rule engine, no AI)", () => {
  let run: Run;
  const byId = (id: string): EmailResult => {
    const found = run.results.find((result) => result.email.email_id === id);
    if (found === undefined) throw new Error(`missing ${id}`);
    return found;
  };

  beforeAll(async () => {
    const source = new BundleSource(path.join(process.cwd(), "data", "sample"));
    run = await processInbox(source, { ai: { enabled: false, model: "none" } });
  });

  it("produces one row per email with no crashes", () => {
    expect(run.results).toHaveLength(520);
    expect(run.summary.failures).toBe(0);
    expect(Object.keys(toSubmission(run.results))).toHaveLength(520);
  });

  it("catches the consignee and notify-party change in email_004", () => {
    const result = byId("email_004");
    expect(result.status).toBe("MISMATCH");
    expect(result.defectFields).toEqual(["consignee", "notify_party"]);
  });

  it("reads Excel, Word and PDF attachments", () => {
    expect(byId("email_097").defectFields).toEqual(["container_count", "gross_weight_kg"]);
    expect(byId("email_243").defectFields).toEqual(["port_of_loading", "port_of_discharge"]);
    expect(byId("email_499").defectFields).toEqual(["gross_weight_kg"]);
    expect(byId("email_208").status).toBe("OK");
  });

  it("escalates every trap case with the right reason", () => {
    const expected: Record<string, string> = {
      email_501: "wrong_doc_type",
      email_502: "wrong_doc_type",
      email_503: "wrong_doc_type",
      email_506: "missing_attachment",
      email_507: "missing_attachment",
      email_511: "unreadable",
      email_515: "unreadable",
      email_516: "missing_value",
      email_517: "missing_value",
      email_519: "missing_value",
      email_520: "missing_value",
    };
    for (const [id, reason] of Object.entries(expected)) {
      const result = byId(id);
      expect(result.status, id).toBe("NEEDS_REVIEW");
      expect(result.reviewReason, id).toBe(reason);
    }
  });

  it("never reports a formatting-only difference as a mismatch", () => {
    for (const result of run.results) {
      for (const field of result.check?.fields ?? []) {
        if (field.outcome !== "mismatch") continue;
        expect(field.si?.normalized, `${result.email.email_id} ${field.field}`).not.toEqual(field.bl?.normalized);
      }
    }
  });
});

describe("human review", () => {
  it("recomputes the report from a reviewer's values", async () => {
    const { applyReview } = await import("@/lib/pipeline/review");
    const source = new BundleSource(path.join(process.cwd(), "data", "sample"));
    const run = await processInbox(source, {
      ai: { enabled: false, model: "none" },
      emails: (await source.listEmails()).filter((email) => ["email_516", "email_511", "email_004"].includes(email.email_id)),
    });
    const blank = run.results.find((result) => result.email.email_id === "email_516")!;
    expect(blank.reviewReason).toBe("missing_value");

    // The customer confirms the SI gross weight: the check completes.
    const fixed = applyReview(
      blank,
      { reviewer: "Tester", at: "2026-09-19T00:00:00Z", decision: "corrected", categoryOverride: null, corrections: { gross_weight_kg: { si: "235,550 KG" } }, note: "" },
      0,
    );
    expect(fixed.status).toBe("OK");
    expect(fixed.check?.fields.find((field) => field.field === "gross_weight_kg")?.si?.source).toBe("human");

    // A reviewer types the unreadable BL's values; one differs, and is caught.
    const unreadable = run.results.find((result) => result.email.email_id === "email_511")!;
    const siFields = unreadable.check!.documents.find((doc) => doc.kind === "SI")!.fields;
    const typed = Object.fromEntries(
      Object.entries(siFields).map(([field, value]) => [field, { bl: field === "container_count" ? "9 x 40'HC" : value!.raw ?? "" }]),
    );
    const reviewed = applyReview(
      unreadable,
      { reviewer: "Tester", at: "2026-09-19T00:00:00Z", decision: "corrected", categoryOverride: null, corrections: typed, note: "Typed from the paper BL" },
      0,
    );
    expect(reviewed.status).toBe("MISMATCH");
    expect(reviewed.defectFields).toEqual(["container_count"]);

    // Confirming an escalation keeps the status but clears it from the urgent list.
    const confirmed = applyReview(
      unreadable,
      { reviewer: "Tester", at: "2026-09-19T00:00:00Z", decision: "confirmed", categoryOverride: null, corrections: {}, note: "Asked for a clean copy" },
      0,
    );
    expect(confirmed.status).toBe("NEEDS_REVIEW");
    expect(confirmed.triage.priority).toBe("low");
  });
});

describe("draft replies", () => {
  it("quotes the verified values for a mismatch", async () => {
    const { draftReply } = await import("@/lib/domain/reply");
    const source = new BundleSource(path.join(process.cwd(), "data", "sample"));
    const run = await processInbox(source, {
      ai: { enabled: false, model: "none" },
      emails: (await source.listEmails()).filter((email) => email.email_id === "email_004"),
    });
    const reply = draftReply(run.results[0]!);
    expect(reply).toContain('Consignee: BL shows "UAB NOVAKOPA", SI states "EAST BRIGHT FZ-LLC"');
  });
});
