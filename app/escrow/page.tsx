import { redirect } from "next/navigation";

export const metadata = { title: "Trade escrow" };

/** The trade escrow is the Amanah-style page in /public/escrow. */
export default function EscrowPage() {
  redirect("/escrow/index.html#seller");
}
