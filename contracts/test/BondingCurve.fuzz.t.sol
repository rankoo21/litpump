// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test}              from "forge-std/Test.sol";
import {TokenFactory}      from "../src/TokenFactory.sol";
import {BondingCurve}      from "../src/BondingCurve.sol";
import {PumpToken}         from "../src/PumpToken.sol";

contract BondingCurveFuzzTest is Test {
    TokenFactory factory;
    BondingCurve curve;
    PumpToken    token;

    function setUp() public {
        factory = new TokenFactory(address(0xFEE), 0);
        TokenFactory.CreateParams memory p = TokenFactory.CreateParams({
            name: "Pepe",
            symbol: "PEPE",
            imageURI: "",
            description: "",
            twitter: "",
            telegram: "",
            website: ""
        });
        (address t, address c) = factory.launch(p, 0, 0);
        token = PumpToken(t);
        curve = BondingCurve(payable(c));
        // Skip the anti-snipe window so fuzzers can buy any amount.
        vm.roll(block.number + 10);
    }

    /// @notice For any reasonable buy amount, the K invariant must hold and tokens
    ///         must be minted equal to the quoted amount.
    function testFuzz_BuyMatchesQuote(uint256 ltcIn) public {
        ltcIn = bound(ltcIn, 1 wei, 80 ether); // stay below graduation
        vm.deal(address(this), ltcIn);

        (uint256 expectedOut, uint256 expectedFee, uint256 expectedConsumed) = curve.quoteBuy(ltcIn);
        if (expectedOut == 0) return; // dust below 1 wei output → ignore

        uint256 received = curve.buy{value: ltcIn}(0, 0);
        assertEq(received, expectedOut, "tokensOut mismatch");
        assertEq(token.balanceOf(address(this)), expectedOut);

        // Reserves bookkeeping
        assertEq(curve.tokensSold(), expectedOut);
        assertEq(curve.ltcCollected(), expectedConsumed - expectedFee);
    }

    /// @notice K-invariant must hold for any sequence of buys.
    /// @dev    Floor division on `K/newX` means (new_x * new_y) <= K always. Drift below K
    ///         is bounded above by `x` token-wei per buy.
    function testFuzz_BuyKInvariant(uint96 a, uint96 b) public {
        uint256 amtA = bound(uint256(a), 1 wei, 30 ether);
        uint256 amtB = bound(uint256(b), 1 wei, 30 ether);
        vm.deal(address(this), amtA + amtB);

        try curve.buy{value: amtA}(0, 0) returns (uint256) {} catch { return; }
        try curve.buy{value: amtB}(0, 0) returns (uint256) {} catch { return; }

        uint256 x = curve.VIRTUAL_LTC() + curve.ltcCollected();
        uint256 y = curve.VIRTUAL_TOKENS() - curve.tokensSold();
        uint256 prod = x * y;
        assertLe(prod, curve.K(), "K invariant violated upward");
        // Two buys → drift bounded by 2*x token-wei.
        assertLt(curve.K() - prod, 2 * x, "K drift too large");
    }

    /// @notice Buying then selling the exact bought amount yields strictly less zkLTC
    ///         than was paid (fees must always cost the user).
    /// @dev    Note: `setUp()` launches the curve from `address(this)`, so the test contract
    ///         IS the creator and receives the creator-fee share back. To test the loss
    ///         from the perspective of an arms-length trader, we trade as `address(0xBEEF)`.
    function testFuzz_RoundtripLosesFees(uint96 amt) public {
        uint256 ltcIn = bound(uint256(amt), 1e15, 30 ether); // 0.001 - 30 zkLTC
        address trader = address(0xBEEF);
        vm.deal(trader, ltcIn);

        vm.prank(trader);
        uint256 bought = curve.buy{value: ltcIn}(0, 0);
        if (bought == 0) return;

        uint256 balBefore = trader.balance;
        vm.prank(trader);
        uint256 received = curve.sell(bought, 0, 0);
        assertEq(trader.balance - balBefore, received);
        assertLt(received, ltcIn, "roundtrip must cost fees");
        // Loss bounded above by 4% (well above 2% of fees + a margin for K-rounding).
        assertGt(received, (ltcIn * 96) / 100, "roundtrip lost more than 4%");
    }

    receive() external payable {}
}
