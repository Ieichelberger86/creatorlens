import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";
import { ConversationSidebar } from "../../conversation-sidebar";
import { ChatClient, type InitialConversation } from "../../chat-client";

export const dynamic = "force-dynamic";

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
  tool_calls?: Array<{ name: string; input: unknown; output: string }>;
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return null;

  const admin = supabaseAdmin();

  const { data: profile } = await admin
    .from("creator_profile")
    .select("onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect("/app/onboarding");

  const { data: conv, error } = await admin
    .from("conversations")
    .select("id, messages, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !conv) notFound();

  const initial: InitialConversation = {
    conversationId: conv.id,
    messages: ((conv.messages as StoredMessage[] | null) ?? []).map((m) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      toolCalls: m.tool_calls?.map((c, i) => ({
        id: `persisted-${i}`,
        name: c.name,
        input: c.input,
        status: "done" as const,
      })),
    })),
  };

  return (
    <div className="flex h-[calc(100dvh-57px)] w-full">
      <ConversationSidebar userId={user.id} activeId={conv.id} />
      <div className="flex flex-1 flex-col">
        <ChatClient initial={initial} />
      </div>
    </div>
  );
}
