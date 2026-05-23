// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2}  from "forge-std/Script.sol";
import {TokenFactory}      from "../src/TokenFactory.sol";
import {TokenComments}     from "../src/TokenComments.sol";
import {LitPumpFactory}    from "../src/dex/LitPumpFactory.sol";
import {WLTC}              from "../src/dex/WLTC.sol";
import {LitPumpRouter}     from "../src/dex/LitPumpRouter.sol";

/// @notice Deploys the full LitPump stack:
///   - DEX (WLTC + Pair Factory + Router)
///   - Token launchpad (TokenFactory + TokenComments)
///   - Wires the launchpad to the DEX so future graduations auto-migrate
contract Deploy is Script {
    function run() external {
        uint256 pk           = vm.envUint("PRIVATE_KEY");
        address deployer     = vm.addr(pk);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint256 creationFee  = vm.envOr("CREATION_FEE", uint256(0));

        vm.startBroadcast(pk);

        // 1. DEX core
        WLTC             wltc       = new WLTC();
        LitPumpFactory   pairFactory = new LitPumpFactory();
        LitPumpRouter    router     = new LitPumpRouter(address(pairFactory), address(wltc));

        // 2. Launchpad
        TokenFactory  factory  = new TokenFactory(feeRecipient, creationFee);
        TokenComments comments = new TokenComments(address(factory));

        // 3. Wire the router so graduating curves auto-seed liquidity.
        factory.setDexRouter(address(router));

        vm.stopBroadcast();

        console2.log("Deployer        :", deployer);
        console2.log("");
        console2.log("--- DEX ---");
        console2.log("WLTC            :", address(wltc));
        console2.log("PairFactory     :", address(pairFactory));
        console2.log("Router          :", address(router));
        console2.log("");
        console2.log("--- Launchpad ---");
        console2.log("TokenFactory    :", address(factory));
        console2.log("TokenComments   :", address(comments));
        console2.log("FeeRecipient    :", feeRecipient);
        console2.log("CreationFee     :", creationFee);
        console2.log("");
        console2.log("Set in web/.env.local:");
        console2.log("  NEXT_PUBLIC_FACTORY_ADDRESS  =", address(factory));
        console2.log("  NEXT_PUBLIC_COMMENTS_ADDRESS =", address(comments));
        console2.log("  NEXT_PUBLIC_DEX_ROUTER       =", address(router));
        console2.log("  NEXT_PUBLIC_DEX_FACTORY      =", address(pairFactory));
        console2.log("  NEXT_PUBLIC_WLTC             =", address(wltc));
    }
}
