/**
 * Notification templates.
 *
 * Each project defines its own typed wrappers around `createNotification`.
 * The example below ships with the template — adapt it, replace it, or add
 * more (e.g. `firePaymentReceived`, `fireExportReady`). The pattern:
 *
 *   1. Build a `CreateNotificationInput` with a *deterministic* dedupeKey
 *      so the unique constraint enforces at-most-once delivery for that
 *      logical event (e.g. `payment-received:${orderId}` — never include
 *      a timestamp or random suffix).
 *   2. Pass the input + your PrismaClient to `createNotification`.
 *   3. Optionally enqueue an email via `EmailQueue.enqueue` — but ONLY
 *      after the notification row is created, so a duplicate event never
 *      sends a duplicate email.
 *
 * Keep these helpers free of side effects beyond the row insert; the
 * email enqueue belongs at the call site so each project can pick the
 * right channel (no email vs. transactional vs. marketing).
 */

import type { CreateNotificationInput } from './index';

export function welcomeNotification(userId: string, email: string): CreateNotificationInput {
  return {
    userId,
    type: 'WELCOME',
    title: 'Welcome!',
    body: `Glad to have you on board, ${email}.`,
    dedupeKey: `welcome:${userId}`,
  };
}

/**
 * Example: notification dispatched after a successful payment.
 * Called from the Bictorys webhook handler's `onPaid` post-commit hook.
 */
export function paymentReceived(
  userId: string,
  orderId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    body: `Order ${orderId} for ${amount} ${currency} confirmed.`,
    data: { orderId, amount, currency },
    dedupeKey: `payment-received:${orderId}`,
  };
}

/**
 * Fired when a visitor submits "Demander une visite" on a property detail
 * page. dedupeKey is keyed on the VisitRequest row id (already unique), not
 * a timestamp — each submission is a distinct real event, not a retry.
 */
export function visitRequested(
  ownerId: string,
  visitRequestId: string,
  propertyId: string,
  propertyTitle: string,
  requesterName: string,
  requesterPhone: string,
): CreateNotificationInput {
  return {
    userId: ownerId,
    type: 'VISIT_REQUESTED',
    title: 'Nouvelle demande de visite',
    body: `${requesterName} (${requesterPhone}) souhaite visiter « ${propertyTitle} ».`,
    data: { propertyId, visitRequestId, requesterName, requesterPhone },
    dedupeKey: `visit-requested:${visitRequestId}`,
  };
}

/**
 * Fired when a visitor submits "Manifester mon intérêt" on an investment
 * project detail page. dedupeKey is keyed on the InvestmentInterest row id
 * (already unique), not a timestamp — each submission is a distinct real
 * event, not a retry.
 */
export function investmentInterestReceived(
  ownerId: string,
  interestId: string,
  projectId: string,
  projectTitle: string,
  requesterName: string,
  requesterPhone: string,
): CreateNotificationInput {
  return {
    userId: ownerId,
    type: 'INVESTMENT_INTEREST_RECEIVED',
    title: 'Nouveau contact investisseur',
    body: `${requesterName} (${requesterPhone}) s'intéresse à votre projet « ${projectTitle} ».`,
    data: { projectId, interestId, requesterName, requesterPhone },
    dedupeKey: `investment-interest-received:${interestId}`,
  };
}
