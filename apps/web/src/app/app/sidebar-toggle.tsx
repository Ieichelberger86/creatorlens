"use client";

import { useState, useEffect } from "react";

/**
 * Wraps the conversation sidebar with a mobile drawer toggle. On md+ it's a
 * permanent left rail; on mobile it slides in from the left when the toggle
 * button (rendered separately, in the chat header) dispatches an event.
 */
export function SidebarToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onToggle() {
      setOpen((v) => !v);
    }
    function onClose() {
      setOpen(false);
    }
    window.addEventListener("creatorlens:sidebar-toggle", onToggle);
    window.addEventListener("creatorlens:sidebar-close", onClose);
    return () => {
      window.removeEventListener("creatorlens:sidebar-toggle", onToggle);
      window.removeEventListener("creatorlens:sidebar-close", onClose);
    };
  }, []);

  return (
    <>
      {/* Permanent rail on md+ */}
      <div className="hidden h-full w-64 shrink-0 border-r border-border bg-bg-elevated/40 md:block">
        {children}
      </div>

      {/* Mobile slide-in */}
      {open ? (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-full w-72 max-w-[80vw] bg-bg-elevated border-r border-border"
          >
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function SidebarOpenButton() {
  return (
    <button
      type="button"
      aria-label="Open conversations"
      onClick={() =>
        window.dispatchEvent(new Event("creatorlens:sidebar-toggle"))
      }
      className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-fg-muted hover:text-fg"
    >
      <span className="block text-base leading-none">☰</span>
    </button>
  );
}
