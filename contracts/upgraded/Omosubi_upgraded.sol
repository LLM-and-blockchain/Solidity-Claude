/**
 *Submitted for verification at Etherscan.io on 2021-06-21
*/

/*

Telegram: https://t.me/Omusubi_Token
Twitter: https://twitter.com/OmusubiToken
Website: https:// (coming before launch)

THIS IS A DUMMY CONTRACT. THE REAL CONTRACT HAS NOT DEPLOYED YET
THIS IS A DUMMY CONTRACT. THE REAL CONTRACT HAS NOT DEPLOYED YET


 ▄██████▄    ▄▄▄▄███▄▄▄▄   ███    █▄     ▄████████ ███    █▄  ▀█████████▄   ▄█  
███    ███ ▄██▀▀▀███▀▀▀██▄ ███    ███   ███    ███ ███    ███   ███    ███ ███  
███    ███ ███   ███   ███ ███    ███   ███    █▀  ███    ███   ███    ███ ███▌ 
███    ███ ███   ███   ███ ███    ███   ███        ███    ███  ▄███▄▄▄██▀  ███▌ 
███    ███ ███   ███   ███ ███    ███ ▀███████████ ███    ███ ▀▀███▀▀▀██▄  ███▌ 
███    ███ ███   ███   ███ ███    ███          ███ ███    ███   ███    ██▄ ███  
███    ███ ███   ███   ███ ███    ███    ▄█    ███ ███    ███   ███    ███ ███  
 ▀██████▀   ▀█   ███   █▀  ████████▀   ▄████████▀  ████████▀  ▄█████████▀  █▀
 
 
THIS IS A DUMMY CONTRACT. THE REAL CONTRACT HAS NOT DEPLOYED YET
THIS IS A DUMMY CONTRACT. THE REAL CONTRACT HAS NOT DEPLOYED YET


Welcome to OMUSUBI! 🍱
OMUSUBI is an even more twisted food meme token. Unlike many Notinu forks, it has no sale limitations benefit both whales and shrimps alike, and an innovative dynamic reflection tax rate which increases proportionate to the size of the sell.

🙈 As a sneak peak, here are the basic features of how the contract will be:
        ✅ a) 5,000,000,000,000 Total Omusubi
        ✅ b) 100% added to Uniswap as Liquidity (No shitty presale or dev tokens)
        ✅ c) 15,000,000,000 limit max buy limit + 45sec cooldown between buys for only the FIRST TWO MINUTES, which is lifted automatically. There will be a 15sec cooldown after a buy to nuke the frontrunning bots. (post two minutes there won't be buy/sell limits)
        ✅ d) 10% total tax on buy
             1) 6% Tax for Redistribution to Hodlers as rewards
             2) 2% Tax for Buyback
             3) 2% Tax Marketing
        ✅ e) There will be a dynamic fee based on the price impact, ranging from 10% to 40% fee with NO time restrictive sell limits (unlike Myōbu).
        
SPDX-License-Identifier: UNLICENSED 
*/
pragma solidity 0.8.20;

abstract contract Ownable {
    address public _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor () {
        _owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }
    
    function owner() public view returns (address) {
        return _owner;
    }
    
    modifier onlyOwner() {
        require(_owner == msg.sender, "Ownable: caller is not the owner");
        _;
    }
    
    function renounceOwnership() public virtual onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }
    
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

contract OMUSUBI is Ownable {
    event LogRebase(uint256 indexed epoch, uint256 totalSupply);

    modifier validRecipient(address to) {
        require(to != address(this));
        _;
    }
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    string public constant name = "Omusubi | t.me/Omusubi_Token";
    string public constant symbol = "OMUSUBI ";
    uint256 public constant decimals = 9;

    uint256 private constant DECIMALS = 9;
    uint256 private constant MAX_UINT256 = type(uint256).max;
    uint256 private constant INITIAL_FRAGMENTS_SUPPLY = 5000000000000 * 10**DECIMALS;

    uint256 private constant TOTAL_GONS = MAX_UINT256 - (MAX_UINT256 % INITIAL_FRAGMENTS_SUPPLY);

    uint256 private constant MAX_SUPPLY = type(uint128).max;

    uint256 private _totalSupply;
    uint256 private _gonsPerFragment;
    mapping(address => uint256) private _gonBalances;

    mapping (address => mapping (address => uint256)) private _allowedFragments;
    
    constructor() {
        _owner = msg.sender;
        
        _totalSupply = INITIAL_FRAGMENTS_SUPPLY;
        _gonBalances[_owner] = TOTAL_GONS;
        _gonsPerFragment = TOTAL_GONS / _totalSupply;

        emit Transfer(address(0x0), _owner, _totalSupply);
    }
    
    function totalSupply()
        public
        view
        returns (uint256)
    {
        return _totalSupply;
    }
    
    function balanceOf(address who)
        public
        view
        returns (uint256)
    {
        return _gonBalances[who] / _gonsPerFragment;
    }
    
    function transfer(address to, uint256 value)
        public
        validRecipient(to)
        returns (bool)
    {
        uint256 gonValue = value * _gonsPerFragment;
        _gonBalances[msg.sender] = _gonBalances[msg.sender] - gonValue;
        _gonBalances[to] = _gonBalances[to] + gonValue;
        emit Transfer(msg.sender, to, value);
        return true;
    }
    
    function allowance(address owner_, address spender)
        public
        view
        returns (uint256)
    {
        return _allowedFragments[owner_][spender];
    }
    
    function transferFrom(address from, address to, uint256 value)
        public
        validRecipient(to)
        returns (bool)
    {
        _allowedFragments[from][msg.sender] = _allowedFragments[from][msg.sender] - value;

        uint256 gonValue = value * _gonsPerFragment;
        _gonBalances[from] = _gonBalances[from] - gonValue;
        _gonBalances[to] = _gonBalances[to] + gonValue;
        emit Transfer(from, to, value);

        return true;
    }
    
    function approve(address spender, uint256 value)
        public
        returns (bool)
    {
        _allowedFragments[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }
    
    function increaseAllowance(address spender, uint256 addedValue)
        public
        returns (bool)
    {
        _allowedFragments[msg.sender][spender] =
            _allowedFragments[msg.sender][spender] + addedValue;
        emit Approval(msg.sender, spender, _allowedFragments[msg.sender][spender]);
        return true;
    }
    
    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        returns (bool)
    {
        uint256 oldValue = _allowedFragments[msg.sender][spender];
        if (subtractedValue >= oldValue) {
            _allowedFragments[msg.sender][spender] = 0;
        } else {
            _allowedFragments[msg.sender][spender] = oldValue - subtractedValue;
        }
        emit Approval(msg.sender, spender, _allowedFragments[msg.sender][spender]);
        return true;
    }
}