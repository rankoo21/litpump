// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LitPumpPair is ERC20, ReentrancyGuard {
    uint256 public constant MIN_LIQUIDITY = 1_000;
    uint256 public constant FEE_BPS       = 30;
    uint256 public constant BPS_DENOM     = 10_000;

    address public immutable factory;
    address public immutable token0;
    address public immutable token1;

    uint112 private _reserve0;
    uint112 private _reserve1;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutputAmount();
    error InsufficientLiquidity();
    error InvalidTo();
    error InsufficientInputAmount();
    error KViolation();
    error Overflow();

    constructor(address _token0, address _token1) ERC20("LitPump LP", "LP-LITPUMP") {
        factory = msg.sender;
        token0  = _token0;
        token1  = _token1;
    }

    function getReserves() public view returns (uint112 reserve0, uint112 reserve1) {
        return (_reserve0, _reserve1);
    }

    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint112 r0, uint112 r1) = (_reserve0, _reserve1);
        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = bal0 - r0;
        uint256 amount1 = bal1 - r1;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1);
            if (liquidity <= MIN_LIQUIDITY) revert InsufficientLiquidityMinted();
            unchecked { liquidity -= MIN_LIQUIDITY; }
            _mint(address(0xdEaD), MIN_LIQUIDITY);
        } else {
            uint256 a = (amount0 * _totalSupply) / r0;
            uint256 b = (amount1 * _totalSupply) / r1;
            liquidity = a < b ? a : b;
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();

        _mint(to, liquidity);
        _update(bal0, bal1);
        emit Mint(msg.sender, amount0, amount1, liquidity);
    }

    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * bal0) / _totalSupply;
        amount1 = (liquidity * bal1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _burn(address(this), liquidity);
        _safeTransfer(token0, to, amount0);
        _safeTransfer(token1, to, amount1);

        bal0 = IERC20(token0).balanceOf(address(this));
        bal1 = IERC20(token1).balanceOf(address(this));
        _update(bal0, bal1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint112 r0, uint112 r1) = (_reserve0, _reserve1);
        if (amount0Out >= r0 || amount1Out >= r1) revert InsufficientLiquidity();
        if (to == token0 || to == token1) revert InvalidTo();

        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);

        uint256 bal0 = IERC20(token0).balanceOf(address(this));
        uint256 bal1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0In = bal0 > r0 - amount0Out ? bal0 - (r0 - amount0Out) : 0;
        uint256 amount1In = bal1 > r1 - amount1Out ? bal1 - (r1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        uint256 adj0 = bal0 * BPS_DENOM - amount0In * FEE_BPS;
        uint256 adj1 = bal1 * BPS_DENOM - amount1In * FEE_BPS;
        if (adj0 * adj1 < uint256(r0) * uint256(r1) * (BPS_DENOM ** 2)) revert KViolation();

        _update(bal0, bal1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function _update(uint256 bal0, uint256 bal1) internal {
        if (bal0 > type(uint112).max || bal1 > type(uint112).max) revert Overflow();
        _reserve0 = uint112(bal0);
        _reserve1 = uint112(bal1);
        emit Sync(_reserve0, _reserve1);
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        bool ok = IERC20(token).transfer(to, amount);
        require(ok, "transfer fail");
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
