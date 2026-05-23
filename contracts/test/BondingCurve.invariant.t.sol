// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, StdInvariant} from "forge-std/Test.sol";
import {TokenFactory}       from "../src/TokenFactory.sol";
import {BondingCurve}       from "../src/BondingCurve.sol";
import {PumpToken}          from "../src/PumpToken.sol";

/// @dev Handler that performs constrained random buys and sells against a single curve.
contract CurveHandler is Test {
    BondingCurve public curve;
    PumpToken    public token;
    address[]    public actors;
    uint256      public totalLtcDeposited;
    uint256      public totalLtcWithdrawn;

    constructor(BondingCurve _curve, PumpToken _token) {
        curve = _curve;
        token = _token;
        actors.push(address(0xA1));
        actors.push(address(0xA2));
        actors.push(address(0xA3));
        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 10_000 ether);
        }
    }

    function buy(uint256 actorSeed, uint96 amt) external {
        if (curve.graduated()) return;
        address a = actors[actorSeed % actors.length];
        uint256 v = bound(uint256(amt), 1e14, 5 ether);
        uint256 balBefore = a.balance;
        vm.prank(a);
        try curve.buy{value: v}(0, 0) returns (uint256) {
            totalLtcDeposited += (balBefore - a.balance);
        } catch {}
    }

    function sell(uint256 actorSeed, uint96 fracSeed) external {
        if (curve.graduated()) return;
        address a = actors[actorSeed % actors.length];
        uint256 bal = token.balanceOf(a);
        if (bal == 0) return;
        uint256 frac = bound(uint256(fracSeed), 1, 100);
        uint256 amt = (bal * frac) / 100;
        if (amt == 0) return;
        uint256 ethBefore = a.balance;
        vm.prank(a);
        try curve.sell(amt, 0, 0) returns (uint256) {
            totalLtcWithdrawn += (a.balance - ethBefore);
        } catch {}
    }
}

contract BondingCurveInvariantTest is StdInvariant, Test {
    TokenFactory factory;
    CurveHandler handler;
    BondingCurve curve;
    PumpToken    token;
    address      feeRecipient = address(0xFEE);

    function setUp() public {
        factory = new TokenFactory(feeRecipient, 0);
        TokenFactory.CreateParams memory p = TokenFactory.CreateParams({
            name: "T", symbol: "T", imageURI: "", description: "", twitter: "", telegram: "", website: ""
        });
        (address t, address c) = factory.launch(p, 0, 0);
        token = PumpToken(t);
        curve = BondingCurve(payable(c));
        // Skip the anti-snipe window so the handler can buy freely.
        vm.roll(block.number + 10);
        handler = new CurveHandler(curve, token);

        targetContract(address(handler));
    }

    /// @notice The constant-product invariant must always hold (rounding direction).
    /// @dev    Floor on `K/newX` (and `K/newY` on sell) means (new_x * new_y) <= K always.
    ///         Drift below K can accumulate across many trades and is not bounded by a
    ///         simple closed form, so we only assert the rounding direction here. The
    ///         strict per-operation bound is covered by `BondingCurveFuzzTest`.
    function invariant_K() public view {
        uint256 x = curve.VIRTUAL_LTC() + curve.ltcCollected();
        uint256 y = curve.VIRTUAL_TOKENS() - curve.tokensSold();
        assertLe(x * y, curve.K());
    }

    /// @notice The curve's native balance must always be exactly its bookkept reserves.
    ///         (Fees are forwarded immediately; there's no other source of native ETH.
    ///         After migration, both the balance and `ltcCollected` are zero.)
    function invariant_BalanceMatchesReserves() public view {
        assertEq(address(curve).balance, curve.ltcCollected());
    }

    /// @notice Token total supply must equal the curve's tokensSold counter while on
    ///         the bonding curve, and `tokensSold + LP_SUPPLY` after migration.
    function invariant_SupplyMatchesSold() public view {
        uint256 expected = curve.tokensSold();
        if (curve.migrated()) expected += curve.LP_SUPPLY();
        assertEq(token.totalSupply(), expected);
    }

    /// @notice Tokens sold can never exceed SALE_SUPPLY.
    function invariant_SaleSupplyCap() public view {
        assertLe(curve.tokensSold(), curve.SALE_SUPPLY());
    }
}
