export type PaymentAttemptResult =
  | { success: true; subscriptionId: string }
  | { success: false; error: string };

export type PaymentMethod = 'card' | 'gcash' | 'apple-pay';

/**
 * Boundary for a future PCI-compliant payment provider.
 *
 * No provider is configured in this prototype, so this function never
 * collects payment data and never returns a successful payment.
 */
export const paymentService = {
  async startPremiumPayment(_method: PaymentMethod): Promise<PaymentAttemptResult> {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      success: false,
      error: 'Payments are not configured for this prototype. No charge was made.',
    };
  },
};
