// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Ownable
 * @dev The Ownable contract has an owner address, and provides basic authorization control
 * functions, this simplifies the implementation of "user permissions".
 */
contract Ownable {
  address public owner;

  /**
   * @dev The Ownable constructor sets the original `owner` of the contract to the sender
   * account.
   */
  constructor() {
    owner = msg.sender;
  }

  /**
   * @dev Throws if called by any account other than the owner.
   */
  modifier onlyOwner() {
    require(msg.sender == owner, "Ownable: caller is not the owner");
    _;
  }

  /**
   * @dev Allows the current owner to transfer control of the contract to a newOwner.
   * @param newOwner The address to transfer ownership to.
   */
  function transferOwnership(address newOwner) public onlyOwner {
    if (newOwner != address(0)) {
      owner = newOwner;
    }
  }
}

contract Saleable is Ownable {
  event Sale();
  event Unsale();

  bool public saled = false;

  modifier whenNotSaled() {
    require(!saled, "Contract is already in sale state");
    _;
  }

  modifier whenSaled() {
    require(saled, "Contract is not in sale state");
    _;
  }

  function sale() public onlyOwner whenNotSaled returns (bool) {
    saled = true;
    emit Sale();
    return true;
  }

  /**
   * @dev called by the owner to unpause, returns to normal state
   */
  function unsale() public onlyOwner whenSaled returns (bool) {
    saled = false;
    emit Unsale();
    return true;
  }
}

/**
 * @title SafeMath
 * @dev Math operations with safety checks that throw on error
 * Note: In 0.8.0+, math operations have built-in overflow checks,
 * but we're keeping this for interface compatibility
 */
library SafeMath {
  function mul(uint256 a, uint256 b) internal pure returns (uint256) {
    return a * b;
  }

  function div(uint256 a, uint256 b) internal pure returns (uint256) {
    return a / b;
  }

  function sub(uint256 a, uint256 b) internal pure returns (uint256) {
    return a - b;
  }

  function add(uint256 a, uint256 b) internal pure returns (uint256) {
    return a + b;
  }
}

/**
 * @title ERC20Basic
 * @dev Simpler version of ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/179
 */
interface ERC20Basic {
  function totalSupply() external view returns (uint256);
  function balanceOf(address who) external view returns (uint256);
  function transfer(address to, uint256 value) external returns (bool);
  event Transfer(address indexed from, address indexed to, uint256 value);
}

/**
 * @title ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/20
 */
interface ERC20 is ERC20Basic {
  function allowance(address owner, address spender) external view returns (uint256);
  function transferFrom(address from, address to, uint256 value) external returns (bool);
  function approve(address spender, uint256 value) external returns (bool);
  event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @title Basic token
 * @dev Basic version of StandardToken, with no allowances.
 */
contract BasicToken is ERC20Basic {
  using SafeMath for uint256;

  mapping(address => uint256) balances;
  uint256 private _totalSupply;

  /**
   * @dev Get the total token supply
   * @return The total token supply
   */
  function totalSupply() public view virtual override returns (uint256) {
    return _totalSupply;
  }

  // Set the total supply (used in constructor)
  function _setTotalSupply(uint256 amount) internal {
    _totalSupply = amount;
  }

  /**
  * @dev transfer token for a specified address
  * @param _to The address to transfer to.
  * @param _value The amount to be transferred.
  */
  function transfer(address _to, uint256 _value) public virtual override returns (bool) 
  {
    require(_to != address(0), "Cannot transfer to zero address");
    require(_value <= balances[msg.sender], "Insufficient balance");

    balances[msg.sender] = balances[msg.sender] - _value;
    balances[_to] = balances[_to] + _value;
    emit Transfer(msg.sender, _to, _value);
    return true;
  }

  /**
  * @dev Gets the balance of the specified address.
  * @param _owner The address to query the balance of.
  * @return An uint256 representing the amount owned by the passed address.
  */
  function balanceOf(address _owner) public view virtual override returns (uint256) {
    return balances[_owner];
  }
}

/**
 * @title Standard ERC20 token
 *
 * @dev Implementation of the basic standard token.
 * @dev https://github.com/ethereum/EIPs/issues/20
 * @dev Based on code by FirstBlood: https://github.com/Firstbloodio/token/blob/master/smart_contract/FirstBloodToken.sol
 */
contract StandardToken is BasicToken, ERC20 {
  mapping (address => mapping (address => uint256)) allowed;

  /**
   * @dev Transfer tokens from one address to another
   * @param _from address The address which you want to send tokens from
   * @param _to address The address which you want to transfer to
   * @param _value uint256 the amount of tokens to be transferred
   */
  function transferFrom(address _from, address _to, uint256 _value) public virtual override returns (bool) {
    require(_to != address(0), "Cannot transfer to zero address");
    require(_value <= balances[_from], "Insufficient balance");
 
    uint256 _allowance = allowed[_from][msg.sender];
    require(_value <= _allowance, "Insufficient allowance");

    balances[_to] = balances[_to] + _value;
    balances[_from] = balances[_from] - _value;
    allowed[_from][msg.sender] = _allowance - _value;
    emit Transfer(_from, _to, _value);
    return true;
  }

  /**
   * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
   * @param _spender The address which will spend the funds.
   * @param _value The amount of tokens to be spent.
   */
  function approve(address _spender, uint256 _value) public virtual override returns (bool) {
    // To change the approve amount you first have to reduce the addresses`
    //  allowance to zero by calling `approve(_spender, 0)` if it is not
    //  already 0 to mitigate the race condition described here:
    //  https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
    require((_value == 0) || (allowed[msg.sender][_spender] == 0), "Must reset approval to 0 first");

    allowed[msg.sender][_spender] = _value;
    emit Approval(msg.sender, _spender, _value);
    return true;
  }

  /**
   * @dev Function to check the amount of tokens that an owner allowed to a spender.
   * @param _owner address The address which owns the funds.
   * @param _spender address The address which will spend the funds.
   * @return A uint256 specifying the amount of tokens still available for the spender.
   */
  function allowance(address _owner, address _spender) public view virtual override returns (uint256) {
    return allowed[_owner][_spender];
  }
}

contract O2OToken is StandardToken, Saleable {
    string public name; 
    string public symbol; 
    uint8 public decimals = 18; 

    constructor(uint256 initialSupply, string memory tokenName, string memory tokenSymbol) {
        uint256 totalAmount = initialSupply * 10 ** uint256(decimals);
        _setTotalSupply(totalAmount);
        balances[msg.sender] = totalAmount;  
        name = tokenName;
        symbol = tokenSymbol;
    }
    
    function transferOwner(address dst, uint wad) external onlyOwner {
        super.transfer(dst, wad);
    }
    
    function transfer(address dst, uint wad) public override(BasicToken, ERC20Basic) whenSaled returns (bool) {
        return super.transfer(dst, wad);
    }
    
    function transferFrom(address src, address dst, uint wad) public virtual override whenSaled returns (bool) {
        return super.transferFrom(src, dst, wad);
    }
}