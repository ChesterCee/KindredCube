import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import Stripe from "stripe";
import { DatabaseService } from "./database.service";

export type PurchaseType = "wallet" | "kindred_pass" | "premium";
export type WalletItem = "super_like" | "photo_comment" | "liked_you_reveal" | "ready_to_meet_chat";

const walletPrices: Record<WalletItem, number> = {
  super_like: 250,
  photo_comment: 250,
  liked_you_reveal: 999,
  ready_to_meet_chat: 999,
};

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe | null;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    const secret = process.env.STRIPE_SECRET_KEY;
    this.stripe = secret ? new Stripe(secret) : null;
  }

  private client() {
    if (!this.stripe) throw new ServiceUnavailableException("Stripe payments are not configured.");
    return this.stripe;
  }

  async createCheckout(userId: string, purchaseType: PurchaseType, walletAmount?: number) {
    const amountCents = this.amountFor(purchaseType, walletAmount);
    const account = await this.database.withUser(userId, async (client) => {
      const user = await client.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
      const order = await client.query<{ id: string }>(
        `INSERT INTO payment_orders (user_id, purchase_type, amount_cents)
         VALUES ($1, $2, $3) RETURNING id`,
        [userId, purchaseType, amountCents],
      );
      return { email: user.rows[0]?.email, orderId: order.rows[0]!.id };
    });
    if (!account.email) throw new BadRequestException("The signed-in account could not be found.");

    const publicApiUrl = process.env.PUBLIC_API_URL?.replace(/\/$/, "");
    if (!publicApiUrl) throw new ServiceUnavailableException("PUBLIC_API_URL is required for Stripe Checkout.");
    const metadata = {
      user_id: userId,
      order_id: account.orderId,
      purchase_type: purchaseType,
      amount_cents: String(amountCents),
      wallet_top_up_non_refundable: purchaseType === "wallet" ? "true" : "false",
    };
    const productName = purchaseType === "wallet" ? "KindredCube Wallet" : purchaseType === "premium" ? "KindredCube Premium" : "KindredPass (24 hours)";
    const recurring = purchaseType === "premium" ? { interval: "month" as const } : undefined;
    const session = await this.client().checkout.sessions.create({
      mode: purchaseType === "premium" ? "subscription" : "payment",
      customer_email: account.email,
      metadata,
      subscription_data: purchaseType === "premium" ? { metadata } : undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          recurring,
          product_data: {
            name: productName,
            description: purchaseType === "wallet"
              ? "Wallet top-ups are final and non-refundable except where required by law."
              : undefined,
          },
        },
      }],
      success_url: `${publicApiUrl}/v1/payments/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicApiUrl}/v1/payments/cancel`,
    });
    await this.database.withUser(userId, (client) =>
      client.query(
        `UPDATE payment_orders SET stripe_checkout_session_id = $1, updated_at = now()
         WHERE user_id = $2 AND id = $3`,
        [session.id, userId, account.orderId],
      ),
    );
    if (!session.url) throw new ServiceUnavailableException("Stripe Checkout did not provide a secure URL.");
    return { url: session.url, orderId: account.orderId };
  }

  async summary(userId: string) {
    return this.database.withUser(userId, async (client) => {
      const wallet = await client.query<{ balance_cents: number }>(
        "SELECT balance_cents FROM wallet_accounts WHERE user_id = $1",
        [userId],
      );
      const entitlements = await client.query<{ entitlement: "premium" | "kindred_pass"; expires_at: string | null }>(
        `SELECT entitlement, expires_at FROM user_entitlements
         WHERE user_id = $1 AND active = true AND (expires_at IS NULL OR expires_at > now())`,
        [userId],
      );
      const premium = entitlements.rows.find((row) => row.entitlement === "premium");
      const pass = entitlements.rows.find((row) => row.entitlement === "kindred_pass");
      return {
        walletBalanceCents: wallet.rows[0]?.balance_cents ?? 0,
        premiumActive: Boolean(premium),
        kindredPassActive: Boolean(pass),
        kindredPassExpiresAt: pass?.expires_at ?? null,
      };
    });
  }

  async confirmCheckout(userId: string, sessionId: string) {
    if (!sessionId.startsWith("cs_")) throw new BadRequestException("A valid Stripe Checkout session is required.");
    const session = await this.client().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.user_id !== userId) throw new BadRequestException("This payment does not belong to the signed-in account.");
    const eventType = session.status === "expired" ? "checkout.session.expired" : "checkout.session.completed";
    await this.processWebhook({
      id: `checkout-confirm:${session.id}`,
      object: "event",
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      data: { object: session },
      livemode: session.livemode,
      pending_webhooks: 0,
      request: null,
      type: eventType,
    } as Stripe.Event);
    return this.summary(userId);
  }

  async spend(userId: string, item: WalletItem, idempotencyKey: string) {
    const amount = walletPrices[item];
    if (!amount || idempotencyKey.length < 12) throw new BadRequestException("A valid wallet purchase is required.");
    return this.database.withUser(userId, async (client) => {
      const prior = await client.query("SELECT id FROM wallet_ledger WHERE user_id = $1 AND idempotency_key = $2", [userId, idempotencyKey]);
      if (!prior.rowCount) {
        await client.query(
          `INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
          [userId],
        );
        const debit = await client.query<{ balance_cents: number }>(
          `UPDATE wallet_accounts SET balance_cents = balance_cents - $1, updated_at = now()
           WHERE user_id = $2 AND balance_cents >= $1 RETURNING balance_cents`,
          [amount, userId],
        );
        if (!debit.rowCount) throw new BadRequestException("Your Wallet does not have enough funds.");
        await client.query(
          `INSERT INTO wallet_ledger (user_id, delta_cents, entry_type, idempotency_key)
           VALUES ($1, $2, $3, $4)`,
          [userId, -amount, item, idempotencyKey],
        );
      }
      const wallet = await client.query<{ balance_cents: number }>("SELECT balance_cents FROM wallet_accounts WHERE user_id = $1", [userId]);
      return { walletBalanceCents: wallet.rows[0]?.balance_cents ?? 0 };
    });
  }

  async processWebhook(event: Stripe.Event) {
    if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.user_id;
      if (!userId) return;
      await this.database.withUser(userId, async (client) => {
        const accepted = await client.query(
          `INSERT INTO stripe_payment_webhook_events (event_id, event_type)
           VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
          [event.id, event.type],
        );
        if (!accepted.rowCount) return;
        const active = ["active", "trialing"].includes(subscription.status);
        const periodEnd = subscription.items.data.reduce(
          (latest, item) => Math.max(latest, item.current_period_end || 0),
          0,
        );
        await client.query(
          `UPDATE user_entitlements
           SET active = $1, expires_at = $2, updated_at = now()
           WHERE user_id = $3 AND entitlement = 'premium' AND stripe_subscription_id = $4`,
          [active, periodEnd ? new Date(periodEnd * 1000) : null, userId, subscription.id],
        );
      });
      return;
    }
    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired") return;
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const orderId = session.metadata?.order_id;
    const purchaseType = session.metadata?.purchase_type as PurchaseType | undefined;
    if (!userId || !orderId || !purchaseType) return;
    await this.database.withUser(userId, async (client) => {
      const accepted = await client.query(
        `INSERT INTO stripe_payment_webhook_events (event_id, event_type)
         VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [event.id, event.type],
      );
      if (!accepted.rowCount) return;
      if (event.type === "checkout.session.expired") {
        await client.query(`UPDATE payment_orders SET status = 'expired', updated_at = now() WHERE user_id = $1 AND id = $2`, [userId, orderId]);
        return;
      }
      if (session.payment_status !== "paid" && session.mode !== "subscription") return;
      const amountCents = Number(session.amount_total || session.metadata?.amount_cents || 0);
      if (Number.isInteger(amountCents) && amountCents > 0) {
        await client.query(
          `INSERT INTO payment_orders
             (id, user_id, purchase_type, amount_cents, stripe_checkout_session_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [orderId, userId, purchaseType, amountCents, session.id],
        );
      }
      const order = await client.query<{ amount_cents: number; status: string }>(
        `UPDATE payment_orders SET status = 'paid', paid_at = COALESCE(paid_at, now()),
           stripe_customer_id = $1, stripe_subscription_id = $2, updated_at = now()
         WHERE user_id = $3 AND id = $4 AND status <> 'paid' RETURNING amount_cents, status`,
        [typeof session.customer === "string" ? session.customer : null, typeof session.subscription === "string" ? session.subscription : null, userId, orderId],
      );
      if (!order.rows[0]) return;
      if (purchaseType === "wallet") {
        const credited = await client.query(
          `INSERT INTO wallet_ledger (user_id, delta_cents, entry_type, stripe_event_id)
           VALUES ($1, $2, 'top_up', $3) ON CONFLICT (stripe_event_id) DO NOTHING RETURNING id`,
          [userId, order.rows[0].amount_cents, event.id],
        );
        if (credited.rowCount) {
          await client.query(
            `INSERT INTO wallet_accounts (user_id, balance_cents) VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE SET balance_cents = wallet_accounts.balance_cents + EXCLUDED.balance_cents, updated_at = now()`,
            [userId, order.rows[0].amount_cents],
          );
        }
      } else {
        const expiresAt = purchaseType === "kindred_pass" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
        await client.query(
          `INSERT INTO user_entitlements (user_id, entitlement, active, starts_at, expires_at, stripe_subscription_id)
           VALUES ($1, $2, true, now(), $3, $4)
           ON CONFLICT (user_id, entitlement) DO UPDATE SET active = true, starts_at = now(), expires_at = EXCLUDED.expires_at,
             stripe_subscription_id = EXCLUDED.stripe_subscription_id, updated_at = now()`,
          [userId, purchaseType, expiresAt, typeof session.subscription === "string" ? session.subscription : null],
        );
      }
    });
  }

  private amountFor(type: PurchaseType, walletAmount?: number) {
    if (type === "wallet") {
      const cents = Math.round(Number(walletAmount) * 100);
      if (!Number.isFinite(cents) || cents < 1000 || cents > 50000) throw new BadRequestException("Wallet top-ups must be between $10 and $500.");
      return cents;
    }
    if (type === "kindred_pass") return Number(process.env.KINDRED_PASS_PRICE_CENTS || 1999);
    return Number(process.env.PREMIUM_PRICE_CENTS || 4999);
  }
}
