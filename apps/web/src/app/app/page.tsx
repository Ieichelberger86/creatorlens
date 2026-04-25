import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";
import { ChatClient, type InitialConversation } from "./chat-client";

export const dynamic = "force-dynamic";

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export default async function LensAppPage() {
  const user = await getSessionUser();
  // Layout already gated; if we got here, user exists.
  if (!user) return null;

  const admin = supabaseAdmin();

  // Onboarding gate — first-time creators answer 3 questions before chat.
  const { data: profile } = await admin
    .from("creator_profile")
    .select("onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.onboarded_at) {
    redirect("/app/onboarding");
  }

  const { data: conv } = await admin
    .from("conversations")
    .select("id, messages, last_message_at")
    .eq("user_id", user.id)
    .eq("channel", "web")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const initial: InitialConversation = {
    conversationId: conv?.id ?? null,
    messages: (conv?.messages as StoredMessage[] | null) ?? [],
  };

  return <ChatClient initial={initial} />;
}
