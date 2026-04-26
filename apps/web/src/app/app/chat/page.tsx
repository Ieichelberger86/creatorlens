import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/**
 * Chat is gone. Lens runs on a weekly cadence — see /app for the latest
 * review. Redirect any old links to home.
 */
export default function ChatRedirect() {
  redirect("/app" as Route);
}
