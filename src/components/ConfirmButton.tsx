"use client";

import type { ReactNode } from "react";

/** Submit button that asks before running its form action. */
export function ConfirmButton({
  formAction,
  message,
  className,
  children,
}: {
  formAction: (form: FormData) => Promise<void>;
  message: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
