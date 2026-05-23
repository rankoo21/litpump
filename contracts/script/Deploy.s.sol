// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2}  from "forge-std/Script.sol";
import {TokenFactory}      from "../src/TokenFactory.sol";
import {TokenComments}     from "../src/TokenComments.sol";
import {LitPumpFactory}    from "../src/dex/LitPumpFactory.sol";
import {WLTC}              from "../src/dex/WLTC.sol";
import {LitPumpRouter}     from "../src/dex/LitPumpRouter.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk           = vm.envUint("PRIVATE_KEY");
        address deployer     = vm.addr(pk);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint256 creationFee  = vm.envOr("CREATION_FEE", uint256(0));

        vm.startBroadcast(pk);

        WLTC             wltc        = new WLTC();
        LitPumpFactory   pairFactory = new LitPumpFactory();
        LitPumpRouter    router      = new LitPumpRouter(address(pairFactory), address(wltc));

        TokenFactory  factory  = new TokenFactory(feeRecipient, creationFee);
        TokenComments comments = new TokenComments(address(factory));

        factory.setDexRouter(address(router));

        vm.stopBroadcast();

        console2.log("WLTC          :", address(wltc));
        console2.log("PairFactory   :", address(pairFactory));
        console2.log("Router        :", address(router));
        console2.log("TokenFactory  :", address(factory));
        console2.log("TokenComments :", address(comments));
    }
}
