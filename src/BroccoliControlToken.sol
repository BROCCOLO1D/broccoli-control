// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Broccoli Control Token
/// @notice Simple fixture ERC20 for wallet QA flows. Testnet use only.
contract BroccoliControlToken is ERC20, Ownable {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 ether;

    constructor(address initialOwner) ERC20("Broccoli Control Token", "BROC") Ownable(initialOwner) {
        _mint(initialOwner, INITIAL_SUPPLY);
    }

    /// @notice Optional faucet-style mint helper for fixture reset workflows.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
