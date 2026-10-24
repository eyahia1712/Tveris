import type { Category, EmailRecord } from "@/lib/domain/types";

/**
 * The rule engine: a transparent, deterministic classifier. It runs on every
 * email, with or without AI. When the AI is on, the two answers are
 * cross-checked and any disagreement goes to the review queue.
 *
 * It reads the BODY first. Subjects in a shipping inbox are thread titles that
 * outlive the conversation ("RE_ TO CONFIRM DOCS" on a message that only asks
 * for a document), so a subject alone never decides the category.
 */

export interface RulesVerdict {
  category: Category;
  confidence: number;
  signals: string[];
  intent: string;
}

/** The newest message only: quoted history below a separator is ignored. */
export function latestMessage(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const cut = lines.findIndex(
    (line) =>
      /^_{5,}\s*$/.test(line.trim())
      || /^-{2,}\s*original message/i.test(line.trim())
      || /^from:\s.+(<|@)/i.test(line.trim())
      || /^on .+ wrote:$/i.test(line.trim()),
  );
  const kept = cut > 0 ? lines.slice(0, cut) : lines;
  return kept.join("\n");
}

/** Remove the external-mail warning banner some gateways prepend. */
function stripBanner(text: string): string {
  return text.replace(/WARNING: This email originated outside[\s\S]*?attachments\.\s*/i, "");
}

const SPAM_STRONG: RegExp[] = [
  /\bcongratulations\b.*\b(selected|won|winner)\b/i,
  /\byou have won\b|\bclaim (your|the) (prize|reward|gift)/i,
  /\bgift card\b/i,
  /\b(bitcoin|crypto(currency)?)\b.*\b(invest|returns?|profit)/i,
  /\bguaranteed\b.*\breturns?\b/i,
  /\bverify your (account|mailbox|email)\b/i,
  /\b(mailbox|storage) (has )?(exceeded|is full)\b/i,
  /\bbank details\b.*\b(proceed|transfer)|\bbusiness proposal\b/i,
  /\bunpaid (customs )?fee\b.*\bconfirm payment\b/i,
  /\bhot singles\b|\bfree iphone\b|\bbrand new iphone\b/i,
  /\blimited time offer\b|\bbuy now\b|\b\d{2}% off\b/i,
];

const SPAM_WEAK: RegExp[] = [
  /https?:\/\/(bit\.ly|tinyurl|[a-z0-9-]*(claim|prize|verify|free|deal|offer)[a-z0-9-]*\.)/i,
  /\bclick here\b/i,
  /\bwithin 24 hours\b/i,
  /\bdear (user|valued customer|friend)\b/i,
  /\burgent\b.*\b(verify|suspend|deactivat)/i,
  /\bmillion\b/i,
  /\bsurvey\b/i,
];

const COMPARE_REQUEST: RegExp[] = [
  /\bcompare\b.*\b(SI|shipping instruction)\b.*\b(BL|bill of lading)\b/i,
  /\bcheck\b.*\bdraft (BL|B\/L|bill of lading)\b.*\bagainst\b/i,
  /\b(SI|shipping instruction) and (the )?draft (BL|B\/L|bill of lading)\b/i,
  /\battached\b.*\b(SI|shipping instruction)\b.*\b(BL|B\/L|bill of lading)\b/i,
  /\bconfirm (that )?the (draft )?(BL|B\/L) is in order\b/i,
  /\bdraft (BL|B\/L|bill of lading)\b.*\b(for (your )?(checking|confirmation|approval)|revert with any discrepanc)/i,
];

const ASKS_FOR_BL: RegExp =
  /\b(send|share|provide|forward|issue|release)\b.*\b(the )?draft (BL|B\/L|bill of lading)\b/i;

