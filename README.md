# LitPump

A memecoin launchpad on **LitVM** (Litecoin's L2). Launch your own token in
one click, trade it on a bonding curve, and watch it graduate to the built-in
DEX once it raises 85 zkLTC.

Live: **https://litpump.fun**

## How it works

1. **Connect your wallet** — any EVM wallet on the LitVM LiteForge testnet
   (chain ID `4441`). The app prompts you to add the network if it's missing.
2. **Get testnet zkLTC** — grab some from
   [liteforge.hub.caldera.xyz](https://liteforge.hub.caldera.xyz/).
3. **Launch a token** — click *Launch* in the header, fill in a name, symbol,
   and image. The token starts trading immediately on a bonding curve.
4. **Trade** — buy or sell on any token's page. Price moves with each trade
   along the curve. 1% fee per trade, split 50/50 between the creator and the
   protocol.
5. **Graduate** — once a token's curve collects 85 zkLTC, it auto-migrates to
   the built-in DEX. Liquidity is locked, and the token continues trading
   against zkLTC on the AMM.

## Features

- Anti-snipe: the first 3 blocks after launch cap each address at 0.5 zkLTC.
- Creator fee share: 50% of every trade fee goes to whoever launched the token.
- Slippage and deadline protection on every trade.
- On-chain comments per token, rate-limited at 30s per author.
- A built-in Uniswap V2-style DEX so graduated tokens keep trading on the same site.

## License

MIT
