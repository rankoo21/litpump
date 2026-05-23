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
        address pair = LitPumpFactory(factoryAddr).getPair(token, wltc);
        if (pair == address(0)) {
            pair = LitPumpFactory(factoryAddr).createPair(token, wltc);
        }

        (uint256 reserveToken, uint256 reserveETH) = _getReserves(pair, token, wltc);
        if (reserveToken == 0 && reserveETH == 0) {
            amountToken = amountTokenDesired;
            amountETH   = msg.value;
        } else {
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

        require(IERC20(token).transferFrom(msg.sender, pair, amountToken), "tokenTransferFrom");
        IWLTC(wltc).deposit{value: amountETH}();
        require(IWLTC(wltc).transfer(pair, amountETH), "wltcTransfer");

        liquidity = LitPumpPair(pair).mint(to);

        if (msg.value > amountETH) {
            (bool ok, ) = msg.sender.call{value: msg.value - amountETH}("");
            if (!ok) revert TransferFailed();
        }
    }

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

        IWLTC(wltc).withdraw(amountOut);
        (bool ok, ) = to.call{value: amountOut}("");
        if (!ok) revert TransferFailed();
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        external pure returns (uint256)
    {
        return _getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        if (amountIn == 0)                        revert InsufficientAmount();
        if (reserveIn == 0 || reserveOut == 0)    revert InsufficientLiquidity();
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
        require(msg.sender == wltc, "only wltc");
    }
}
