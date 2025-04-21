// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
  function totalSupply() external view returns (uint256);
  function balanceOf(address who) external view returns (uint256);
  function allowance(address owner, address spender) external view returns (uint256);
  function transfer(address to, uint256 value) external returns (bool);
  function approve(address spender, uint256 value) external returns (bool);
  function transferFrom(address from, address to, uint256 value) external returns (bool);

  event Transfer(address indexed from, address indexed to, uint256 value);
  event Approval(address indexed owner, address indexed spender, uint256 value);
}

library SafeMath {
  function mul(uint256 a, uint256 b) internal pure returns (uint256) {
    if (a == 0) {
      return 0;
    }
    uint256 c = a * b;
    assert(c / a == b);
    return c;
  }

  function div(uint256 a, uint256 b) internal pure returns (uint256) {
    uint256 c = a / b;
    return c;
  }

  function sub(uint256 a, uint256 b) internal pure returns (uint256) {
    assert(b <= a);
    return a - b;
  }

  function add(uint256 a, uint256 b) internal pure returns (uint256) {
    uint256 c = a + b;
    assert(c >= a);
    return c;
  }

  function ceil(uint256 a, uint256 m) internal pure returns (uint256) {
    uint256 c = add(a,m);
    uint256 d = sub(c,1);
    return mul(div(d,m),m);
  }
}

abstract contract ERC20Detailed is IERC20 {
  uint8 private _Tokendecimals;
  string private _Tokenname;
  string private _Tokensymbol;

  constructor(string memory tokenName, string memory tokenSymbol, uint8 tokenDecimals) {
    _Tokendecimals = tokenDecimals;
    _Tokenname = tokenName;
    _Tokensymbol = tokenSymbol;
  }

  function name() public view returns(string memory) {
    return _Tokenname;
  }

  function symbol() public view returns(string memory) {
    return _Tokensymbol;
  }

  function decimals() public view returns(uint8) {
    return _Tokendecimals;
  }
}

/**end here**/

contract SepukuToken is ERC20Detailed {
  using SafeMath for uint256;
  mapping (address => uint256) private _SepukuTokenBalances;
  mapping (address => mapping (address => uint256)) private _allowed;
  string constant tokenName = "Sepuku Token";
  string constant tokenSymbol = "SEPUKU";
  uint8  constant tokenDecimals = 18;
  uint256 _totalSupply = 33000000000000000000000000000;
 
  constructor() payable ERC20Detailed(tokenName, tokenSymbol, tokenDecimals) {
    _mint(msg.sender, _totalSupply);
  }

  function totalSupply() public view override returns (uint256) {
    return _totalSupply;
  }

  function balanceOf(address owner) public view override returns (uint256) {
    return _SepukuTokenBalances[owner];
  }

  function allowance(address owner, address spender) public view override returns (uint256) {
    return _allowed[owner][spender];
  }

  function transfer(address to, uint256 value) public override returns (bool) {
    require(value <= _SepukuTokenBalances[msg.sender], "Insufficient balance");
    require(to != address(0), "Transfer to zero address");

    uint256 SepukuTokenDecay = value.div(900);
    uint256 tokensToTransfer = value.sub(SepukuTokenDecay);

    _SepukuTokenBalances[msg.sender] = _SepukuTokenBalances[msg.sender].sub(value);
    _SepukuTokenBalances[to] = _SepukuTokenBalances[to].add(tokensToTransfer);

    _totalSupply = _totalSupply.sub(SepukuTokenDecay);

    emit Transfer(msg.sender, to, tokensToTransfer);
    emit Transfer(msg.sender, address(0), SepukuTokenDecay);
    return true;
  }

  function multiTransfer(address[] memory receivers, uint256[] memory amounts) public {
    for (uint256 i = 0; i < receivers.length; i++) {
      transfer(receivers[i], amounts[i]);
    }
  }

  function approve(address spender, uint256 value) public override returns (bool) {
    require(spender != address(0), "Approve to zero address");
    _allowed[msg.sender][spender] = value;
    emit Approval(msg.sender, spender, value);
    return true;
  }

  function transferFrom(address from, address to, uint256 value) public override returns (bool) {
    require(value <= _SepukuTokenBalances[from], "Insufficient balance");
    require(value <= _allowed[from][msg.sender], "Insufficient allowance");
    require(to != address(0), "Transfer to zero address");

    _SepukuTokenBalances[from] = _SepukuTokenBalances[from].sub(value);

    uint256 SepukuTokenDecay = value.div(900);
    uint256 tokensToTransfer = value.sub(SepukuTokenDecay);

    _SepukuTokenBalances[to] = _SepukuTokenBalances[to].add(tokensToTransfer);
    _totalSupply = _totalSupply.sub(SepukuTokenDecay);

    _allowed[from][msg.sender] = _allowed[from][msg.sender].sub(value);

    emit Transfer(from, to, tokensToTransfer);
    emit Transfer(from, address(0), SepukuTokenDecay);

    return true;
  }

  function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
    require(spender != address(0), "Approve to zero address");
    _allowed[msg.sender][spender] = (_allowed[msg.sender][spender].add(addedValue));
    emit Approval(msg.sender, spender, _allowed[msg.sender][spender]);
    return true;
  }

  function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
    require(spender != address(0), "Approve to zero address");
    _allowed[msg.sender][spender] = (_allowed[msg.sender][spender].sub(subtractedValue));
    emit Approval(msg.sender, spender, _allowed[msg.sender][spender]);
    return true;
  }

  function _mint(address account, uint256 amount) internal {
    require(amount != 0, "Cannot mint zero tokens");
    require(account != address(0), "Mint to zero address");
    _SepukuTokenBalances[account] = _SepukuTokenBalances[account].add(amount);
    emit Transfer(address(0), account, amount);
  }

  function burn(uint256 amount) external {
    _burn(msg.sender, amount);
  }

  function _burn(address account, uint256 amount) internal {
    require(amount != 0, "Cannot burn zero tokens");
    require(amount <= _SepukuTokenBalances[account], "Burn amount exceeds balance");
    _totalSupply = _totalSupply.sub(amount);
    _SepukuTokenBalances[account] = _SepukuTokenBalances[account].sub(amount);
    emit Transfer(account, address(0), amount);
  }

  function burnFrom(address account, uint256 amount) external {
    require(amount <= _allowed[account][msg.sender], "Burn amount exceeds allowance");
    _allowed[account][msg.sender] = _allowed[account][msg.sender].sub(amount);
    _burn(account, amount);
  }
}