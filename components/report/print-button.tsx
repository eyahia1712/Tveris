"use client";

import { Icon } from "@/components/icons";
import { BUTTON_SECONDARY } from "@/components/ui/bits";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={BUTTON_SECONDARY}>
      <Icon name="Export" size={14} />
      Print / PDF
    </button>
  );
}
