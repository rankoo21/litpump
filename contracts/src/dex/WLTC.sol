// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract WLTC {
    string  public constant name     = "Wrapped Litecoin";
    string  public constant symbol   = "WLTC";
    uint8   public constant decimals = 18;

    event  Transfer(address indexed from, address indexed to, uint256 value);
    event  Approval(address indexed owner, address indexed spender, uint256 value);
    event  Deposit (address indexed dst, uint256 amount);
    event  Withdrawal(address indexed src, uint256 amount);

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error InsufficientBalance();
    error InsufficientAllowance();
    error TransferFailed();

    receive() external payable { deposit(); }

    function deposit() public payable {
        unchecked { balanceOf[msg.sender] += msg.value; }
        emit Deposit(msg.sender, msg.value);
        emit Transfer(address(0), msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        unchecked { balanceOf[msg.sender] -= amount; }
        emit Withdrawal(msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function totalSupply() external view returns (uint256) {
        return address(this).balance;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (from != msg.sender) {
            uint256 allowed = allowance[from][msg.sender];
            if (allowed != type(uint256).max) {
                if (allowed < amount) revert InsufficientAllowance();
                unchecked { allowance[from][msg.sender] = allowed - amount; }
            }
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to]   += amount;
        }
        emit Transfer(from, to, amount);
        return true;
    }
}
