import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { billingService } from './billing.service.js';

const checkoutSchema = z.object({
  plan: z.enum(['basic', 'pro']),
});

function getAuthenticatedUserId(request: FastifyRequest) {
  return (request.user as { sub: string }).sub;
}

function handleBillingError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof Error)) {
    throw error;
  }

  if (error.message === 'Project not found' || error.message === 'Stripe customer not found for this project') {
    return reply.status(404).send({ error: error.message });
  }

  if (error.message === 'Free plan does not require checkout' || error.message === 'Stripe price is not configured for this plan') {
    return reply.status(400).send({ error: error.message });
  }

  if (error.message === 'Stripe is not configured') {
    return reply.status(503).send({ error: error.message });
  }

  throw error;
}

export const billingController = {
  async listPlans(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(billingService.getPlans());
  },

  async createCheckoutSession(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = request.params as { projectId: string };
    const { plan } = checkoutSchema.parse(request.body);
    const userId = getAuthenticatedUserId(request);

    try {
      const session = await billingService.createCheckoutSession(userId, projectId, plan);
      return reply.send({ url: session.url });
    } catch (error) {
      return handleBillingError(error, reply);
    }
  },

  async createPortalSession(request: FastifyRequest, reply: FastifyReply) {
    const { projectId } = request.params as { projectId: string };
    const userId = getAuthenticatedUserId(request);

    try {
      const session = await billingService.createPortalSession(userId, projectId);
      return reply.send({ url: session.url });
    } catch (error) {
      return handleBillingError(error, reply);
    }
  },
};
