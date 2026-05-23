// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20}          from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LitPumpPair}     from "./LitPumpPair.sol";
import {LitPumpFactory}  from "./LitPumpFactory.sol";

interface IWLTC {
    function deposit() external payable;
    function withdraw(uint256) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @title  LitPumpRouter — minimal Uniswap V2-style router
/// @notice Implements `addLiquidityETH` (used by `BondingCurve.migrate()`) plus
///         `swapExactETHForTokens` and `swapExactTokensForETH` so the dApp can
///         offer swap UX on graduated tokens. No multi-hop routing — every swap
///         is a single hop through `WLTC`.
contract LitPumpRouter is ReentrancyGuard {
    address public immutable factoryAddr;
    address public immutable wltc;

    error Expired();
    error InsufficientAmount();
    error InsufficientLiquidity();
    error TransferFailed();

    modifier ensure(uint256 deadline) {
        if (deadline != 0 && block.timestamp > deadline) revert Expired();
        _;
    }

    constructor(address _factory, address _wltc) {
        factoryAddr = _factory;
        wltc        = _wltc;
    }

    function factory() external view returns (address) { return factoryAddr; }
    function WETH()    external view returns (address) { return wltc;        }

    // -----------------------------------------------------------------
    // Liquidity
    // -----------------------------------------------------------------

    /// @notice Add token + native ETH liquidity. Called by `BondingCurve.migrate()`.
    ///         Pulls `amountTokenDesired` from msg.sender, wraps msg.value into WLTC,
    ///         and credits LP tokens to `to`.
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        nonReentrant
        ensure(deadline)
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        // Bootstrap: create the pair if it doesn't already exist.
        address pair = LitPumpFactory(factoryAddr).getPair(token, wltc);
        if (pair == address(0)) {
            pair = LitPumpFactory(factoryAddr).createPair(token, wltc);
        }

        (uint256 reserveToken, uint256 reserveETH) = _getReserves(pair, token, wltc);
        if (reserveToken == 0 && reserveETH == 0) {
            // First deposit — caller's amounts set the initial price.
            amountToken = amountTokenDesired;
            amountETH   = msg.value;
        } else {
            // Subsequent deposit — quote against current reserves and pick the
            // optimal pair (whichever side hits its min first).
            uint256 ethOptimal = (amountTokenDesired * reserveETH) / reserveToken;
            if (ethOptimal <= msg.value) {
                if (ethOptimal < amountETHMin) revert InsufficientAmount();
                amountToken = amountTokenDesired;
                amountETH   = ethOptimal;
            } else {
                uint256 tokenOptimal = (msg.value * reserveToken) / reserveETH;
                if (tokenOptimal > amountTokenDesired || tokenOptimal < amountTokenMin) revert InsufficientAmount();
                amountToken = tokenOptimal;
                amountETH   = msg.value;
            }
        }

        // Move tokens to the pair.
        require(IERC20(token).transferFrom(msg.sender, pair, amountToken), "tokenTransferFrom");
        // Wrap exactly amountETH and forward to the pair.
        IWLTC(wltc).deposit{value: amountETH}();
        require(IWLTC(wltc).transfer(pair, amountETH), "wltcTransfer");

        liquidity = LitPumpPair(pair).mint(to);

        // Refund unused native ETH.
        if (msg.value > amountETH) {
            (bool ok, ) = msg.sender.call{value: msg.value - amountETH}("");
            if (!ok) revert TransferFailed();
        }
    }

    // -----------------------------------------------------------------
    // Swaps
    // -----------------------------------------------------------------

    /// @notice Swap native zkLTC for tokens through the WLTC pair.
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable nonReentrant ensure(deadline) returns (uint256 amountOut) {
        require(path.length == 2 && path[0] == wltc, "bad path");
        address token = path[1];
        address pair  = LitPumpFactory(factoryAddr).getPair(token, wltc);
        if (pair == address(0)) revert InsufficientLiquidity();

        // Wrap msg.value and send WLTC to the pair.
        IWLTC(wltc).deposit{value: msg.value}();
        require(IWLTC(wltc).transfer(pair, msg.value), "wltcTransfer");

        (uint256 reserveToken, uint256 reserveETH) = _getReserves(pair, token, wltc);
        amountOut = _getAmountOut(msg.value, reserveETH, reserveToken);
        if (amountOut < amountOutMin) revert InsufficientAmount();

        bool tokenIs0 = token < wltc;
        if (tokenIs0) {
            LitPumpPair(pair).swap(amountOut, 0, to);
        } else {
            LitPumpPair(pair).swap(0, amountOut, to);
        }
    }

    /// @notice Swap tokens for native zkLTC. The user must approve `amountIn`
    ///         tokens to the router beforehand.
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant ensure(deadline) returns (uint256 amountOut) {
        require(path.length == 2 && path[1] == wltc, "bad path");
        address token = path[0];
        address pair  = LitPumpFactory(factoryAddr).getPair(token, wltc);
        if (pair == address(0)) revert InsufficientLiquidity();

        require(IERC20(token).transferFrom(msg.sender, pair, amountIn), "tokenIn");

        (uint256 reserveToken, uint256 reserveETH) = _getReserves(pair, token, wltc);
        amountOut = _getAmountOut(amountIn, reserveToken, reserveETH);
        if (amountOut < amountOutMin) revert InsufficientAmount();

        bool tokenIs0 = token < wltc;
        if (tokenIs0) {
            LitPumpPair(pair).swap(0, amountOut, address(this));
        } else {
            LitPumpPair(pair).swap(amountOut, 0, address(this));
        }

        // Unwrap and forward to user.
        IWLTC(wltc).withdraw(amountOut);
        (bool ok, ) = to.call{value: amountOut}("");
        if (!ok) revert TransferFailed();
    }

    // -----------------------------------------------------------------
    // Quote helpers (UI-callable, view)
    // -----------------------------------------------------------------

    /// @notice Pure quote — given an input amount and reserves, returns the
    ///         output amount after the 0.30% fee. UI uses this to pre-compute
    ///         price impact and minOut without a state mutation.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        external pure returns (uint256)
    {
        return _getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        if (amountIn == 0)                        revert InsufficientAmount();
        if (reserveIn == 0 || reserveOut == 0)    revert InsufficientLiquidity();
        // 0.30% fee — must mirror LitPumpPair.{FEE_BPS,BPS_DENOM} exactly.
        uint256 amountInWithFee = amountIn * (10_000 - 30);
        uint256 numerator   = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 10_000 + amountInWithFee;
        return numerator / denominator;
    }

    function _getReserves(address pair, address tokenA, address tokenB)
        internal view returns (uint256 reserveA, uint256 reserveB)
    {
        (uint112 r0, uint112 r1) = LitPumpPair(pair).getReserves();
        return tokenA < tokenB ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
    }

    receive() external payable {
        // Only allow inbound ETH from the WLTC contract during `withdraw()`.
        require(msg.sender == wltc, "only wltc");
    }
}
