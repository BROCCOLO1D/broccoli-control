// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";
import {BroccoliControlToken} from "../src/BroccoliControlToken.sol";

contract BroccoliControlTokenTest is Test {
    BroccoliControlToken internal token;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new BroccoliControlToken(owner);
    }

    function testMetadataAndInitialSupply() public view {
        assertEq(token.name(), "Broccoli Control Token");
        assertEq(token.symbol(), "BROC");
        assertEq(token.decimals(), 18);
        assertEq(token.INITIAL_SUPPLY(), 1_000_000 ether);
        assertEq(token.totalSupply(), 1_000_000 ether);
        assertEq(token.balanceOf(owner), 1_000_000 ether);
        assertEq(token.owner(), owner);
    }

    function testOwnerCanMintFixtureBalance() public {
        vm.prank(owner);
        token.mint(alice, 250 ether);

        assertEq(token.balanceOf(alice), 250 ether);
        assertEq(token.totalSupply(), 1_000_250 ether);
    }

    function testNonOwnerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.mint(alice, 1 ether);
    }

    function testHolderCanTransfer() public {
        vm.prank(owner);
        assertTrue(token.transfer(alice, 100 ether));

        vm.prank(alice);
        assertTrue(token.transfer(bob, 40 ether));

        assertEq(token.balanceOf(alice), 60 ether);
        assertEq(token.balanceOf(bob), 40 ether);
    }
}
