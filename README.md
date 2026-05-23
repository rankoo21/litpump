# LitPump

pump.fun on LitVM (Litecoin's L2 testnet).

Launch a token in one tx, trade it on a bonding curve, and once 85 zkLTC are
raised the curve graduates: liquidity gets seeded on the built-in DEX and the
LP gets burned. Creators keep 50% of the trading fees.

Testnet only.

## Network

- Chain ID `4441`
- RPC `https://liteforge.rpc.caldera.xyz/http`
- Explorer https://liteforge.explorer.caldera.xyz
- Faucet https://liteforge.hub.caldera.xyz/

## Deployed contracts (LiteForge testnet)

```
TokenFactory   0x74e648c412EE36E543D208E7c2c9552a81AFe47c
TokenComments  0x5c4D46F6b089fE6b4bd8E4f4B621D15B5EC87E99
DEX Router     0x1926cA6dcD165Bcea9912Eae51F0279b3AD16541
DEX Factory    0xeAb6b1eDB3b5eF2254119235eA7f9b6B4426A924
WLTC           0xAe17Ee3EEA585a1FEE19b41A6d76F8DAcf87aC50
```

## Local dev

Drop a `web/.env.local` with the addresses above (`NEXT_PUBLIC_FACTORY_ADDRESS`,
`NEXT_PUBLIC_COMMENTS_ADDRESS`, `NEXT_PUBLIC_DEX_ROUTER`, `NEXT_PUBLIC_DEX_FACTORY`,
`NEXT_PUBLIC_WLTC`) and a `PINATA_JWT` if you want image uploads to work, then:

```
cd web
npm i
npm run dev
```

Contracts:

```
cd contracts
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge test
```

## License

MIT
