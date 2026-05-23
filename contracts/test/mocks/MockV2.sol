// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Test-only stand-in for WETH. Never used; we only need its address.
contract MockWETH {
    string public constant name = "Wrapped LTC";
}

/// @notice Test-only V2-style factory that records pair addresses.
contract MockV2Factory {
    mapping(address => mapping(address => address)) public pairs;

    function getPair(address a, address b) external view returns (address) {
        address pair = pairs[a][b];
        if (pair != address(0)) return pair;
        return pairs[b][a];
    }

    function createPair(address a, address b) external returns (address pair) {
        // The "pair" is just a fresh deterministic address — nothing trades against it
        // in tests, we only assert tokens land there.
        pair = address(uint160(uint256(keccak256(abi.encode(a, b, block.number)))));
        pairs[a][b] = pair;
    }
}

/// @notice Test-only V2 router. Implements just enough of the surface area used by
///         BondingCurve._migrate(): WETH(), factory(), addLiquidityETH().
contract MockV2Router {
    address public immutable WETH_;
    address public immutable factory_;

    constructor(address weth_, address factory__) {
        WETH_   = weth_;
        factory_ = factory__;
    }

    function WETH()    external view returns (address) { return WETH_; }
    function factory() external view returns (address) { return factory_; }

    /// @dev Pulls `amountTokenDesired` tokens from msg.sender, sends them to a freshly
    ///      created pair, returns synthetic LP. Mirrors the V2 behaviour we care about.
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 /*amountTokenMin*/,
        uint256 /*amountETHMin*/,
        address to,
        uint256 /*deadline*/
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        // Create or fetch the pair.
        MockV2Factory f = MockV2Factory(factory_);
        address pair = f.getPair(token, WETH_);
        if (pair == address(0)) pair = f.createPair(token, WETH_);

        // Pull tokens to the pair, keep ETH in the pair representation by leaving it
        // in this contract — adequate for assertions.
        require(IERC20(token).transferFrom(msg.sender, pair, amountTokenDesired), "transferFrom");

        amountToken = amountTokenDesired;
        amountETH   = msg.value;
        // Synthetic LP supply: sqrt(amountToken * amountETH) is the canonical formula but
        // tests only assert non-zero, so use sum.
        liquidity   = amountToken / 1e18 + amountETH;

        // Send LP receipts to `to` — we mint via a simple counter map, no-op for now;
        // the curve only cares that the call returns. To match the real interface we
        // simulate "minting" by transferring nothing — `to` is typically 0xdEaD anyway.
        to;
    }
}
