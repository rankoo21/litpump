// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract PumpToken is ERC20, Initializable {
    uint256 internal constant MAX_NAME_LEN        = 64;
    uint256 internal constant MAX_SYMBOL_LEN      = 16;
    uint256 internal constant MAX_URI_LEN         = 256;
    uint256 internal constant MAX_DESCRIPTION_LEN = 500;

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

    constructor() ERC20("", "") {
        _disableInitializers();
    }

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

    function mint(address to, uint256 amount) external onlyCurve {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyCurve {
        _burn(from, amount);
    }
}
