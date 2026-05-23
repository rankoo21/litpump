# Security policy

## Status

- LitPump is **testnet** software shipped on the LitVM LiteForge testnet (`chainId 4441`).
- Smart contracts use the OpenZeppelin v5 building blocks: `ReentrancyGuard`, `Pausable`,
  `Ownable2Step`, `Clones` (EIP-1167) and `SafeERC20` patterns.
- The contracts have **not** undergone an external audit. Treat any user-facing address
  as testnet-only until that audit is complete.

## Scope

- `contracts/src/PumpToken.sol`
- `contracts/src/BondingCurve.sol`
- `contracts/src/TokenFactory.sol`
- `contracts/src/TokenComments.sol`
- `web/app/api/pinata/upload/route.ts`

## What we already cover

| Area | Mitigation |
|---|---|
| Reentrancy | `nonReentrant` on every state-mutating entry point (`buy`, `sell`, `launch`) plus strict CEI |
| Slippage | `minTokensOut` / `minLtcOut` parameters on every trade |
| MEV / stale tx | `deadline` parameter on every trade, capped at 30 days into the future |
| Rounding | All divisions floor in the protocol's favour. Buy refunds the unused remainder when capped |
| Address prediction | EIP-1167 minimal proxies via CREATE2 with a monotonically increasing salt |
| Pause / kill switch | Owner-only `pause()`/`unpause()` on the factory |
| Admin transfer | `Ownable2Step` (no accidental zero-address transfer) |
| Bot abuse on launch | Per-creator cooldown (30 s) and creation fee cap (1 zkLTC) |
| Comment spam | Per-author cooldown (30 s, time-based) and 280-byte cap |
| Comments DoS | Comments only accepted for tokens launched via the factory |
| Native ETH safety | `BondingCurve.receive`/`fallback` revert; only `buy()` may credit reserves |
| IPFS abuse | `/api/pinata/upload` requires a wallet signature + per-signer rate limit |
| URL injection | All user-supplied URLs pass through `safeUrl()` before hitting `<a href>`/`<img src>` |
| Headers | CSP + X-Frame-Options + X-Content-Type-Options + Referrer-Policy in `next.config.js` |

## Reporting a vulnerability

Email **security@litpump.example** (replace with your actual address).
Please do not open a public GitHub issue for security reports.

We respond to triage within 72 hours. We aim to credit reporters publicly after a fix
ships, unless you request otherwise.

## Pre-mainnet checklist

Before any mainnet deployment we will:

- [ ] Commission an external smart-contract audit
- [ ] Run `slither` and `mythril` static analysis
- [ ] Stress-test economic invariants on a public testnet for ≥ 30 days
- [ ] Replace the trade-event scanning loops with an indexer (Postgres / Ponder)
- [ ] Replace Pinata's hardcoded gateway with a configurable resolver
- [ ] Re-evaluate the creation fee cap and cooldown values for production load

## Out of scope

- Phishing pages or third-party clones impersonating LitPump.
- Issues caused by user-installed browser extensions modifying the page (e.g. Dark Reader).
- Vulnerabilities in upstream wallet software (MetaMask, RainbowKit, etc.).
