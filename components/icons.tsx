"use client";

import * as Iconsax from "iconsax-react";
import type { ComponentProps } from "react";

/**
 * iconsax-react relied on defaultProps, which React 19 dropped, so its icons
 * lose their colour and size unless given explicitly. Every icon goes through
 * this wrapper: it inherits the text colour and a sensible default size.
 */
type IconName =
  | "DocumentText" | "Ship" | "ReceiptText" | "Notification" | "ShieldCross" | "DirectInbox"
  | "Hierarchy" | "RowVertical" | "Play" | "Pause" | "Refresh" | "SearchNormal1" | "ArrowLeft2"
  | "ArrowRight2" | "TickCircle" | "CloseCircle" | "Warning2" | "InfoCircle" | "DocumentDownload"
  | "Link21" | "Google" | "Edit2" | "Send2" | "Magicpen" | "Flash" | "Timer1" | "Maximize4"
  | "Add" | "Minus" | "Danger" | "Cpu" | "Clock" | "Filter" | "Eye" | "TaskSquare" | "Copy"
  | "Scan" | "Location" | "Weight" | "Box" | "Profile2User" | "Building" | "Radar" | "Category2"
  | "Element3" | "MessageText1" | "Lock1" | "Export" | "Setting2" | "Layer" | "Sms";

export function Icon({
  name,
  size = 16,
  variant = "Linear",
  ...rest
}: { name: IconName } & Omit<ComponentProps<typeof Iconsax.Add>, "ref">) {
  const Component = Iconsax[name];
  return <Component size={size} variant={variant} color="currentColor" aria-hidden {...rest} />;
}

export type { IconName };
