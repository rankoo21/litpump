// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable}    from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard}  from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}           from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PumpToken}        from "./PumpToken.sol";
import {IUniswapV2Router02, IUniswapV2Factory} from "./IUniswapV2Router02.sol";

interface IFactoryConfig {
    function dexRouter()   external view returns (address);
    function lpRecipient() external view returns (address);
}

contract BondingCurve is Initializable, ReentrancyGuard {
    uint256 public constant TOTAL_SUPPLY        = 1_000_000_000 ether;
    uint256 public constant SALE_SUPPLY         = 800_000_000 ether;
    uint256 public constant LP_SUPPLY           = 200_000_000 ether;
    uint256 public constant VIRTUAL_LTC         = 30 ether;
    uint256 public constant VIRTUAL_TOKENS      = 1_073_000_000 ether;
    uint256 public constant K                   = VIRTUAL_LTC * VIRTUAL_TOKENS;
    uint256 public constant GRADUATION_LTC      = 85 ether;

    uint256 public constant FEE_BPS             = 100;
    uint256 public constant CREATOR_FEE_BPS     = 50;
    uint256 public constant BPS_DENOM           = 10_000;
    uint256 public constant MAX_DEADLINE_SKEW   = 30 days;

    uint256 public constant ANTI_SNIPE_BLOCKS         = 3;
    uint256 public constant ANTI_SNIPE_PER_ADDR_LIMIT = 0.5 ether;

    PumpToken public token;
    address   public factory;
    address   public feeRecipient;
    address   public creator;
    uint256   public launchBlock;

    uint256 public ltcCollected;
    uint256 public tokensSold;
    bool    public graduated;
    bool    public migrated;
    address public lpPair;

    mapping(address => uint256) public antiSnipeSpent;

    event Bought(
        address indexed buyer,
        uint256 ltcIn,
        uint256 ltcRefunded,
        uint256 tokensOut,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 newPriceX1e18,
        uint256 ltcCollected,
        uint256 tokensSold
    );
    event Sold(
        address indexed seller,
        uint256 tokensIn,
        uint256 ltcOut,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 newPriceX1e18,
        uint256 ltcCollected,
        uint256 tokensSold
    );
    event Graduated(uint256 ltcRaised, uint256 tokensSold);
    event Migrated(
        address indexed router,
        address indexed pair,
        uint256 ltcDeposited,
        uint256 tokensDeposited,
        uint256 lpMinted
    );

    error AlreadyGraduated();
    error ZeroAmount();
    error SlippageExceeded();
    error InsufficientTokens();
    error TransferFailed();
    error DeadlineExpired();
    error DeadlineTooFar();
    error ZeroAddress();
    error AntiSnipeLimit();
    error NotGraduated();
    error AlreadyMigrated();
    error NoRouter();

    modifier notGraduated() {
        if (graduated) revert AlreadyGraduated();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _token,
        address _factory,
        address _feeRecipient,
        address _creator
    ) external initializer {
        if (
            _token == address(0) ||
            _factory == address(0) ||
            _feeRecipient == address(0) ||
            _creator == address(0)
        ) revert ZeroAddress();
        token        = PumpToken(_token);
        factory      = _factory;
        feeRecipient = _feeRecipient;
        creator      = _creator;
        launchBlock  = block.number;
    }

    function currentPriceX1e18() public view returns (uint256) {
        uint256 x = VIRTUAL_LTC + ltcCollected;
        uint256 y = VIRTUAL_TOKENS - tokensSold;
        return (x * 1e18) / y;
    }

    function quoteBuy(uint256 ltcIn)
        public
        view
        returns (uint256 tokensOut, uint256 fee, uint256 ltcConsumed)
    {
        if (ltcIn == 0) return (0, 0, 0);

        fee = (ltcIn * FEE_BPS) / BPS_DENOM;
        uint256 ltcNet = ltcIn - fee;

        uint256 x    = VIRTUAL_LTC + ltcCollected;
        uint256 y    = VIRTUAL_TOKENS - tokensSold;
        uint256 newX = x + ltcNet;
        uint256 newY = K / newX;
        tokensOut    = y - newY;

        uint256 remaining = SALE_SUPPLY - tokensSold;
        if (tokensOut > remaining) {
            tokensOut = remaining;
            uint256 newYCapped = y - tokensOut;
            uint256 newXCapped = K / newYCapped;
            uint256 ltcNetUsed = newXCapped - x;
            uint256 numer = ltcNetUsed * BPS_DENOM;
            uint256 denom = BPS_DENOM - FEE_BPS;
            ltcConsumed = (numer + denom - 1) / denom;
            if (ltcConsumed > ltcIn) ltcConsumed = ltcIn;
            fee = ltcConsumed > ltcNetUsed ? ltcConsumed - ltcNetUsed : 0;
        } else {
            ltcConsumed = ltcIn;
        }
    }

    function quoteSell(uint256 tokensIn) public view returns (uint256 ltcOut, uint256 fee) {
        if (tokensIn == 0) return (0, 0);
        if (tokensIn > tokensSold) revert InsufficientTokens();

        uint256 x        = VIRTUAL_LTC + ltcCollected;
        uint256 y        = VIRTUAL_TOKENS - tokensSold;
        uint256 newY     = y + tokensIn;
        uint256 newX     = K / newY;
        uint256 grossLtc = x - newX;

        fee    = (grossLtc * FEE_BPS) / BPS_DENOM;
        ltcOut = grossLtc - fee;
    }

    function graduationProgressX1e18() external view returns (uint256) {
        if (ltcCollected >= GRADUATION_LTC) return 1e18;
        return (ltcCollected * 1e18) / GRADUATION_LTC;
    }

    function marketCapLtc() external view returns (uint256) {
        return (currentPriceX1e18() * TOTAL_SUPPLY) / 1e18;
    }

    function buy(uint256 minTokensOut, uint256 deadline)
        external
        payable
        notGraduated
        nonReentrant
        returns (uint256 tokensOut)
    {
        _checkDeadline(deadline);
        if (msg.value == 0) revert ZeroAmount();

        uint256 fee;
        uint256 ltcConsumed;
        (tokensOut, fee, ltcConsumed) = quoteBuy(msg.value);
        if (tokensOut == 0) revert ZeroAmount();
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        if (block.number < launchBlock + ANTI_SNIPE_BLOCKS && msg.sender != factory) {
            uint256 newSpend = antiSnipeSpent[msg.sender] + ltcConsumed;
            if (newSpend > ANTI_SNIPE_PER_ADDR_LIMIT) revert AntiSnipeLimit();
            antiSnipeSpent[msg.sender] = newSpend;
        }

        uint256 refund = msg.value - ltcConsumed;
        uint256 ltcNet = ltcConsumed - fee;
        uint256 creatorFee  = (fee * CREATOR_FEE_BPS) / FEE_BPS;
        uint256 protocolFee = fee - creatorFee;

        ltcCollected += ltcNet;
        tokensSold   += tokensOut;
        bool justGraduated = ltcCollected >= GRADUATION_LTC && !graduated;
        if (justGraduated) graduated = true;

        token.mint(msg.sender, tokensOut);
        if (protocolFee > 0) _safeSendNative(feeRecipient, protocolFee);
        if (creatorFee > 0)  _safeSendNative(creator, creatorFee);
        if (refund > 0)      _safeSendNative(msg.sender, refund);

        emit Bought(
            msg.sender,
            msg.value,
            refund,
            tokensOut,
            protocolFee,
            creatorFee,
            currentPriceX1e18(),
            ltcCollected,
            tokensSold
        );
        if (justGraduated) {
            emit Graduated(ltcCollected, tokensSold);
            address router = IFactoryConfig(factory).dexRouter();
            if (router != address(0)) {
                try this._migrateExternal() {} catch {}
            }
        }
    }

    function sell(uint256 tokensIn, uint256 minLtcOut, uint256 deadline)
        external
        notGraduated
        nonReentrant
        returns (uint256 ltcOut)
    {
        _checkDeadline(deadline);
        if (tokensIn == 0) revert ZeroAmount();
        if (tokensIn > tokensSold) revert InsufficientTokens();
        if (token.balanceOf(msg.sender) < tokensIn) revert InsufficientTokens();

        uint256 fee;
        (ltcOut, fee) = quoteSell(tokensIn);
        if (ltcOut < minLtcOut) revert SlippageExceeded();

        uint256 grossLtc = ltcOut + fee;
        if (grossLtc > ltcCollected) revert TransferFailed();

        uint256 creatorFee  = (fee * CREATOR_FEE_BPS) / FEE_BPS;
        uint256 protocolFee = fee - creatorFee;

        ltcCollected -= grossLtc;
        tokensSold   -= tokensIn;

        token.burn(msg.sender, tokensIn);
        if (protocolFee > 0) _safeSendNative(feeRecipient, protocolFee);
        if (creatorFee > 0)  _safeSendNative(creator, creatorFee);
        _safeSendNative(msg.sender, ltcOut);

        emit Sold(
            msg.sender,
            tokensIn,
            ltcOut,
            protocolFee,
            creatorFee,
            currentPriceX1e18(),
            ltcCollected,
            tokensSold
        );
    }

    function migrate() external nonReentrant {
        if (!graduated) revert NotGraduated();
        if (migrated)   revert AlreadyMigrated();
        _migrate();
    }

    function _migrateExternal() external {
        require(msg.sender == address(this), "self-only");
        if (!graduated) revert NotGraduated();
        if (migrated)   revert AlreadyMigrated();
        _migrate();
    }

    function _migrate() internal {
        address router = IFactoryConfig(factory).dexRouter();
        if (router == address(0)) revert NoRouter();

        address lpTo = IFactoryConfig(factory).lpRecipient();
        if (lpTo == address(0)) lpTo = address(0xdEaD);

        uint256 ltcAmount   = ltcCollected;
        uint256 tokenAmount = LP_SUPPLY;
        if (ltcAmount == 0) revert TransferFailed();

        ltcCollected = 0;
        migrated     = true;

        token.mint(address(this), tokenAmount);
        IERC20(address(token)).approve(router, tokenAmount);

        (uint256 amountToken, uint256 amountETH, uint256 liquidity) =
            IUniswapV2Router02(router).addLiquidityETH{value: ltcAmount}(
                address(token),
                tokenAmount,
                tokenAmount * 95 / 100,
                ltcAmount   * 95 / 100,
                lpTo,
                block.timestamp + 30 minutes
            );

        address weth = IUniswapV2Router02(router).WETH();
        lpPair = IUniswapV2Factory(IUniswapV2Router02(router).factory()).getPair(
            address(token),
            weth
        );

        IERC20(address(token)).approve(router, 0);

        uint256 leftoverTokens = token.balanceOf(address(this));
        if (leftoverTokens > 0) token.burn(address(this), leftoverTokens);

        uint256 leftoverETH = address(this).balance;
        if (leftoverETH > 0) _safeSendNative(feeRecipient, leftoverETH);

        emit Migrated(router, lpPair, amountETH, amountToken, liquidity);
    }

    function _checkDeadline(uint256 deadline) internal view {
        if (deadline == 0) return;
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (deadline > block.timestamp + MAX_DEADLINE_SKEW) revert DeadlineTooFar();
    }

    function _safeSendNative(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {
        revert TransferFailed();
    }

    fallback() external payable {
        revert TransferFailed();
    }
}
