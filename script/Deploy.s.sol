// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {BroccoliControlToken} from "../src/BroccoliControlToken.sol";

/// @notice Deploys BroccoliControlToken with PRIVATE_KEY's account as owner and initial recipient.
contract Deploy is Script {
    function run() external returns (BroccoliControlToken token) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);
        token = new BroccoliControlToken(deployer);
        vm.stopBroadcast();
    }
}
