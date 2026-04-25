import { supabaseAdmin } from "@/lib/supabase/admin";
import { createNewConversation } from "./conversations/actions";
import { SidebarToggle } from "./sidebar-toggle";
import { ConversationItem } from "./conversation-item";

type ConvRow = {
  id: string;
  title: string | null;
  last_message_at: string;
  messages: Array<{ role: string; content: string }> | null;
};

export async function ConversationSidebar({
  userId,
  activeId,
}: {
  userId: string;
  activeId: string | null;
}) {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("conversations")
    .select("id, title, last_message_at, messages")
    .eq("user_id", userId)
    .eq("channel", "web")
    .order("last_message_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as ConvRow[];

  return (
    <SidebarToggle>
      <aside className="flex h-full flex-col gap-3 p-3">
        <form action={createNewConversation}>
          <button
            type="submit"
            className="btn-primary w-full text-sm"
          >
            + New chat
          </button>
        </form>

        <nav className="flex-1 overflow-y-auto pr-1">
          <ul className="flex flex-col gap-1">
            {rows.length === 0 ? (
              <li className="px-2 py-3 text-xs text-fg-subtle">
                No conversations yet.
              </li>
            ) : (
              rows.map((c) => {
                const fallback = firstUserMessage(c.messages) ?? "New conversation";
                const label = c.title ?? fallback;
                const active = c.id === activeId;
                return (
                  <li key={c.id}>
                    <ConversationItem id={c.id} label={label} active={active} />
                  </li>
                );
              })
            )}
          </ul>
        </nav>
      </aside>
    </SidebarToggle>
  );
}

function firstUserMessage(
  messages: ConvRow["messages"]
): string | null {
  if (!messages?.length) return null;
  const m = messages.find((x) => x.role === "user");
  if (!m) return null;
  const text = String(m.content ?? "").trim();
  if (!text) return null;
  return text.length > 50 ? text.slice(0, 50) + "…" : text;
}
