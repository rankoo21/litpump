# LitPump — Internal Pre-Audit Report

**Scope:** `contracts/` (Solidity 0.8.24 + Foundry) and `web/` (Next.js 14 + wagmi 2)
**Status:** Internal review by the LitPump team, prior to commissioning an external audit.
**Last updated:** 2026-05-22

This document inventories findings discovered during a self-audit pass, describes the fix
shipped for each, and lists the residual risks an external auditor should focus on.

## 1. Severity model

| Severity | Definition |
|---|---|
| Critical | Direct loss of user funds, full protocol takeover, or secret-leak class |
| High     | Bug-for-money path, DoS that requires migration, or reentrancy exposure |
| Medium   | Loss of yield / griefing / footgun that is exploitable without privileges |
| Low      | Defence-in-depth gap, polish, or minor information leak |
| Info     | Style, dead code, missing test, or documentation gap |

## 2. Findings & resolutions

### Critical

| ID | Title | Status |
|---|---|---|
| **C-1** | A real-looking 32-byte private key was committed to `contracts/.env` in the workspace. The `.env.example` warned against this but the operator left a hot key on disk. | **Owner action required** — rotate the key, sweep funds, redeploy from a fresh deployer, scrub git history. The repo is now hardened (`.gitignore` excludes `.env*`, build/test/deploy logs are gitignored, an explicit warning lives in `SECURITY.md`). |
| **C-2** | `/api/pinata/upload` was anonymous, allowing any internet caller to drain the Pinata quota. The IP-based rate limit was spoofable via `X-Forwarded-For`. | **Fixed** — uploads now require a signed `personal_sign` payload (`LitPump IPFS upload \| <iso-timestamp>`), the timestamp must be within 5 minutes, and the rate limit keys off the recovered signer address. |

### High

| ID | Title | Status |
|---|---|---|
| **H-1** | `BondingCurve.buy()` debited `msg.value` minus fee even when `quoteBuy` capped tokens at `SALE_SUPPLY`, overcharging the buyer and falsely advancing graduation. | **Fixed** — `quoteBuy` now returns `(tokensOut, fee, ltcConsumed)`. `buy()` updates reserves with the consumed amount and refunds the remainder. |
| **H-2** | `sell()` would underflow with an arithmetic panic when `tokensIn > tokensSold` (the quote silently capped, the executor did not). | **Fixed** — `sell()` reverts cleanly with `InsufficientTokens`; `quoteSell()` now reverts on excess input rather than masking it. |
| **H-3** | `_computeCreateAddress` predicted addresses by RLP-encoding the factory's nonce. Any deviation in the create order (re-entry, half-completed launch) bricked the factory permanently. | **Fixed** — `TokenFactory` now deploys EIP-1167 minimal proxies via `Clones.cloneDeterministic` with monotonically increasing salts. `tokenImplementation` and `curveImplementation` are immutable, both call `_disableInitializers()` in their constructors, and clones are wired together via `initialize()`. |
| **H-4** | `launch()` sent the creation fee to `feeRecipient` *before* deploying the contracts, exposing it to reentrancy from a malicious recipient. | **Fixed** — `launch()` now wears `nonReentrant`, fee transfer happens after CREATE+state, and a dev-buy refund path correctly forwards leftover ETH to the creator. |

### Medium

| ID | Title | Status |
|---|---|---|
| **M-1** | No `nonReentrant` on `buy`/`sell`. | **Fixed** — guard added on every external state-mutating entry point. |
| **M-2** | No deadline parameter on trades; transactions could settle stale. | **Fixed** — `buy(minTokensOut, deadline)` and `sell(tokensIn, minLtcOut, deadline)`. `0` disables; otherwise the deadline must be within 30 days. |
| **M-3** | `PumpToken.burn(from, amount)` accepted an arbitrary `from`, granting the curve broad burn privilege. | **Reduced surface** — `BondingCurve.sell()` only ever passes `from = msg.sender`, and `burn` is documented as such. The token implementation is locked behind `_disableInitializers()` so a malicious second curve cannot be bound to it. |
| **M-4** | The web UI hardcoded `initialBuyMinTokens = 0`, eliminating slippage protection on the optional dev buy. | **Fixed** — `web/app/create/page.tsx` now computes a 5%-tolerance `minTokens` from the deterministic curve formula before signing. |
| **M-5** | `tok.transfer` was checked with a `require` string. | **Fixed** — uses a custom error and reverts via `TransferFailed`. The token is the trusted PumpToken so SafeERC20 is not strictly needed, but the contract is now consistent. |
| **M-6** | `TokenComments` rate-limited by `block.number + 15`, meaningless on a fast L2. | **Fixed** — switched to a 30-second timestamp-based cooldown. |
| **M-7** | `TokenComments` accepted comments against any address, not just real launched tokens. | **Fixed** — `postComment` now requires `factory.tokenIndexPlusOne(token) > 0`. |
| **M-8** | XSS via user-supplied `twitter`/`telegram`/`website`/`imageURI` rendered into `href`/`src` (allowing `javascript:` injection). | **Fixed** — `lib/safeUrl.ts` enforces an `http(s)`-only scheme allowlist for hrefs and an explicit `ipfs://` / `ar://` / `https:` allowlist for images. |
| **M-9** | `getLogs` followed by per-log `getBlock` produced N+1 RPC calls in every trade scanner. | **Fixed** — `LiveTicker`, `useCurveStats`, `PriceChart`, and the trades table now collect unique block numbers and batch-fetch them with `Promise.all`. |
| **M-10** | Hardcoded 50k-block scan window. | **Documented** — left as a known limitation pending a real indexer (see roadmap). |

