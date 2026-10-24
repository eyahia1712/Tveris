import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

export function formatClock(iso: string | null): string {
  if (iso === null) return "--";
  const date = new Date(iso);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortId(emailId: string): string {
  const match = emailId.match(/(\d+)$/);
  return match ? match[1]! : emailId.slice(-6);
}

export function senderName(from: string): string {
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1]!.trim();
  return from.replace(/[<>]/g, "").trim();
}
