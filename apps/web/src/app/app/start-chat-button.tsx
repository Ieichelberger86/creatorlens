"use client";

import { useTransition } from "react";
import { createConversationFromPrompt } from "./conversations/actions";

/**
 * Empty-state action button: clicking starts a fresh conversation seeded
 * with the given prompt. Replaces "Tell Lens 'do X'" instruction text
 * with a one-click action.
 */
export function StartChatButton({
  prompt,
  label,
  variant = "primary",
}: {
  prompt: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.set("message", prompt);
        start(async () => void (await createConversationFromPrompt(fd)));
      }}
      className={
        (variant === "primary" ? "btn-primary" : "btn-secondary") +
        " text-sm disabled:opacity-50"
      }
    >
      {pending ? "Opening chat…" : label}
    </button>
  );
}
