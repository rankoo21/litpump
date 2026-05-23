// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test}            from "forge-std/Test.sol";
import {TokenFactory}    from "../src/TokenFactory.sol";
import {TokenComments}   from "../src/TokenComments.sol";

contract TokenCommentsTest is Test {
    TokenFactory  factory;
    TokenComments comments;
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        factory  = new TokenFactory(address(0xFEE), 0);
        comments = new TokenComments(address(factory));
    }

    function _launch(address who) internal returns (address tok) {
        TokenFactory.CreateParams memory p = TokenFactory.CreateParams({
            name: "P", symbol: "P", imageURI: "", description: "", twitter: "", telegram: "", website: ""
        });
        vm.prank(who);
        (tok, ) = factory.launch(p, 0, 0);
    }

    function test_PostCommentEmitsAndStores() public {
        address tok = _launch(alice);
        vm.prank(bob);
        uint256 id = comments.postComment(tok, "gm");
        TokenComments.Comment memory c = comments.getComment(id);
        assertEq(c.author, bob);
        assertEq(c.token, tok);
        assertEq(c.text, "gm");
        assertEq(comments.tokenCommentsCount(tok), 1);
    }

    function test_RejectsUnknownToken() public {
        vm.prank(bob);
        vm.expectRevert(TokenComments.UnknownToken.selector);
        comments.postComment(address(0xDEAD), "spam");
    }

    function test_RejectsEmpty() public {
        address tok = _launch(alice);
        vm.prank(bob);
        vm.expectRevert(TokenComments.EmptyText.selector);
        comments.postComment(tok, "");
    }

    function test_RejectsTooLong() public {
        address tok = _launch(alice);
        bytes memory big = new bytes(281);
        for (uint256 i = 0; i < 281; i++) big[i] = "a";
        vm.prank(bob);
        vm.expectRevert(TokenComments.TextTooLong.selector);
        comments.postComment(tok, string(big));
    }

    function test_CooldownEnforced() public {
        address tok = _launch(alice);
        vm.prank(bob);
        comments.postComment(tok, "gm");
        vm.prank(bob);
        vm.expectRevert(TokenComments.CooldownActive.selector);
        comments.postComment(tok, "gm2");

        vm.warp(block.timestamp + 31);
        vm.prank(bob);
        comments.postComment(tok, "gm3");
    }

    function test_PaginationCap() public {
        address tok = _launch(alice);
        vm.expectRevert(TokenComments.PageTooLarge.selector);
        comments.getComments(tok, 0, 1_000);
    }
}
