// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones}            from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable}           from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step}      from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable}          from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard}   from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PumpToken}         from "./PumpToken.sol";
import {BondingCurve}      from "./BondingCurve.sol";

/// @title  TokenFactory
/// @notice Permissionless launchpad: anyone can launch a token + its bonding curve in one tx.
/// @dev    Uses EIP-1167 minimal-proxy clones with deterministic CREATE2 salts so the curve
///         address is known to the token, and vice versa, before either is deployed.
///
///         Owner may configure a Uniswap V2-style DEX router (`dexRouter`) and an LP token
///         recipient (`lpRecipient`). Once configured, graduating curves seed liquidity on
///         the DEX in the same transaction as the graduating buy, locking the resulting LP
///         tokens to `lpRecipient` (defaults to `0x...dEaD`).
contract TokenFactory is Ownable2Step, Pausable, ReentrancyGuard {
    using Clones for address;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------
    uint256 public constant LAUNCH_COOLDOWN   = 30 seconds;
    uint256 public constant MAX_CREATION_FEE  = 1 ether;
    uint256 internal constant MAX_PAGE        = 200;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------
    struct TokenInfo {
        address token;
        address curve;
        address creator;
        string  name;
        string  symbol;
        string  imageURI;
        string  description;
        string  twitter;
        string  telegram;
        string  website;
        uint256 createdAt;
    }

    struct CreateParams {
        string name;
        string symbol;
        string imageURI;
        string description;
        string twitter;
        string telegram;
        string website;
    }

    // ---------------------------------------------------------------------
    // Immutables / config
    // ---------------------------------------------------------------------
    address public immutable tokenImplementation;
    address public immutable curveImplementation;
    address public feeRecipient;
    uint256 public creationFee;

    /// @notice DEX router used by graduating curves to seed liquidity. Settable by
    ///         the owner so we can plug in a router (QuickSwap / LitvmSwap V2) once
    ///         it is live on LitVM. While unset, graduating curves sit in a
    ///         "graduated, not yet migrated" state and `curve.migrate()` may be
    ///         called manually after a router is configured.
    address public dexRouter;

    /// @notice Recipient of LP tokens minted on migration. Defaults to `0xdEaD`
    ///         so liquidity is locked forever.
    address public lpRecipient;

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------
    TokenInfo[] public tokens;
    mapping(address => uint256) public tokenIndexPlusOne;       // 0 = unknown, else index+1
    mapping(address => uint256) public lastLaunchAt;            // anti-bot per-creator cooldown
    uint256 public nextSalt;                                    // monotonic salt for CREATE2

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event TokenLaunched(
        address indexed token,
        address indexed curve,
        address indexed creator,
        string  name,
        string  symbol,
        string  imageURI,
        uint256 index
    );
    event CreationFeeUpdated(uint256 previousFee, uint256 newFee);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event DexRouterUpdated(address indexed previousRouter, address indexed newRouter);
    event LpRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error InsufficientFee();
    error TransferFailed();
    error CooldownActive();
    error FeeTooHigh();
    error ZeroAddress();
    error EmptyString();
    error PageTooLarge();

    constructor(address _feeRecipient, uint256 _creationFee) Ownable(msg.sender) {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_creationFee > MAX_CREATION_FEE) revert FeeTooHigh();

        tokenImplementation = address(new PumpToken());
        curveImplementation = address(new BondingCurve());

        feeRecipient = _feeRecipient;
        creationFee  = _creationFee;
        // Default LP recipient: burned. Owner can switch to a vesting vault later.
        lpRecipient  = address(0xdEaD);
    }

    // ---------------------------------------------------------------------
    // ADMIN
    // ---------------------------------------------------------------------
    function setCreationFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_CREATION_FEE) revert FeeTooHigh();
        emit CreationFeeUpdated(creationFee, newFee);
        creationFee = newFee;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    /// @notice Configure the DEX router. Pass `address(0)` to disable auto-migration.
    function setDexRouter(address newRouter) external onlyOwner {
        emit DexRouterUpdated(dexRouter, newRouter);
        dexRouter = newRouter;
    }

    function setLpRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit LpRecipientUpdated(lpRecipient, newRecipient);
        lpRecipient = newRecipient;
    }

    function pause()   external onlyOwner { _pause();   }
    function unpause() external onlyOwner { _unpause(); }

    // ---------------------------------------------------------------------
    // LAUNCH
    // ---------------------------------------------------------------------
    function launch(CreateParams calldata p, uint256 initialBuyMinTokens, uint256 deadline)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (address tokenAddr, address curveAddr)
    {
        if (bytes(p.name).length   == 0) revert EmptyString();
        if (bytes(p.symbol).length == 0) revert EmptyString();
        if (msg.value < creationFee)     revert InsufficientFee();

        uint256 last = lastLaunchAt[msg.sender];
        if (last != 0 && block.timestamp < last + LAUNCH_COOLDOWN) revert CooldownActive();
        lastLaunchAt[msg.sender] = block.timestamp;

        uint256 _fee            = creationFee;
        uint256 initialBuyValue = msg.value - _fee;

        bytes32 salt      = bytes32(nextSalt++);
        bytes32 saltToken = keccak256(abi.encodePacked("token", salt));
        bytes32 saltCurve = keccak256(abi.encodePacked("curve", salt));

        address predictedToken = Clones.predictDeterministicAddress(tokenImplementation, saltToken, address(this));
        address predictedCurve = Clones.predictDeterministicAddress(curveImplementation, saltCurve, address(this));

        tokenAddr = Clones.cloneDeterministic(tokenImplementation, saltToken);
        curveAddr = Clones.cloneDeterministic(curveImplementation, saltCurve);
        require(tokenAddr == predictedToken && curveAddr == predictedCurve, "CREATE2 mismatch");

        PumpToken(tokenAddr).initialize(
            p.name,
            p.symbol,
            p.imageURI,
            p.description,
            p.twitter,
            p.telegram,
            p.website,
            msg.sender,
            curveAddr
        );
        BondingCurve(payable(curveAddr)).initialize(tokenAddr, address(this), feeRecipient, msg.sender);

        tokens.push(TokenInfo({
            token:       tokenAddr,
            curve:       curveAddr,
            creator:     msg.sender,
            name:        p.name,
            symbol:      p.symbol,
            imageURI:    p.imageURI,
            description: p.description,
            twitter:     p.twitter,
            telegram:    p.telegram,
            website:     p.website,
            createdAt:   block.timestamp
        }));
        tokenIndexPlusOne[tokenAddr] = tokens.length;
        emit TokenLaunched(tokenAddr, curveAddr, msg.sender, p.name, p.symbol, p.imageURI, tokens.length - 1);

        if (_fee > 0) _safeSendNative(feeRecipient, _fee);

        if (initialBuyValue > 0) {
            uint256 balanceBefore = address(this).balance;
            uint256 bought = BondingCurve(payable(curveAddr)).buy{value: initialBuyValue}(
                initialBuyMinTokens,
                deadline
            );
            if (bought > 0) {
                bool ok = PumpToken(tokenAddr).transfer(msg.sender, bought);
                if (!ok) revert TransferFailed();
            }
            uint256 refund = address(this).balance > balanceBefore ? address(this).balance - balanceBefore : 0;
            if (refund > 0) _safeSendNative(msg.sender, refund);
        }
    }

    // ---------------------------------------------------------------------
    // VIEWS
    // ---------------------------------------------------------------------
    function tokensCount() external view returns (uint256) {
        return tokens.length;
    }

    function getToken(uint256 i) external view returns (TokenInfo memory) {
        return tokens[i];
    }

    function listTokens(uint256 offset, uint256 limit) external view returns (TokenInfo[] memory page) {
        if (limit > MAX_PAGE) revert PageTooLarge();
        uint256 n = tokens.length;
        if (offset >= n) return new TokenInfo[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        page = new TokenInfo[](end - offset);
        for (uint256 i = 0; i < page.length; i++) {
            page[i] = tokens[n - 1 - (offset + i)];
        }
    }

    // ---------------------------------------------------------------------
    // INTERNAL
    // ---------------------------------------------------------------------
    function _safeSendNative(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {}
}
