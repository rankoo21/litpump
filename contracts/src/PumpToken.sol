// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @title  PumpToken
/// @notice Minimal ERC-20 minted by the BondingCurve. Curve has exclusive mint/burn rights.
/// @dev    Designed to be deployed once as an *implementation* and then cloned via EIP-1167
///         minimal-proxies. State must therefore be stored in regular storage (no immutables)
///         and initialised through `initialize()` rather than the constructor.
contract PumpToken is ERC20, Initializable {
    // --- Limits enforced on-chain (defence-in-depth, mirror UI limits) ---
    uint256 internal constant MAX_NAME_LEN        = 64;
    uint256 internal constant MAX_SYMBOL_LEN      = 16;
    uint256 internal constant MAX_URI_LEN         = 256;
    uint256 internal constant MAX_DESCRIPTION_LEN = 500;

    // Storage (clones cannot use immutables).
    string  private _nameStored;
    string  private _symbolStored;
    address public  curve;
    address public  creator;
    string  public  imageURI;
    string  public  description;
    string  public  twitter;
    string  public  telegram;
    string  public  website;

    error OnlyCurve();
    error ZeroAddress();
    error StringTooLong();

    modifier onlyCurve() {
        if (msg.sender != curve) revert OnlyCurve();
        _;
    }

    /// @dev We pass empty strings to the parent ERC20 constructor because the
    ///      implementation contract itself is never used as a token. Real metadata
    ///      is set in `initialize()` and exposed via the `name()`/`symbol()` overrides.
    constructor() ERC20("", "") {
        _disableInitializers();
    }

    /// @notice One-shot initialiser called by the factory immediately after cloning.
    /// @dev    `_curve` is the BondingCurve clone address (address-of-curve is known to the
    ///         factory upfront because clones are deployed via CREATE2 with deterministic salt).
    function initialize(
        string  calldata name_,
        string  calldata symbol_,
        string  calldata imageURI_,
        string  calldata description_,
        string  calldata twitter_,
        string  calldata telegram_,
        string  calldata website_,
        address creator_,
        address curve_
    ) external initializer {
        if (creator_ == address(0) || curve_ == address(0)) revert ZeroAddress();

        // Mirror UI limits at the contract layer to bound storage costs.
        if (bytes(name_).length        == 0 || bytes(name_).length        > MAX_NAME_LEN)        revert StringTooLong();
        if (bytes(symbol_).length      == 0 || bytes(symbol_).length      > MAX_SYMBOL_LEN)      revert StringTooLong();
        if (bytes(imageURI_).length    > MAX_URI_LEN)                                            revert StringTooLong();
        if (bytes(description_).length > MAX_DESCRIPTION_LEN)                                    revert StringTooLong();
        if (bytes(twitter_).length     > MAX_URI_LEN)                                            revert StringTooLong();
        if (bytes(telegram_).length    > MAX_URI_LEN)                                            revert StringTooLong();
        if (bytes(website_).length     > MAX_URI_LEN)                                            revert StringTooLong();

        _nameStored   = name_;
        _symbolStored = symbol_;
        curve         = curve_;
        creator       = creator_;
        imageURI      = imageURI_;
        description   = description_;
        twitter       = twitter_;
        telegram      = telegram_;
        website       = website_;
    }

    function name()   public view override returns (string memory) { return _nameStored; }
    function symbol() public view override returns (string memory) { return _symbolStored; }

    /// @notice Mint tokens to a buyer. Restricted to the bonding curve.
    function mint(address to, uint256 amount) external onlyCurve {
        _mint(to, amount);
    }

    /// @notice Burn tokens. Restricted to the bonding curve, which validates that
    ///         the caller of the curve's `sell()` is the holder being burnt.
    /// @dev    The curve can only ever pass `from = msg.sender` of the original `sell()`
    ///         call (see BondingCurve.sell). This bounds the privilege so the curve cannot
    ///         arbitrarily burn third-party balances.
    function burn(address from, uint256 amount) external onlyCurve {
        _burn(from, amount);
    }
}
