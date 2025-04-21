// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SafeMath
 * @dev Math operations with safety checks that throw on error
 */
library SafeMath {
  function mul(uint256 a, uint256 b) internal pure returns (uint256) {
    if (a == 0) {
      return 0;
    }
    uint256 c = a * b;
    require(c / a == b, "SafeMath: multiplication overflow");
    return c;
  }

  function div(uint256 a, uint256 b) internal pure returns (uint256) {
    require(b > 0, "SafeMath: division by zero");
    uint256 c = a / b;
    return c;
  }

  function sub(uint256 a, uint256 b) internal pure returns (uint256) {
    require(b <= a, "SafeMath: subtraction overflow");
    return a - b;
  }

  function add(uint256 a, uint256 b) internal pure returns (uint256) {
    uint256 c = a + b;
    require(c >= a, "SafeMath: addition overflow");
    return c;
  }
}

/**
 * @title ERC20Basic
 * @dev Simpler version of ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/179
 */
abstract contract ERC20Basic {
  uint256 public totalSupply;
  function balanceOf(address who) public view virtual returns (uint256);
  function transfer(address to, uint256 value) public virtual returns (bool);
  event Transfer(address indexed from, address indexed to, uint256 value);
}

/**
 * @title ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/20
 */
abstract contract ERC20 is ERC20Basic {
  function allowance(address owner, address spender) public view virtual returns (uint256);
  function transferFrom(address from, address to, uint256 value) public virtual returns (bool);
  function approve(address spender, uint256 value) public virtual returns (bool);
  event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @title Basic token
 * @dev Basic version of StandardToken, with no allowances.
 */
abstract contract BasicToken is ERC20Basic {
  mapping(address => uint256) balances;

  /**
  * @dev transfer token for a specified address
  * @param _to The address to transfer to.
  * @param _value The amount to be transferred.
  */
  function transfer(address _to, uint256 _value) public virtual override returns (bool) {
    require(_to != address(0), "Transfer to zero address");
    require(_value <= balances[msg.sender], "Insufficient balance");

    // SafeMath.sub will throw if there is not enough balance.
    balances[msg.sender] = SafeMath.sub(balances[msg.sender], _value);
    balances[_to] = SafeMath.add(balances[_to], _value);
    emit Transfer(msg.sender, _to, _value);
    return true;
  }

  /**
  * @dev Gets the balance of the specified address.
  * @param _owner The address to query the the balance of.
  * @return balance representing the amount owned by the passed address.
  */
  function balanceOf(address _owner) public view virtual override returns (uint256 balance) {
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
abstract contract StandardToken is ERC20, BasicToken {
  mapping (address => mapping (address => uint256)) internal allowed;

  /**
   * @dev Transfer tokens from one address to another
   * @param _from address The address which you want to send tokens from
   * @param _to address The address which you want to transfer to
   * @param _value uint256 the amount of tokens to be transferred
   */
  function transferFrom(address _from, address _to, uint256 _value) public virtual override returns (bool) {
    require(_to != address(0), "Transfer to zero address");
    require(_value <= balances[_from], "Insufficient balance");
    require(_value <= allowed[_from][msg.sender], "Insufficient allowance");

    balances[_from] = SafeMath.sub(balances[_from], _value);
    balances[_to] = SafeMath.add(balances[_to], _value);
    allowed[_from][msg.sender] = SafeMath.sub(allowed[_from][msg.sender], _value);
    emit Transfer(_from, _to, _value);
    return true;
  }

  /**
   * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
   *
   * Beware that changing an allowance with this method brings the risk that someone may use both the old
   * and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
   * race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
   * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
   * @param _spender The address which will spend the funds.
   * @param _value The amount of tokens to be spent.
   */
  function approve(address _spender, uint256 _value) public virtual override returns (bool) {
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

  /**
   * @dev Increase the amount of tokens that an owner allowed to a spender.
   *
   * approve should be called when allowed[_spender] == 0. To increment
   * allowed value is better to use this function to avoid 2 calls (and wait until
   * the first transaction is mined)
   * From MonolithDAO Token.sol
   * @param _spender The address which will spend the funds.
   * @param _addedValue The amount of tokens to increase the allowance by.
   */
  function increaseApproval(address _spender, uint _addedValue) public returns (bool) {
    allowed[msg.sender][_spender] = SafeMath.add(allowed[msg.sender][_spender], _addedValue);
    emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
    return true;
  }

  /**
   * @dev Decrease the amount of tokens that an owner allowed to a spender.
   *
   * approve should be called when allowed[_spender] == 0. To decrement
   * allowed value is better to use this function to avoid 2 calls (and wait until
   * the first transaction is mined)
   * From MonolithDAO Token.sol
   * @param _spender The address which will spend the funds.
   * @param _subtractedValue The amount of tokens to decrease the allowance by.
   */
  function decreaseApproval(address _spender, uint _subtractedValue) public returns (bool) {
    uint oldValue = allowed[msg.sender][_spender];
    if (_subtractedValue > oldValue) {
      allowed[msg.sender][_spender] = 0;
    } else {
      allowed[msg.sender][_spender] = SafeMath.sub(oldValue, _subtractedValue);
    }
    emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
    return true;
  }
}

/**
 * @title Ownable
 * @dev The Ownable contract has an owner address, and provides basic authorization control
 * functions, this simplifies the implementation of "user permissions".
 */
contract Ownable {
  address public owner;

  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

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
    require(newOwner != address(0), "Ownable: new owner is the zero address");
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }
}

contract Object is StandardToken, Ownable {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    bool public mintingFinished = false;

    event Burn(address indexed burner, uint value);
    event Mint(address indexed to, uint amount);
    event MintFinished();

    modifier canMint() {
        require(!mintingFinished, "Minting is finished");
        _;
    }

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function burn(uint _value) onlyOwner public {
        require(_value <= balances[msg.sender], "Burn amount exceeds balance");
        address burner = msg.sender;
        balances[burner] = SafeMath.sub(balances[burner], _value);
        totalSupply = SafeMath.sub(totalSupply, _value);
        emit Burn(burner, _value);
    }

    function mint(address _to, uint _amount) onlyOwner canMint public returns(bool) {
        totalSupply = SafeMath.add(totalSupply, _amount);
        balances[_to] = SafeMath.add(balances[_to], _amount);
        emit Mint(_to, _amount);
        emit Transfer(address(0), _to, _amount);
        return true;
    }

    function finishMinting() onlyOwner canMint public returns(bool) {
        mintingFinished = true;
        emit MintFinished();
        return true;
    }

    function transfer(address _to, uint256 _value) public override(BasicToken, ERC20Basic) returns (bool) {
        require(_to != address(0), "Transfer to zero address");
        require(_value <= balances[msg.sender], "Transfer amount exceeds balance");
        require(_value % (1 ether) == 0, "Only whole tokens can be transferred"); // require whole token transfers

        // SafeMath.sub will throw if there is not enough balance.
        balances[msg.sender] = SafeMath.sub(balances[msg.sender], _value);
        balances[_to] = SafeMath.add(balances[_to], _value);
        emit Transfer(msg.sender, _to, _value);
        return true;
    }
}

contract Shop is Ownable {

    struct ShopSettings {
        address bank;
        uint32 startTime;
        uint32 endTime;
        uint fundsRaised;
        uint rate;
        uint price;
    }

    Object public object;
    ShopSettings public shopSettings;

    modifier onlyValidPurchase() {
        require(msg.value % shopSettings.price == 0, "Purchase must be in whole token increments"); // whole numbers only
        require((block.timestamp >= shopSettings.startTime && block.timestamp <= shopSettings.endTime) && msg.value != 0, "Shop is closed or zero value sent");
        _;
    }

    modifier whenClosed() { // not actually implemented in original?
        require(block.timestamp > shopSettings.endTime, "Shop is still open");
        _;
    }

    modifier whenOpen() {
        require(block.timestamp < shopSettings.endTime, "Shop is closed");
        _;
    }

    modifier onlyValidAddress(address _bank) {
        require(_bank != address(0), "Invalid address");
        _;
    }

    modifier onlyOne() {
        require(calculateTokens() == 1 ether, "Must purchase exactly one token");
        _;
    }

    modifier onlyBuyer(address _beneficiary) {
        require(_beneficiary == msg.sender, "Beneficiary must be sender");
        _;
    }

    event ShopClosed(uint32 date);
    event ObjectPurchase(address indexed purchaser, address indexed beneficiary, uint value, uint amount);

    receive() external payable {
        buyObject(msg.sender);
    }

    fallback() external payable {
        buyObject(msg.sender);
    }

    constructor(address _bank, string memory _name, string memory _symbol, uint _rate, uint32 _endTime)
    onlyValidAddress(_bank) {
        require(_rate >= 0, "Rate must be non-negative");
        require(_endTime > block.timestamp, "End time must be in the future");
        shopSettings = ShopSettings(_bank, uint32(block.timestamp), _endTime, 0, _rate, 0);
        calculatePrice(); // set initial price based on initial rate
        object = new Object(_name, _symbol);
    }

    function buyObject(address _beneficiary) onlyValidPurchase
    onlyBuyer(_beneficiary)
    onlyValidAddress(_beneficiary) public payable {
        uint numTokens = calculateTokens();
        shopSettings.fundsRaised = SafeMath.add(shopSettings.fundsRaised, msg.value);
        object.mint(_beneficiary, numTokens);
        emit ObjectPurchase(msg.sender, _beneficiary, msg.value, numTokens);
        forwardFunds();
    }

    function calculateTokens() internal returns(uint) {
        // rate is literally tokens per eth in wei;
        // passing in a rate of 10 ETH (10*10^18) equates to 10 tokens per ETH, or a price of 0.1 ETH per token
        // rate is always 1/price!
        calculatePrice(); // update price
        uint ethInWei = 1 ether;
        uint denominator = SafeMath.div(SafeMath.mul(ethInWei, ethInWei), shopSettings.rate);
        return SafeMath.div(SafeMath.mul(msg.value, ethInWei), denominator);
    }

    function calculatePrice() internal returns(uint) {
        uint ethInWei = 1 ether;
        shopSettings.price = SafeMath.div(SafeMath.mul(ethInWei, ethInWei), shopSettings.rate); // update price based on current rate
        return shopSettings.price;
    }

    function closeShop() onlyOwner whenOpen public {
        shopSettings.endTime = uint32(block.timestamp);
        emit ShopClosed(uint32(block.timestamp));
    }

    function forwardFunds() internal {
        (bool success, ) = shopSettings.bank.call{value: msg.value}("");
        require(success, "Forward funds failed");
    }
}