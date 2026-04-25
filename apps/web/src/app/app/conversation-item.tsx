"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { renameConversation, deleteConversation } from "./conversations/actions";

export function ConversationItem({
  id,
  label,
  active,
}: {
  id: string;
  label: string;
  active: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(label);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await renameConversation(id, title);
            setEditing(false);
            router.refresh();
          });
        }}
        className="flex items-center gap-1 px-1 py-1"
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            start(async () => {
              await renameConversation(id, title);
              setEditing(false);
              router.refresh();
            });
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setTitle(label);
              setEditing(false);
            }
          }}
          className="flex-1 rounded border border-accent/40 bg-bg-elevated px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
        />
      </form>
    );
  }

  return (
    <div
      className={
        "group relative flex items-center gap-1 rounded-lg transition " +
        (active ? "bg-accent/15" : "hover:bg-bg-elevated")
      }
    >
      <Link
        href={`/app/c/${id}` as Route}
        className={
          "flex-1 truncate px-3 py-2 text-sm " +
          (active ? "text-fg" : "text-fg-muted group-hover:text-fg")
        }
        title={label}
      >
        {label}
      </Link>
      <div className="flex items-center pr-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setEditing(true);
          }}
          className="rounded p-1 text-fg-subtle hover:bg-bg hover:text-fg"
          title="Rename"
          aria-label="Rename conversation"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5"
          >
            <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
          </svg>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!confirm(`Delete "${label}"?`)) return;
            start(async () => {
              await deleteConversation(id);
              router.refresh();
              if (active) router.push("/app");
            });
          }}
          className="rounded p-1 text-fg-subtle hover:bg-bg hover:text-danger"
          title="Delete"
          aria-label="Delete conversation"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5"
          >
            <path d="M5.75 3V1.75A1.75 1.75 0 0 1 7.5 0h1A1.75 1.75 0 0 1 10.25 1.75V3h2.5a.75.75 0 0 1 0 1.5h-.5v9.25A1.75 1.75 0 0 1 10.5 16h-5a1.75 1.75 0 0 1-1.75-1.75V4.5h-.5a.75.75 0 0 1 0-1.5h2.5Zm1.5-1.25A.25.25 0 0 1 7.5 1.5h1a.25.25 0 0 1 .25.25V3h-1.5V1.75Zm-2 2.75v9.25c0 .138.112.25.25.25h5a.25.25 0 0 0 .25-.25V4.5h-5.5Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
