import express from 'express';
import { billingService } from './billing.service.js';

export function createStripeWebhookRouter() {
  const router = express.Router();

  router.post('/', express.raw({ type: 'application/json' }), async (request, response) => {
    try {
      const result = await billingService.handleWebhook(
        Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body),
        request.headers['stripe-signature']
      );

      return response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook error';
      return response.status(400).send(`Webhook Error: ${message}`);
    }
  });

  return router;
}