### Low

| ID | Title | Status |
|---|---|---|
| **L-1** | Floor-division rounding favours protocol. | Documented in `BondingCurve` NatSpec. |
| **L-2** | `currentPriceX1e18` divided by `(VIRTUAL_TOKENS - tokensSold)` with no zero check. | Unreachable: `tokensSold ≤ SALE_SUPPLY < VIRTUAL_TOKENS`. Documented. |
| **L-3** | Unbounded metadata strings on PumpToken. | **Fixed** — `MAX_NAME_LEN` (64), `MAX_SYMBOL_LEN` (16), `MAX_URI_LEN` (256), `MAX_DESCRIPTION_LEN` (500) enforced in `initialize()`. |
| **L-4** | No URL scheme validation on metadata. | **Fixed via web** — `safeUrl()` blocks `javascript:`/`data:`/etc. (Solidity intentionally remains permissive: rejecting valid future schemes on-chain would be premature.) |
| **L-5** | One-step `transferOwnership` could lock contract on typo. | **Fixed** — switched factory to `Ownable2Step`. |
| **L-6** | UI hardcoded `limit=100`. | Factory enforces a `MAX_PAGE = 200`; UI still uses 100 for now. Pagination beyond that requires UI work. |
| **L-7** | Comments storage unbounded. | Acceptable on L2; documented. |
| **L-8** | Pinata gateway hardcoded. | Tracked as roadmap; client-side `safeImageUrl` already supports `ipfs://` resolution so a swap is straightforward. |
| **L-9** | `<img>` accepted any scheme via `data:`. | **Fixed** — `safeImageUrl` rejects everything except `http(s)`, `ipfs://`, and `ar://`. |
| **L-10** | `localStorage` watchlist bound. | OK — sanitised + capped at 250. |
| **L-11** | `PriceChart` synthesised candles when ≤ 1 trade existed. | **Fixed** — empty trades now display a real "No trades yet" state. |

### Info

| ID | Title | Status |
|---|---|---|
| **I-1** | `next.config.js` allowed any `http://` image. | **Fixed** — `https`-only + scheme-aware `safeImageUrl`. |
| **I-2** | `next` was unpinned (`^16.2.6`). | **Fixed** — every dep pinned exactly. |
| **I-3** | `Deploy.s.sol` did not deploy `TokenComments`. | **Fixed** — single script now deploys both contracts and prints the env vars to set. |
| **I-4** | Test suite covered only happy-path. | **Fixed** — 36 unit tests, 3 fuzz tests, 4 invariants, 6 comments tests (49 total). |
| **I-5** | `via_ir = true` with caret solc. | Solc pinned to `0.8.24`; `via_ir` retained for optimisation. |
| **I-6** | No CSP, no CI, build/dev logs not gitignored. | **Fixed** — CSP + security headers in `next.config.js`, GitHub Actions for both `contracts` and `web`, `.gitignore` cleaned. |
| **I-7** | Dead deps (`recharts`, `lightweight-charts`). | **Fixed** — removed from `package.json`. |

## 3. Residual risk for external audit

Topics worth special attention:

1. **Constant-product math at the boundaries.** The fuzz suite covers up to 30 zkLTC per buy
   but does not exhaustively explore the `quoteBuy` cap path. An auditor should verify the
   `ceilDiv` reconstruction of `ltcConsumed` against the floor in `K/newX`.
2. **Ownership privileges.** `setFeeRecipient` exists for testnet ergonomics; in production
   you may want this immutable.
3. **Pinata abuse.** Wallet-signature gating raises the bar but is not a hard quota system.
   For mainnet, consider per-address daily limits backed by a durable store.
4. **Indexer.** All on-chain reads in the UI use `getLogs`. As `tokens.length` grows this
   becomes prohibitive; production deployments should replace it with a real indexer.

## 4. Test coverage

| File | Tests |
|---|---|
| `test/BondingCurve.t.sol` | 36 unit tests (launch, buy, sell, deadline, slippage, access control, ownership, reentrancy) |
| `test/BondingCurve.fuzz.t.sol` | 3 fuzz tests (quote-vs-execute parity, K invariant, roundtrip cost) |
| `test/BondingCurve.invariant.t.sol` | 4 invariants (K, balance == reserves, supply == sold, sale cap) |
| `test/TokenComments.t.sol` | 6 unit tests (post, validation, cooldown, pagination) |

`forge test` reports **49 passed, 0 failed** on the latest build.
