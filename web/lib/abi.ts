// Hand-curated ABIs for the four contracts. After `forge build`, you can also import
// the full artifacts from `contracts/out/*.json` — but these slim ABIs are enough for the UI.

export const FACTORY_ABI = [
  {
    type: "function",
    name: "launch",
    stateMutability: "payable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "imageURI", type: "string" },
          { name: "description", type: "string" },
          { name: "twitter", type: "string" },
          { name: "telegram", type: "string" },
          { name: "website", type: "string" },
        ],
      },
      { name: "initialBuyMinTokens", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "tokenAddr", type: "address" },
      { name: "curveAddr", type: "address" },
    ],
  },
  { type: "function", name: "tokensCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "creationFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "dexRouter",   stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "lpRecipient", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "tokenIndexPlusOne",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getToken",
    stateMutability: "view",
    inputs: [{ name: "i", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "curve", type: "address" },
          { name: "creator", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "imageURI", type: "string" },
          { name: "description", type: "string" },
          { name: "twitter", type: "string" },
          { name: "telegram", type: "string" },
          { name: "website", type: "string" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "listTokens",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "curve", type: "address" },
          { name: "creator", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "imageURI", type: "string" },
          { name: "description", type: "string" },
          { name: "twitter", type: "string" },
          { name: "telegram", type: "string" },
          { name: "website", type: "string" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "TokenLaunched",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "imageURI", type: "string", indexed: false },
      { name: "index", type: "uint256", indexed: false },
    ],
  },
] as const;

export const CURVE_ABI = [
  { type: "function", name: "currentPriceX1e18", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "marketCapLtc", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduationProgressX1e18", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ltcCollected", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokensSold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduated", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "migrated",  stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "lpPair",    stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "launchBlock", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ANTI_SNIPE_BLOCKS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ANTI_SNIPE_PER_ADDR_LIMIT", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "antiSnipeSpent",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [{ name: "ltcIn", type: "uint256" }],
    outputs: [
      { name: "tokensOut", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "ltcConsumed", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteSell",
    stateMutability: "view",
    inputs: [{ name: "tokensIn", type: "uint256" }],
    outputs: [
      { name: "ltcOut", type: "uint256" },
      { name: "fee", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "minTokensOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokensIn", type: "uint256" },
      { name: "minLtcOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Bought",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "ltcIn", type: "uint256", indexed: false },
      { name: "ltcRefunded", type: "uint256", indexed: false },
      { name: "tokensOut", type: "uint256", indexed: false },
      { name: "protocolFee", type: "uint256", indexed: false },
      { name: "creatorFee", type: "uint256", indexed: false },
      { name: "newPriceX1e18", type: "uint256", indexed: false },
      { name: "ltcCollected", type: "uint256", indexed: false },
      { name: "tokensSold", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Sold",
    inputs: [
      { name: "seller", type: "address", indexed: true },
      { name: "tokensIn", type: "uint256", indexed: false },
      { name: "ltcOut", type: "uint256", indexed: false },
      { name: "protocolFee", type: "uint256", indexed: false },
      { name: "creatorFee", type: "uint256", indexed: false },
      { name: "newPriceX1e18", type: "uint256", indexed: false },
      { name: "ltcCollected", type: "uint256", indexed: false },
      { name: "tokensSold", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Graduated",
    inputs: [
      { name: "ltcRaised", type: "uint256", indexed: false },
      { name: "tokensSold", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Migrated",
    inputs: [
      { name: "router",          type: "address", indexed: true },
      { name: "pair",            type: "address", indexed: true },
      { name: "ltcDeposited",    type: "uint256", indexed: false },
      { name: "tokensDeposited", type: "uint256", indexed: false },
      { name: "lpMinted",        type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "migrate",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export const COMMENTS_ABI = [
  {
    type: "function",
    name: "postComment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "text", type: "string" },
    ],
    outputs: [{ name: "commentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getComments",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "author", type: "address" },
          { name: "token", type: "address" },
          { name: "createdAt", type: "uint64" },
          { name: "text", type: "string" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "CommentPosted",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "author", type: "address", indexed: true },
      { name: "commentId", type: "uint256", indexed: true },
      { name: "text", type: "string", indexed: false },
      { name: "createdAt", type: "uint256", indexed: false },
    ],
  },
] as const;


// =============================================================================
// LitPump DEX (Uniswap V2-compatible fork)
// =============================================================================

export const DEX_ROUTER_ABI = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "WETH",    stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "getAmountOut",
    stateMutability: "pure",
    inputs: [
      { name: "amountIn",   type: "uint256" },
      { name: "reserveIn",  type: "uint256" },
      { name: "reserveOut", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "swapExactETHForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path",         type: "address[]" },
      { name: "to",           type: "address" },
      { name: "deadline",     type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "swapExactTokensForETH",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn",     type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path",         type: "address[]" },
      { name: "to",           type: "address" },
      { name: "deadline",     type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const DEX_FACTORY_ABI = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

export const DEX_PAIR_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
    ],
  },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;
