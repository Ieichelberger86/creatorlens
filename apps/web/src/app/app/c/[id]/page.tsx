import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/**
 * Old chat conversation routes are now redirects. The product runs on
 * weekly reviews, not open-ended chat. Old conversations remain in the DB
 * but are no longer surfaced.
 */
export default function ConversationRedirect() {
  redirect("/app" as Route);
}