const SI_REQUEST: RegExp[] = [
  /\bplease find (the )?(shipping instructions?|SI)\b.*\bfor\b/i,
  /\b(new|customer'?s?|cust) (shipping instructions?|SI)\b/i,
  /\b(prepare|raise|submit|issue) (the |a |new )?(shipping instructions?|SI)\b.*\bfor\b/i,
];

const INVOICE: RegExp[] = [
  /\binvoice\b/i,
  /\b(billing|debit note|credit note|statement of account)\b/i,
  /\bTHC\b|\blocal charges?\b|\btelex release charges?\b/i,
  /\bD&D\b|\bdetention\b|\bdemurrage\b/i,
  /\bGR\b.*\b(missing|post)\b/i,
  /\b(freight|charges?)\b.*\b(amount|breakdown|payment|billed)\b/i,
  /\breverse the PGI\b/i,
];

/** Count inline SI data lines ("POL: X", "Shipper: Y") in a body. */
function inlineSiFields(text: string): number {
  const labels = [/^\s*POL\s*:/im, /^\s*POD\s*:/im, /^\s*shipper\s*:/im, /^\s*consignee\s*:/im, /^\s*notify/im];
  return labels.filter((pattern) => pattern.test(text)).length;
}

function firstSentence(text: string): string {
  const cleaned = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^(hi|hello|dear)\b/i.test(line))
    .join(" ");
  const sentence = cleaned.split(/(?<=[.!?])\s/)[0] ?? cleaned;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
}

export function classifyByRules(email: EmailRecord): RulesVerdict {
  const body = stripBanner(latestMessage(email.body));
  const text = `${email.subject}\n${body}`;
  const intent = firstSentence(body);
  const signals: string[] = [];

  const strongSpam = SPAM_STRONG.filter((pattern) => pattern.test(text)).length;
  const weakSpam = SPAM_WEAK.filter((pattern) => pattern.test(text)).length;
  if (strongSpam >= 1 && strongSpam + weakSpam >= 2) {
    signals.push(`${strongSpam + weakSpam} spam markers`);
    return { category: "SPAM", confidence: 0.97, signals, intent };
  }
  if (strongSpam >= 1 && email.attachments.length === 0) {
    signals.push("spam marker, no business content");
    return { category: "SPAM", confidence: 0.85, signals, intent };
  }

  const hasDocs = email.attachments.length > 0;
  const comparePhrase = COMPARE_REQUEST.some((pattern) => pattern.test(body));
  if (comparePhrase && !ASKS_FOR_BL.test(body)) {
    signals.push("asks for an SI vs draft BL check");
    if (hasDocs) signals.push(`${email.attachments.length} attachment(s)`);
    return { category: "BL_COMPARISON", confidence: hasDocs ? 0.97 : 0.85, signals, intent };
  }
  const docNames = email.attachments.join(" ");
  if (hasDocs && /_SI\b|_SI\.|shipping.?instruction/i.test(docNames) && /_BL\b|_BL\.|lading/i.test(docNames)) {
    signals.push("SI and BL attached");
    return { category: "BL_COMPARISON", confidence: 0.8, signals, intent };
  }

  if (ASKS_FOR_BL.test(body) && !hasDocs) {
    // Asking someone to SEND a draft BL is a follow-up, not a check request:
    // there is nothing to compare yet.
    signals.push("asks for a draft BL to be sent; nothing to compare yet");
    return { category: "GENERAL", confidence: 0.8, signals, intent };
  }

  // Robot notices and broadcast reminders are updates, whatever they mention
  // ("Billing Process Completed", "submit SI & AED for all pending shipments").
  if (/\bautomated notification\b|\bno action required\b/i.test(body)) {
    signals.push("automated notification, no action required");
    return { category: "GENERAL", confidence: 0.9, signals, intent };
  }
  if (/\breminder\b/i.test(body) && /\ball (pending|outstanding)\b/i.test(body)) {
    signals.push("broadcast reminder to the team");
    return { category: "GENERAL", confidence: 0.85, signals, intent };
  }

  const siHits = SI_REQUEST.filter((pattern) => pattern.test(body)).length;
  const inline = inlineSiFields(body);
  if (siHits > 0 || inline >= 3) {
    signals.push(siHits > 0 ? "shipping instruction for a new shipment" : "SI details inline");
    if (inline >= 3) signals.push(`${inline} SI fields in the body`);
    return { category: "SI_REQUEST", confidence: siHits > 0 && inline >= 3 ? 0.95 : 0.8, signals, intent };
  }

  const invoiceHits = INVOICE.filter((pattern) => pattern.test(body)).length;
  if (invoiceHits > 0) {
    signals.push(`${invoiceHits} billing marker(s)`);
    return { category: "INVOICE_QUERY", confidence: invoiceHits > 1 ? 0.95 : 0.85, signals, intent };
  }

  if (weakSpam >= 2) {
    signals.push(`${weakSpam} weak spam markers`);
    return { category: "SPAM", confidence: 0.7, signals, intent };
  }

  signals.push("operational update or notice");
  return { category: "GENERAL", confidence: 0.75, signals, intent };
}
