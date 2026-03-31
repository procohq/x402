/**
 * @proco/x402 — Express middleware
 *
 * Wraps any Express route with x402 payment gating.
 * One line to protect a resource; Proco handles the rest.
 *
 * Usage:
 *   app.use(procoX402Middleware({ apiKey: '...', routes: { 'GET /data': { amount: 1_00, currency: 'USDC' } } }))
 */

import { Request, Response, NextFunction } from 'express'
import { ProcoX402Config, PaymentRequiredHeader } from '../types'
import { FacilitatorClient } from '../facilitator/client'

const X_PAYMENT_HEADER = 'x-payment'
const X_PAYMENT_RESPONSE_HEADER = 'x-payment-response'

export function procoX402Middleware(config: ProcoX402Config) {
  const env = config.env ?? 'production'
  const client = new FacilitatorClient(config.apiKey, env, config.facilitatorUrl)

  return async (req: Request, res: Response, next: NextFunction) => {
    const routeKey = `${req.method} ${req.path}`
    const route = config.routes[routeKey]

    // Route not gated — pass through
    if (!route) {
      return next()
    }

    const paymentHeader = req.headers[X_PAYMENT_HEADER] as string | undefined

    // No payment provided — return 402
    if (!paymentHeader) {
      const paymentRequiredHeader = client.buildPaymentRequiredHeader({
        resource: `${req.protocol}://${req.hostname}${req.path}`,
        amountCents: route.amount,
        description: route.description,
        env,
      })

      res.status(402).json({
        error: 'Payment Required',
        accepts: [paymentRequiredHeader],
      })
      return
    }

    // Payment provided — verify then settle
    const paymentRequiredHeader = client.buildPaymentRequiredHeader({
      resource: `${req.protocol}://${req.hostname}${req.path}`,
      amountCents: route.amount,
      description: route.description,
      env,
    })

    // 1. Verify the payment proof
    const verification = await client.verify({
      paymentHeader,
      paymentRequiredHeader,
    })

    if (!verification.isValid) {
      res.status(402).json({
        error: 'Invalid payment',
        reason: verification.invalidReason,
        accepts: [paymentRequiredHeader],
      })
      return
    }

    // 2. Settle — submit to Base
    const settlement = await client.settle({
      paymentHeader,
      paymentRequiredHeader,
    })

    if (!settlement.success) {
      res.status(402).json({
        error: 'Payment settlement failed',
        reason: settlement.errorReason,
      })
      return
    }

    // Attach settlement proof to response headers
    res.setHeader(X_PAYMENT_RESPONSE_HEADER, JSON.stringify({
      txHash: settlement.txHash,
      network: settlement.networkId,
      payer: settlement.payer,
    }))

    // Payment settled — proceed to the actual route handler
    next()
  }
}
