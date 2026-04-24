import type { Request, Response } from "express";
import type Stripe from "stripe";
import { stripe } from "../lib/stripe.js";
import { adminClient } from "@creatorlens/db";
import { log } from "../lib/logger.js";

export async function stripeWebhook(req: Request, res: Response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];

  if (!secret || !signature) {
    log.warn("stripe_webhook_missing_signature_or_secret");
    return res.status(400).send("missing signature");
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      req.body as Buffer,
      signature as string,
      secret
    );
  } catch (err) {
    log.error({ err }, "stripe_webhook_signature_failed");
    return res.status(400).send("invalid signature");
  }

  log.info({ type: event.type, id: event.id }, "stripe_webhook");

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.type === "preorder_deposit") {
          await adminClient()
            .from("preorders")
            .upsert(
              {
                email:
                  session.customer_details?.email ??
                  session.metadata.email ??
                  "",
                stripe_checkout_session_id: session.id,
                stripe_payment_intent_id:
                  typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null,
                amount_cents: session.amount_total ?? 1000,
                currency: session.currency ?? "usd",
                status: "paid",
                utm_source: session.metadata.utm_source || null,
                utm_campaign: session.metadata.utm_campaign || null,
                utm_medium: session.metadata.utm_medium || null,
                referrer: session.metadata.referrer || null,
              },
              { onConflict: "stripe_checkout_session_id" }
            );
          log.info(
            { session: session.id },
            "preorder_recorded"
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // Phase 5 — wire subscription lifecycle to users.tier
        break;
      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    log.error({ err, type: event.type }, "stripe_webhook_handler_failed");
    // 200 so Stripe doesn't retry a handler bug endlessly; we log instead.
    res.status(200).json({ received: true, handler_error: true });
  }
}
