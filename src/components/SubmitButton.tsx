"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Submit button that shows a pending label while its form's action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}
