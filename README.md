# @proco/x402

[![npm](https://img.shields.io/npm/v/@proco/x402)](https://npmjs.com/package/@proco/x402)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![x402](https://img.shields.io/badge/protocol-x402-blue)](https://github.com/coinbase/x402)

Proco's x402 facilitator — the server-side component that handles verification and settlement of HTTP 402 payments for AI agents, built on Base.

---

## What is x402?

[x402](https://github.com/coinbase/x402) is an open standard that extends HTTP with a native payment layer. When a client requests a resource that requires payment, the server returns `402 Payment Required` with machine-readable payment terms. The client pays, attaches proof, and re-requests. The server verifies and serves.

It was designed for agents. No redirects. No OAuth flows. No human in the loop.

```
Agent → GET /data
Server ← 402 + { amount: $0.01, network: "base", currency: "USDC" }
Agent → GET /data + X-Payment: <signed proof>
Server ← 200 + data
```

---

## What this repo adds

x402 defines the protocol. Proco builds the **facilitator** — the piece that sits between your agent and any x402-compatible resource server, handling:

- **Payment verification** — validates signed payment proofs before you unlock your resource
- **Settlement** — submits USDC payments to Base on behalf of agents
- **Policy enforcement** — per-agent spending caps, vendor allowlists, and time-based rules baked in before every transaction
- **Agent wallets** — each agent holds its own USDC balance, independent of human accounts
- **Audit trail** — every payment logged with agent ID, vendor, amount, and settlement hash

---

## Installation

```bash
npm install @proco/x402
```

---

## Server-side: protect a resource with x402

Add one middleware line. Proco handles everything else.

```typescript
import express from 'express'
import { procoX402Middleware } from '@proco/x402/express'

const app = express()

app.use(procoX402Middleware({
  apiKey: process.env.PROCO_API_KEY,
  routes: {
    'GET /data': { amount: 1_00, currency: 'USDC', description: 'Market data' },
    'POST /analyze': { amount: 5_00, currency: 'USDC', description: 'AI analysis' },
  }
}))

app.get('/data', (req, res) => {
  res.json({ price: 42.00 })
})
```

---

## Client-side: pay with one function call

```typescript
import { Proco } from '@proco/sdk'

const proco = new Proco({ apiKey: process.env.PROCO_API_KEY })

const wallet = await proco.wallets.create({
  agentId: 'research-agent-01',
  policies: {
    dailyCap: 50_00,
    vendors: ['api.example.com'],
    currency: 'USDC'
  }
})

// proco.fetch() intercepts 402s, pays, and returns the 200 - automatically
const res = await proco.fetch('https://api.example.com/data', {
  wallet: wallet.id
})
const data = await res.json()
```

---

## The facilitator flow

```
1. Agent → resource server (GET /data)
2. Resource server → 402 + PaymentRequired header
3. Agent → Proco facilitator (verify payment terms)
4. Proco → confirms terms are valid for this agent's policies
5. Agent → resource server (GET /data + X-Payment header)
6. Resource server → Proco facilitator (settle payment)
7. Proco → Base (submit USDC transfer)
8. Proco → resource server (settlement confirmed)
9. Resource server → Agent (200 + data)
```

---

## Payment policies

Proco enforces policies at the facilitator level - before any payment settles.

```typescript
const wallet = await proco.wallets.create({
  agentId: 'budget-agent',
  policies: {
    dailyCap: 100_00,          // $100/day
    perTx: 10_00,              // $10 max per transaction
    vendors: [                 // vendor allowlist
      'api.perplexity.ai',
      'serper.dev',
      'api.openai.com'
    ],
    hoursActive: [9, 17],      // only transact 9am-5pm UTC
    currency: 'USDC'
  }
})
```

Policy violations throw a `PolicyViolationError` before any on-chain transaction occurs:

```typescript
import { PolicyViolationError } from '@proco/x402'

try {
  await proco.fetch('https://expensive-vendor.com/api', { wallet: wallet.id })
} catch (e) {
  if (e instanceof PolicyViolationError) {
    console.log(e.reason) // → "vendor not in allowlist"
  }
}
```

---

## Environments

| Environment | Network | Currency | API Base |
|-------------|---------|----------|----------|
| `sandbox`   | Base Sepolia testnet | Testnet USDC | `sandbox.api.procohq.com` |
| `production` | Base mainnet | USDC | `api.procohq.com` |

Sandbox keys are free. No credit card. Start at [procohq.com/sandbox](https://procohq.com/sandbox).

---

## Compatibility

Proco's x402 facilitator is fully compatible with the [coinbase/x402](https://github.com/coinbase/x402) open standard. Any resource server using `@x402/express`, `@x402/hono`, `@x402/next`, or any other x402 middleware will work with Proco as the client-side facilitator.

We implement:
- `exact` scheme on EVM (Base, Ethereum)
- USDC on Base (primary)
- Standard `PAYMENT-REQUIRED` and `PAYMENT-SIGNATURE` headers
- `/verify` and `/settle` facilitator endpoints

---

## Self-hosting the facilitator

Need to run your own? The Proco facilitator is open source.

```bash
git clone https://github.com/procohq/x402
cd x402
npm install
cp .env.example .env
# Add your Base RPC URL and settlement key
npm run start
```

The facilitator exposes:
- `POST /verify` - validate a payment payload
- `POST /settle` - submit payment to Base
- `GET /health` - health check

---

## Related

- [`@proco/sdk`](https://github.com/procohq/proco-sdk) — full SDK with wallets, policies, A2A settlement
- [`procohq/examples`](https://github.com/procohq/examples) — ready-to-run examples
- [`procohq/sandbox`](https://github.com/procohq/sandbox) — free developer environment
- [`coinbase/x402`](https://github.com/coinbase/x402) — the x402 open standard

---

## Contributing

This is an open standard implementation. PRs welcome for:
- Additional EVM network support
- Fiat payment scheme implementations
- New framework middleware (`@x402/fastify`, `@x402/koa`, etc.)

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

MIT · Built by [Proco](https://procohq.com)
