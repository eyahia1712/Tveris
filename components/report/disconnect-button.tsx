"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/icons";
import { BUTTON_SECONDARY } from "@/components/ui/bits";

export function DisconnectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/gmail/disconnect", { method: "POST" });
        router.push("/connect");
        router.refresh();
      }}
      className={BUTTON_SECONDARY}
    >
      <Icon name="Lock1" size={14} />
      {busy ? "Disconnecting" : "Disconnect"}
    </button>
  );
}
