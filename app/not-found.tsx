import Link from "next/link";

export default function NotFound() {
  return (
    <main className="xv-dotgrid grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm border border-border bg-card p-6 text-center">
        <p className="xv-micro xv-micro-sm text-muted-foreground">Not found</p>
        <p className="mt-2 text-[17px] font-medium">That email is not in this inbox.</p>
        <Link href="/" className="xv-micro xv-micro-sm mt-4 inline-block text-accent-ink hover:underline">Back to overview</Link>
      </div>
    </main>
  );
}
