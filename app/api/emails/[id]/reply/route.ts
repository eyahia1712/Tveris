import { draftReply } from "@/lib/domain/reply";
import { sendReply } from "@/lib/gmail";
import { currentGmailSession, gmailRedirectUri, parseSourceParam, resolveSource } from "@/lib/server/context";
import { BadRequestError, errorResponse } from "@/lib/server/http";
import { getStore, sourceKey } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Send the drafted reply from the connected mailbox. Nothing here runs on its
 * own: the reviewer opens the email, reads the draft and confirms the
 * recipient first. Without a connected Gmail the reply is handed back so the
 * browser can open it in the reviewer's own mail client instead.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    if (!/^[A-Za-z0-9_\-]{1,120}$/.test(id)) throw new BadRequestError("Invalid email id.");
    const param = parseSourceParam(new URL(request.url).searchParams.get("source"));
    const source = await resolveSource(param);
    if (source === null) return Response.json({ error: "Connect Gmail first." }, { status: 401 });

    const run = await getStore().latestRun(sourceKey(source.descriptor));
    const result = run?.results.find((item) => item.email.email_id === id);
    if (result === undefined) return Response.json({ error: "No such email in this inbox." }, { status: 404 });

    const body = draftReply(result);
    if (body === null) return Response.json({ error: "There is no draft reply for this email." }, { status: 400 });
    const to = result.email.from;
    const subject = /^re:/i.test(result.email.subject) ? result.email.subject : `RE: ${result.email.subject}`;

    const session = await currentGmailSession();
    // The sample inbox carries other companies' addresses: those replies are
    // never delivered from here, they are handed to the reviewer to send.
    if (session === null || param !== "gmail") {
      return Response.json(
        {
          sent: false,
          reason: session === null ? "no-gmail" : "sample-inbox",
          message:
            session === null
              ? "Connect Gmail to send from Tveris."
              : "This is the sample inbox, so Tveris will not deliver to these addresses.",
          to,
          subject,
          body,
        },
        { status: 409 },
      );
    }

    const messageId = await sendReply(session, await gmailRedirectUri(), { to, subject, body });
    return Response.json({ sent: true, to, subject, messageId });
  } catch (error) {
    return errorResponse(error);
  }
}
