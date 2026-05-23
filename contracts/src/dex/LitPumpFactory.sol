// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LitPumpPair} from "./LitPumpPair.sol";

/// @title  LitPumpFactory — Uniswap V2-compatible pair factory
/// @notice Creates one pair per (tokenA, tokenB) tuple, with the canonical
///         CREATE2-derived deterministic address scheme so off-chain code can
///         compute pair addresses without an RPC call.
contract LitPumpFactory {
    mapping(address => mapping(address => address)) private _getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 index);

    error IdenticalAddresses();
    error ZeroAddress();
    error PairExists();

    function getPair(address tokenA, address tokenB) external view returns (address) {
        return _getPair[tokenA][tokenB];
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalAddresses();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (_getPair[token0][token1] != address(0)) revert PairExists();

        // CREATE2 salt is the sorted token tuple — addresses are deterministic.
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        pair = address(new LitPumpPair{salt: salt}(token0, token1));

        _getPair[token0][token1] = pair;
        _getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
