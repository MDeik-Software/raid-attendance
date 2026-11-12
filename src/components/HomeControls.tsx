"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Officers: pick any raid team character to look at. */
export function CharacterPicker({ options, selected }: { options: { id: number; name: string }[]; selected: number }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      View
      <select
        value={selected}
        onChange={(e) => router.push(`/?c=${e.target.value}`)}
        className="rounded border border-border bg-background px-2 py-1 text-foreground"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
