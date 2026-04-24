import { Router } from "express";
import { z } from "zod";
import { stripe } from "../lib/stripe.js";
import { PRICING } from "@creatorlens/shared/pricing";
import { log } from "../lib/logger.js";

export const preordersRouter: Router = Router();

const createPreorderSchema = z.object({
  email: z.string().email(),
  utm_source: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_medium: z.string().optional(),
  referrer: z.string().optional(),
});

/**
 * POST /preorders
 * Body: { email, utm_*?, referrer? }
 * Returns: { checkout_url }
 *
 * Creates a Stripe Checkout Session for the $10 pre-order deposit.
 * The session_id and email are written to preorders (pending) via webhook
 * on checkout.session.completed.
 */
preordersRouter.post("/", async (req, res, next) => {
  try {
    const body = createPreorderSchema.parse(req.body);
    const priceId = process.env.STRIPE_PRICE_PREORDER_DEPOSIT;

    if (!priceId) {
      return res.status(503).json({
        error: "preorder_not_configured",
        message: "STRIPE_PRICE_PREORDER_DEPOSIT not set",
      });
    }

    const origin = process.env.PUBLIC_WEB_URL ?? "http://localhost:3000";

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: body.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/preorder/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/preorder`,
      metadata: {
        type: "preorder_deposit",
        email: body.email,
        utm_source: body.utm_source ?? "",
        utm_campaign: body.utm_campaign ?? "",
        utm_medium: body.utm_medium ?? "",
        referrer: body.referrer ?? "",
      },
    });

    log.info({ email: body.email, session: session.id }, "preorder_checkout_created");

    res.json({
      checkout_url: session.url,
      amount_cents: PRICING.preorder.oneTimeCents,
    });
  } catch (err) {
    next(err);
  }
});
