import { FIELD_LABELS, type EmailResult } from "@/lib/domain/types";
import { senderName } from "@/lib/utils";

/**
 * A ready-to-send reply for the email's outcome, built from the verified
 * comparison (never invented): the reviewer edits or copies it.
 */
export function draftReply(result: EmailResult): string | null {
  const name = senderName(result.email.from).split(/[\s@._]/)[0] || "team";
  const greeting = `Hi ${name.charAt(0).toUpperCase()}${name.slice(1)},`;
  const subject = result.email.subject.replace(/^(RE_|RE:|FW_|FW:)\s*/i, "");
  const check = result.check;

  if (result.classification.category === "BL_COMPARISON" && check !== null) {
    if (check.status === "MISMATCH") {
      const lines = check.fields
        .filter((field) => field.outcome === "mismatch")
        .map((field) => `- ${FIELD_LABELS[field.field]}: BL shows "${field.bl?.raw ?? ""}", SI states "${field.si?.raw ?? ""}".`);
      return [
        greeting,
        "",
        `We checked the draft BL against the shipping instruction for "${subject}". Please amend the following before the BL is finalised:`,
        "",
        ...lines,
        "",
        "All other fields match the SI. Kindly send the revised draft for our final check.",
        "",
        "Best regards,",
      ].join("\n");
    }
    if (check.status === "OK") {
      return [greeting, "", `We checked the draft BL against the SI for "${subject}". All seven fields match: no mismatch detected. Please proceed.`, "", "Best regards,"].join("\n");
    }
    const ask =
      check.reviewReason === "missing_attachment"
        ? "the shipping instruction and the draft BL did not come through (one or both attachments are missing)"
        : check.reviewReason === "wrong_doc_type"
          ? "one of the attachments is not the expected document"
          : check.reviewReason === "unreadable"
            ? "we could not open one of the attachments"
            : "some required values are blank in the documents";
    return [
      greeting,
      "",
      `Thanks for the documents for "${subject}". Before we can complete the check, ${ask}.`,
      check.reviewNote ? `Details: ${check.reviewNote}` : "",
      "",
      "Could you please resend the correct SI and draft BL?",
      "",
      "Best regards,",
    ]
      .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
      .join("\n");
  }
  if (result.classification.category === "SPAM") return null;
  return null;
}
