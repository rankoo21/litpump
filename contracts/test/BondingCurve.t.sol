// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2}        from "forge-std/Test.sol";
import {TokenFactory}          from "../src/TokenFactory.sol";
import {BondingCurve}          from "../src/BondingCurve.sol";
import {PumpToken}             from "../src/PumpToken.sol";
import {MockV2Router, MockV2Factory, MockWETH} from "./mocks/MockV2.sol";

contract BondingCurveTest is Test {
    TokenFactory factory;
    address feeRecipient = address(0xFEE);
    address alice        = address(0xA11CE);
    address bob          = address(0xB0B);
    address carol        = address(0xCAFE);

    function setUp() public {
        factory = new TokenFactory(feeRecipient, 0);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob,   1_000 ether);
        vm.deal(carol, 10_000 ether);
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------
    function _params() internal pure returns (TokenFactory.CreateParams memory) {
        return TokenFactory.CreateParams({
            name: "Pepe",
            symbol: "PEPE",
            imageURI: "ipfs://x",
            description: "frog",
            twitter: "",
            telegram: "",
            website: ""
        });
    }

    function _launch(address who) internal returns (PumpToken tok, BondingCurve curve) {
        vm.prank(who);
        (address t, address c) = factory.launch{value: 0}(_params(), 0, 0);
        tok = PumpToken(t);
        curve = BondingCurve(payable(c));
    }

    function _skipAntiSnipe(BondingCurve) internal {
        vm.roll(block.number + 10);
    }

    // -----------------------------------------------------------------
    // Launch tests
    // -----------------------------------------------------------------
    function test_LaunchCreatesTokenAndCurve() public {
        (PumpToken tok, BondingCurve curve) = _launch(alice);
        assertEq(tok.curve(), address(curve));
        assertEq(tok.creator(), alice);
        assertEq(curve.factory(), address(factory));
        assertEq(curve.feeRecipient(), feeRecipient);
        assertEq(curve.creator(), alice);
        assertEq(curve.ltcCollected(), 0);
        assertEq(curve.tokensSold(), 0);
        assertFalse(curve.graduated());
        assertFalse(curve.migrated());
    }

    function test_LaunchRevertsOnEmptyName() public {
        TokenFactory.CreateParams memory p = _params();
        p.name = "";
        vm.prank(alice);
        vm.expectRevert(TokenFactory.EmptyString.selector);
        factory.launch(p, 0, 0);
    }

    function test_LaunchRevertsOnEmptySymbol() public {
        TokenFactory.CreateParams memory p = _params();
        p.symbol = "";
        vm.prank(alice);
        vm.expectRevert(TokenFactory.EmptyString.selector);
        factory.launch(p, 0, 0);
    }

    function test_LaunchRevertsOnInsufficientFee() public {
        factory.setCreationFee(0.01 ether);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(TokenFactory.InsufficientFee.selector);
        factory.launch{value: 0.001 ether}(_params(), 0, 0);
    }

    function test_LaunchCooldownEnforcedPerCreator() public {
        _launch(alice);
        vm.prank(alice);
        vm.expectRevert(TokenFactory.CooldownActive.selector);
        factory.launch(_params(), 0, 0);
        _launch(bob);
        vm.warp(block.timestamp + 31);
        _launch(alice);
    }

    function test_LaunchPaidFeeForwarded() public {
        factory.setCreationFee(0.01 ether);
        uint256 feeBalBefore = feeRecipient.balance;
        vm.prank(alice);
        factory.launch{value: 0.01 ether}(_params(), 0, 0);
        assertEq(feeRecipient.balance - feeBalBefore, 0.01 ether);
    }

    function test_LaunchWithDevBuyMintsToCreator() public {
        factory.setCreationFee(0.01 ether);
        uint256 buyAmt = 0.4 ether;
        vm.prank(alice);
        (address t, ) = factory.launch{value: 0.01 ether + buyAmt}(_params(), 0, 0);
        assertGt(PumpToken(t).balanceOf(alice), 0);
        assertEq(PumpToken(t).balanceOf(address(factory)), 0);
    }

    function test_PauseBlocksLaunch() public {
        factory.pause();
        vm.prank(alice);
        vm.expectRevert();
        factory.launch(_params(), 0, 0);
        factory.unpause();
        _launch(alice);
    }

    function test_OnlyOwnerCanSetFee() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setCreationFee(0.01 ether);
    }

    function test_OnlyOwnerCanPause() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.pause();
    }

    function test_FeeAboveMaxReverts() public {
        vm.expectRevert(TokenFactory.FeeTooHigh.selector);
        factory.setCreationFee(2 ether);
    }

    function test_OwnershipTransferIsTwoStep() public {
        factory.transferOwnership(alice);
        assertEq(factory.owner(), address(this));
        vm.prank(alice);
        factory.acceptOwnership();
        assertEq(factory.owner(), alice);
    }

    function test_OnlyOwnerCanSetDexRouter() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setDexRouter(address(0xCAFE));
    }

    function test_OwnerCanSetAndUnsetDexRouter() public {
        factory.setDexRouter(address(0xCAFE));
        assertEq(factory.dexRouter(), address(0xCAFE));
        factory.setDexRouter(address(0));
        assertEq(factory.dexRouter(), address(0));
    }

    // -----------------------------------------------------------------
    // Buy tests
    // -----------------------------------------------------------------
    function test_BuyMintsTokensAndUpdatesReserves() public {
        (PumpToken tok, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);

        uint256 ltcIn = 1 ether;
        (uint256 expectedOut, uint256 expectedFee, uint256 expectedConsumed) = curve.quoteBuy(ltcIn);
        assertEq(expectedConsumed, ltcIn);

        uint256 protocolBalBefore = feeRecipient.balance;
        uint256 creatorBalBefore  = alice.balance;

        vm.prank(bob);
        uint256 received = curve.buy{value: ltcIn}(0, 0);

        assertEq(received, expectedOut);
        assertEq(tok.balanceOf(bob), expectedOut);
        assertEq(curve.ltcCollected(), ltcIn - expectedFee);

        uint256 expectedCreator  = expectedFee / 2;
        uint256 expectedProtocol = expectedFee - expectedCreator;
        assertEq(feeRecipient.balance - protocolBalBefore, expectedProtocol);
        assertEq(alice.balance - creatorBalBefore, expectedCreator);
    }

    function test_BuyZeroValueReverts() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        vm.prank(bob);
        vm.expectRevert(BondingCurve.ZeroAmount.selector);
        curve.buy{value: 0}(0, 0);
    }

    function test_BuySlippageRevertsCleanly() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        (uint256 expectedOut, , ) = curve.quoteBuy(1 ether);
        vm.prank(bob);
        vm.expectRevert(BondingCurve.SlippageExceeded.selector);
        curve.buy{value: 1 ether}(expectedOut + 1, 0);
    }

    function test_BuyDeadlineExpiredReverts() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        vm.warp(1_000_000);
        uint256 past = block.timestamp - 1;
        vm.prank(bob);
        vm.expectRevert(BondingCurve.DeadlineExpired.selector);
        curve.buy{value: 1 ether}(0, past);
    }

    function test_BuyDeadlineTooFarReverts() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        uint256 farFuture = block.timestamp + 31 days;
        vm.prank(bob);
        vm.expectRevert(BondingCurve.DeadlineTooFar.selector);
        curve.buy{value: 1 ether}(0, farFuture);
    }

    function test_BuyAfterGraduationReverts() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        vm.deal(bob, 200 ether);
        vm.prank(bob);
        curve.buy{value: 100 ether}(0, 0);
        assertTrue(curve.graduated());
        vm.prank(bob);
        vm.expectRevert(BondingCurve.AlreadyGraduated.selector);
        curve.buy{value: 1 ether}(0, 0);
    }

    function test_PriceIncreasesWithBuys() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        uint256 p0 = curve.currentPriceX1e18();
        vm.prank(bob);
        curve.buy{value: 2 ether}(0, 0);
        uint256 p1 = curve.currentPriceX1e18();
        assertGt(p1, p0);
        vm.prank(bob);
        curve.buy{value: 2 ether}(0, 0);
        assertGt(curve.currentPriceX1e18(), p1);
    }

    // ---- Anti-snipe ----
    function test_AntiSnipeBlocksLargeBuyInWindow() public {
        (, BondingCurve curve) = _launch(alice);
        vm.prank(bob);
        vm.expectRevert(BondingCurve.AntiSnipeLimit.selector);
        curve.buy{value: 1 ether}(0, 0);
    }

    function test_AntiSnipeAllowsSmallBuy() public {
        (, BondingCurve curve) = _launch(alice);
        vm.prank(bob);
        curve.buy{value: 0.4 ether}(0, 0);
        vm.prank(bob);
        vm.expectRevert(BondingCurve.AntiSnipeLimit.selector);
        curve.buy{value: 0.2 ether}(0, 0);
    }

    function test_AntiSnipeWindowExpires() public {
        (, BondingCurve curve) = _launch(alice);
        vm.roll(block.number + 5);
        vm.prank(bob);
        curve.buy{value: 5 ether}(0, 0);
    }

    // -----------------------------------------------------------------
    // Sell tests
    // -----------------------------------------------------------------
    function test_SellRoundtripLosesOnlyFees() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        // Use carol as an arms-length trader (alice is creator and would receive
        // the creator-fee share back, distorting the loss check).
        uint256 ltcIn = 5 ether;
        vm.prank(carol);
        uint256 bought = curve.buy{value: ltcIn}(0, 0);

        uint256 balBefore = carol.balance;
        vm.prank(carol);
        uint256 received = curve.sell(bought, 0, 0);
        assertEq(carol.balance - balBefore, received);
        assertLt(received, ltcIn);
        assertGt(received, (ltcIn * 96) / 100);
    }

    function test_SellSlippageRevertsCleanly() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        vm.prank(bob);
        uint256 bought = curve.buy{value: 0.4 ether}(0, 0);
        (uint256 ltcOut, ) = curve.quoteSell(bought);
        vm.prank(bob);
        vm.expectRevert(BondingCurve.SlippageExceeded.selector);
        curve.sell(bought, ltcOut + 1, 0);
    }

    function test_SellMoreThanSoldReverts() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        vm.prank(bob);
        curve.buy{value: 0.4 ether}(0, 0);
        uint256 tooMuch = curve.tokensSold() + 1;
        vm.prank(bob);
        vm.expectRevert(BondingCurve.InsufficientTokens.selector);
        curve.sell(tooMuch, 0, 0);
    }

    function test_QuoteSellRevertsOnExcess() public {
        (, BondingCurve curve) = _launch(alice);
        vm.expectRevert(BondingCurve.InsufficientTokens.selector);
        curve.quoteSell(1);
    }

    // -----------------------------------------------------------------
    // PumpToken access control
    // -----------------------------------------------------------------
    function test_OnlyCurveCanMint() public {
        (PumpToken tok, ) = _launch(alice);
        vm.prank(bob);
        vm.expectRevert(PumpToken.OnlyCurve.selector);
        tok.mint(bob, 1 ether);
    }

    function test_TokenInitializeCannotBeReplayed() public {
        (PumpToken tok, BondingCurve curve) = _launch(alice);
        vm.expectRevert();
        tok.initialize("X","X","","","","","", alice, address(curve));
    }

    function test_CurveInitializeCannotBeReplayed() public {
        (, BondingCurve curve) = _launch(alice);
        vm.expectRevert();
        curve.initialize(address(0xdead), address(this), feeRecipient, alice);
    }

    function test_DirectSendToCurveReverts() public {
        (, BondingCurve curve) = _launch(alice);
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        (bool ok, ) = address(curve).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // -----------------------------------------------------------------
    // Graduation + migration
    // -----------------------------------------------------------------
    function test_GraduationTriggersWithoutRouter() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        vm.deal(bob, 200 ether);
        vm.prank(bob);
        curve.buy{value: 90 ether}(0, 0);
        assertTrue(curve.graduated());
        // No router configured → migration deferred.
        assertFalse(curve.migrated());
    }

    function test_ManualMigrateRevertsIfNoRouter() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        vm.deal(bob, 200 ether);
        vm.prank(bob);
        curve.buy{value: 90 ether}(0, 0);

        vm.expectRevert(BondingCurve.NoRouter.selector);
        curve.migrate();
    }

    function test_MigrateRevertsBeforeGraduation() public {
        (, BondingCurve curve) = _launch(alice);
        vm.expectRevert(BondingCurve.NotGraduated.selector);
        curve.migrate();
    }

    function test_AutoMigrateOnGraduationWhenRouterSet() public {
        // Configure a mock V2 router on the factory.
        MockWETH        weth    = new MockWETH();
        MockV2Factory   v2fac   = new MockV2Factory();
        MockV2Router    router  = new MockV2Router(address(weth), address(v2fac));
        factory.setDexRouter(address(router));

        (PumpToken tok, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);

        vm.deal(bob, 200 ether);
        vm.prank(bob);
        curve.buy{value: 90 ether}(0, 0);

        assertTrue(curve.graduated());
        assertTrue(curve.migrated());
        assertEq(curve.ltcCollected(), 0);

        // Curve no longer holds any zkLTC; it is now in the pool.
        assertEq(address(curve).balance, 0);
        // Router seeded the pool with full LP supply.
        address pair = curve.lpPair();
        assertTrue(pair != address(0));
        assertEq(tok.balanceOf(pair), curve.LP_SUPPLY());
        // No tokens should remain stuck in the curve.
        assertEq(tok.balanceOf(address(curve)), 0);
    }

    function test_ManualMigrateAfterRouterSetLater() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        vm.deal(bob, 200 ether);
        vm.prank(bob);
        curve.buy{value: 90 ether}(0, 0);
        assertTrue(curve.graduated());
        assertFalse(curve.migrated());

        // Now operator configures a router; anyone can call migrate().
        MockWETH      weth   = new MockWETH();
        MockV2Factory v2fac  = new MockV2Factory();
        MockV2Router  router = new MockV2Router(address(weth), address(v2fac));
        factory.setDexRouter(address(router));

        curve.migrate();
        assertTrue(curve.migrated());
        assertEq(address(curve).balance, 0);
    }

    function test_DoubleMigrateReverts() public {
        MockWETH      weth   = new MockWETH();
        MockV2Factory v2fac  = new MockV2Factory();
        MockV2Router  router = new MockV2Router(address(weth), address(v2fac));
        factory.setDexRouter(address(router));

        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        vm.deal(bob, 200 ether);
        vm.prank(bob);
        curve.buy{value: 90 ether}(0, 0);
        assertTrue(curve.migrated());

        vm.expectRevert(BondingCurve.AlreadyMigrated.selector);
        curve.migrate();
    }

    function test_K_HoldsAfterBuy() public {
        (, BondingCurve curve) = _launch(alice);
        _skipAntiSnipe(curve);
        uint256 K = curve.K();

        vm.prank(bob);
        curve.buy{value: 3 ether}(0, 0);

        uint256 x = curve.VIRTUAL_LTC() + curve.ltcCollected();
        uint256 y = curve.VIRTUAL_TOKENS() - curve.tokensSold();
        uint256 prod = x * y;
        assertLe(prod, K);
        assertLt(K - prod, x);
    }

    function test_ListTokensNewestFirst() public {
        _launch(alice);
        vm.warp(block.timestamp + 31);
        _launch(bob);
        TokenFactory.TokenInfo[] memory list = factory.listTokens(0, 10);
        assertEq(list.length, 2);
        assertEq(list[0].creator, bob);
        assertEq(list[1].creator, alice);
    }

    function test_ListTokensRespectsPageCap() public {
        vm.expectRevert(TokenFactory.PageTooLarge.selector);
        factory.listTokens(0, 1_000);
    }
}
