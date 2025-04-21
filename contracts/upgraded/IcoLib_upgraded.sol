// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract Owned {
    /* Variables */
    address public owner;
    /* Constructor */
    constructor(address _owner) {
        if (_owner == address(0)) {
            _owner = msg.sender;
        }
        owner = _owner;
    }
    /* Externals */
    function replaceOwner(address _owner) external returns(bool) {
        require(isOwner(), "Not owner");
        owner = _owner;
        return true;
    }
    
    /* Internals */
    function isOwner() internal view returns(bool) {
        return owner == msg.sender;
    }
    /* Modifiers */
    modifier forOwner {
        require(isOwner(), "Not owner");
        _;
    }
}

library SafeMath {
    /* Internals */
    function add(uint256 a, uint256 b) internal pure returns(uint256 c) {
        c = a + b;
        require(c >= a, "SafeMath: addition overflow");
        return c;
    }
    function sub(uint256 a, uint256 b) internal pure returns(uint256 c) {
        require(b <= a, "SafeMath: subtraction overflow");
        c = a - b;
        return c;
    }
    function mul(uint256 a, uint256 b) internal pure returns(uint256 c) {
        if (a == 0 || b == 0) {
            return 0;
        }
        c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");
        return c;
    }
    function div(uint256 a, uint256 b) internal pure returns(uint256) {
        require(b > 0, "SafeMath: division by zero");
        return a / b;
    }
    function pow(uint256 a, uint256 b) internal pure returns(uint256 c) {
        c = a ** b;
        require(b == 0 || c % a == 0, "SafeMath: power overflow");
        return c;
    }
}

contract TokenDB is Owned {
    /* Constructor */
    constructor(address _owner) Owned(_owner) {}
    
    /* Externals */
    function transfer(address _from, address _to, uint256 _amount) external virtual returns(bool _success) {}
    function bulkTransfer(address _from, address[] calldata _to, uint256[] calldata _amount) external virtual returns(bool _success) {}
    function setAllowance(address _owner, address _spender, uint256 _amount) external virtual returns(bool _success) {}
    /* Constants */
    function getAllowance(address _owner, address _spender) public virtual view returns(bool _success, uint256 _remaining) {}
    function balanceOf(address _owner) public virtual view returns(bool _success, uint256 _balance) {}
}

contract Token is Owned {
    /* Declarations */
    using SafeMath for uint256;
    /* Variables */
    string public name = "Inlock token";
    string public symbol = "ILK";
    uint8 public decimals = 8;
    uint256 public totalSupply = 44e16;
    address public libAddress;
    TokenDB public db;
    Ico public ico;
    
    /* Constructor */
    constructor(address _owner) Owned(_owner) {}
    
    /* Fallback */
    receive() external payable {
        revert();
    }
    fallback() external {
        revert();
    }
    /* Externals */
    function changeLibAddress(address _libAddress) external virtual forOwner {}
    function changeDBAddress(address _dbAddress) external virtual forOwner {}
    function changeIcoAddress(address _icoAddress) external virtual forOwner {}
    function approve(address _spender, uint256 _value) external virtual returns (bool _success) {}
    function transfer(address _to, uint256 _amount) external virtual returns (bool _success) {}
    function bulkTransfer(address[] calldata _to, uint256[] calldata _amount) external virtual returns (bool _success) {}
    function transferFrom(address _from, address _to, uint256 _amount) external virtual returns (bool _success) {}
    /* Constants */
    function allowance(address _owner, address _spender) public virtual view returns (uint256 _remaining) {}
    function balanceOf(address _owner) public virtual view returns (uint256 _balance) {}
    /* Events */
    event AllowanceUsed(address indexed _spender, address indexed _owner, uint256 indexed _value);
    event Mint(address indexed _addr, uint256 indexed _value);
    event Approval(address indexed _owner, address indexed _spender, uint _value);
    event Transfer(address indexed _from, address indexed _to, uint _value);
}

contract Ico is Owned {
    /* Declarations */
    using SafeMath for uint256;
    /* Enumerations */
    enum phaseType {
        pause,
        privateSale1,
        privateSale2,
        sales1,
        sales2,
        sales3,
        sales4,
        preFinish,
        finish
    }
    struct vesting_s {
        uint256 amount;
        uint256 startBlock;
        uint256 endBlock;
        uint256 claimedAmount;
    }
    /* Variables */
    mapping(address => bool) public KYC;
    mapping(address => bool) public transferRight;
    mapping(address => vesting_s) public vesting;
    phaseType public currentPhase;
    uint256 public currentRate;
    uint256 public currentRateM = 1e3;
    uint256 public privateSale1Hardcap = 4e16;
    uint256 public privateSale2Hardcap = 64e15;
    uint256 public thisBalance = 44e16;
    address public offchainUploaderAddress;
    address public setKYCAddress;
    address public setRateAddress;
    address public libAddress;
    Token public token;
    /* Constructor */
    constructor(address _owner, address _libAddress, address _tokenAddress, address _offchainUploaderAddress,
        address _setKYCAddress, address _setRateAddress) Owned(_owner) {
        currentPhase = phaseType.pause;
        libAddress = _libAddress;
        token = Token(payable(_tokenAddress));
        offchainUploaderAddress = _offchainUploaderAddress;
        setKYCAddress = _setKYCAddress;
        setRateAddress = _setRateAddress;
    }
    /* Fallback */
    receive() external payable virtual {
        buy();
    }
    fallback() external payable virtual {
        buy();
    }
    /* Externals */
    function changeLibAddress(address _libAddress) external virtual forOwner {
        libAddress = _libAddress;
    }
    function changeOffchainUploaderAddress(address _offchainUploaderAddress) external virtual forOwner {
        offchainUploaderAddress = _offchainUploaderAddress;
    }
    function changeKYCAddress(address _setKYCAddress) external virtual forOwner {
        setKYCAddress = _setKYCAddress;
    }
    function changeSetRateAddress(address _setRateAddress) external virtual forOwner {
        setRateAddress = _setRateAddress;
    }
    function setVesting(address _beneficiary, uint256 _amount, uint256 _startBlock, uint256 _endBlock) external virtual {
        address _trg = libAddress;
        (bool success, ) = _trg.delegatecall(
            abi.encodeWithSignature("setVesting(address,uint256,uint256,uint256)", _beneficiary, _amount, _startBlock, _endBlock)
        );
        require(success, "Delegatecall failed");
    }
    function claimVesting() external virtual {
        address _trg = libAddress;
        (bool success, ) = _trg.delegatecall(
            abi.encodeWithSignature("claimVesting()")
        );
        require(success, "Delegatecall failed");
    }
    function setKYC(address[] calldata _on, address[] calldata _off) external virtual {
        address _trg = libAddress;
        (bool success, ) = _trg.delegatecall(
            abi.encodeWithSignature("setKYC(address[],address[])", _on, _off)
        );
        require(success, "Delegatecall failed");
    }
    function setTransferRight(address[] calldata _allow, address[] calldata _disallow) external virtual {
        address _trg = libAddress;
        (bool success, ) = _trg.delegatecall(
            abi.encodeWithSignature("setTransferRight(address[],address[])", _allow, _disallow)
        );
        require(success, "Delegatecall failed");
    }
    function setCurrentRate(uint256 _currentRate) external virtual {
        address _trg = libAddress;
        (bool success, ) = _trg.delegatecall(
            abi.encodeWithSignature("setCurrentRate(uint256)", _currentRate)
        );
        require(success, "Delegatecall failed");
    }
    function setCurrentPhase(phaseType _phase) external virtual {
        address _trg = libAddress;
        (bool success, ) = _trg.delegatecall(
            abi.encodeWithSignature("setCurrentPhase(uint8)", _phase)
        );
        require(success, "Delegatecall failed");
    }
    function offchainUpload(address[] calldata _beneficiaries, uint256[] calldata _rewards) external virtual {
        address _trg = libAddress;
        (bool success, ) = _trg.delegatecall(
            abi.encodeWithSignature("offchainUpload(address[],uint256[])", _beneficiaries, _rewards)
        );
        require(success, "Delegatecall failed");
    }
    function buy() public payable virtual {
        address _trg = libAddress;
        (bool success, ) = _trg.delegatecall(
            abi.encodeWithSignature("buy()")
        );
        require(success, "Delegatecall failed");
    }
    /* Constants */
    function allowTransfer(address _owner) public view virtual returns (bool _success, bool _allow) {
        address _trg = libAddress;
        (bool success, bytes memory result) = _trg.staticcall(
            abi.encodeWithSignature("allowTransfer(address)", _owner)
        );
        require(success, "Staticcall failed");
        (_success, _allow) = abi.decode(result, (bool, bool));
    }
    function calculateReward(uint256 _input) public view virtual returns (bool _success, uint256 _reward) {
        address _trg = libAddress;
        (bool success, bytes memory result) = _trg.staticcall(
            abi.encodeWithSignature("calculateReward(uint256)", _input)
        );
        require(success, "Staticcall failed");
        (_success, _reward) = abi.decode(result, (bool, uint256));
    }
    function calcVesting(address _owner) public view virtual returns(bool _success, uint256 _reward) {
        address _trg = libAddress;
        (bool success, bytes memory result) = _trg.staticcall(
            abi.encodeWithSignature("calcVesting(address)", _owner)
        );
        require(success, "Staticcall failed");
        (_success, _reward) = abi.decode(result, (bool, uint256));
    }
    /* Events */
    event Brought(address _owner, address _beneficiary, uint256 _input, uint256 _output);
    event VestingDefined(address _beneficiary, uint256 _amount, uint256 _startBlock, uint256 _endBlock);
    event VestingClaimed(address _beneficiary, uint256 _amount);
}

contract IcoLib is Ico {
    /* Constructor */
    constructor(address _owner, address _tokenAddress, address _offchainUploaderAddress, address _setKYCAddress, address _setRateAddress)
        Ico(_owner, address(0), _tokenAddress, _offchainUploaderAddress, _setKYCAddress, _setRateAddress) {}
    /* Externals */
    function setVesting(address _beneficiary, uint256 _amount, uint256 _startBlock, uint256 _endBlock) 
        external
        override 
        forOwner 
    {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        uint256 amountToAdd = 0;
        
        if (vesting[_beneficiary].amount > 0) {
            amountToAdd = SafeMath.sub(vesting[_beneficiary].amount, vesting[_beneficiary].claimedAmount);
            thisBalance = SafeMath.add(thisBalance, amountToAdd);
        }
        
        if (_amount == 0) {
            delete vesting[_beneficiary];
            emit VestingDefined(_beneficiary, 0, 0, 0);
        } else {
            require(_endBlock > _startBlock, "End block must be greater than start block");
            vesting[_beneficiary] = vesting_s(
                _amount,
                _startBlock,
                _endBlock,
                0
            );
            thisBalance = SafeMath.sub(thisBalance, _amount);
            emit VestingDefined(_beneficiary, _amount, _startBlock, _endBlock);
        }
    }
    
    function claimVesting() external override {
        uint256 _reward;
        bool _subResult;
        (_subResult, _reward) = calcVesting(msg.sender);
        require(_subResult && _reward > 0, "No vesting available to claim");
        vesting[msg.sender].claimedAmount = SafeMath.add(vesting[msg.sender].claimedAmount, _reward);
        require(token.transfer(msg.sender, _reward), "Token transfer failed");
        emit VestingClaimed(msg.sender, _reward);
    }
    
    function setKYC(address[] calldata _on, address[] calldata _off) external override {
        uint256 i;
        require(msg.sender == setKYCAddress, "Not authorized to set KYC");
        for (i=0; i<_on.length; i++) {
            KYC[_on[i]] = true;
        }
        for (i=0; i<_off.length; i++) {
            delete KYC[_off[i]];
        }
    }
    
    function setTransferRight(address[] calldata _allow, address[] calldata _disallow) external override forOwner {
        uint256 i;
        for (i=0; i<_allow.length; i++) {
            transferRight[_allow[i]] = true;
        }
        for (i=0; i<_disallow.length; i++) {
            delete transferRight[_disallow[i]];
        }
    }
    
    function setCurrentRate(uint256 _currentRate) external override {
        require(msg.sender == setRateAddress, "Not authorized to set rate");
        require(_currentRate >= currentRateM, "Rate too low");
        currentRate = _currentRate;
    }
    
    function setCurrentPhase(phaseType _phase) external override forOwner {
        currentPhase = _phase;
    }
    
    function offchainUpload(address[] calldata _beneficiaries, uint256[] calldata _rewards) external override {
        uint256 i;
        uint256 _totalReward = 0;
        require(msg.sender == offchainUploaderAddress, "Not authorized for offchain upload");
        require(currentPhase != phaseType.pause && currentPhase != phaseType.finish, "Invalid phase");
        require(_beneficiaries.length == _rewards.length, "Array length mismatch");
        
        for (i=0; i<_rewards.length; i++) {
            _totalReward = SafeMath.add(_totalReward, _rewards[i]);
            emit Brought(msg.sender, _beneficiaries[i], 0, _rewards[i]);
        }
        
        thisBalance = SafeMath.sub(thisBalance, _totalReward);
        
        if (currentPhase == phaseType.privateSale1) {
            privateSale1Hardcap = SafeMath.sub(privateSale1Hardcap, _totalReward);
        } else if (currentPhase == phaseType.privateSale2) {
            privateSale2Hardcap = SafeMath.sub(privateSale2Hardcap, _totalReward);
        }
        
        require(token.bulkTransfer(_beneficiaries, _rewards), "Bulk transfer failed");
    }
    
    function buy() public payable override {
        uint256 _reward;
        bool _subResult;
        require(currentPhase == phaseType.privateSale2 || 
            currentPhase == phaseType.sales1 || 
            currentPhase == phaseType.sales2 || 
            currentPhase == phaseType.sales3 || 
            currentPhase == phaseType.sales4 || 
            currentPhase == phaseType.preFinish,
            "Invalid phase for buying"
        );
        require(KYC[msg.sender], "KYC not approved");
        (_subResult, _reward) = calculateReward(msg.value);
        require(_reward > 0 && _subResult, "Invalid reward calculation");
        
        thisBalance = SafeMath.sub(thisBalance, _reward);
        
        (bool sent, ) = payable(owner).call{value: msg.value}("");
        require(sent, "Failed to send Ether");
        
        if (currentPhase == phaseType.privateSale1) {
            privateSale1Hardcap = SafeMath.sub(privateSale1Hardcap, _reward);
        } else if (currentPhase == phaseType.privateSale2) {
            privateSale2Hardcap = SafeMath.sub(privateSale2Hardcap, _reward);
        }
        
        require(token.transfer(msg.sender, _reward), "Token transfer failed");
        emit Brought(msg.sender, msg.sender, msg.value, _reward);
    }
    
    /* Constants */
    function allowTransfer(address _owner) public view override returns (bool _success, bool _allow) {
        return (true, _owner == address(this) || transferRight[_owner] || currentPhase == phaseType.preFinish || currentPhase == phaseType.finish);
    }
    
    function calculateReward(uint256 _input) public view override returns (bool _success, uint256 _reward) {
        uint256 _amount;
        _success = true;
        if (currentRate == 0 || _input == 0) {
            return (true, 0);
        }
        
        _amount = SafeMath.div(
            SafeMath.div(
                SafeMath.mul(
                    SafeMath.mul(
                        SafeMath.mul(_input, 1e8),
                        100
                    ),
                    currentRate
                ),
                1e18
            ),
            currentRateM
        ); // 1 token eq 0.01 USD
        
        if (_amount == 0) {
            return (true, 0);
        }
        
        if (currentPhase == phaseType.privateSale1) {
            if (_amount >= 25e13) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 142), 100);
            } else if (_amount >= 10e13) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 137), 100);
            } else if (_amount >= 2e13) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 133), 100);
            }
            if (_reward > 0 && privateSale1Hardcap < _reward) {
                _reward = 0;
            }
        } else if (currentPhase == phaseType.privateSale2) {
            if (_amount >= 125e13) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 129), 100);
            } else if (_amount >= 100e13) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 124), 100);
            } else if (_amount >= 10e13) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 121), 100);
            }
            if (_reward > 0 && privateSale2Hardcap < _reward) {
                _reward = 0;
            }
        } else if (currentPhase == phaseType.sales1) {
            if (_amount >= 1e12) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 117), 100);
            }
        } else if (currentPhase == phaseType.sales2) {
            if (_amount >= 1e12) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 112), 100);
            }
        } else if (currentPhase == phaseType.sales3) {
            if (_amount >= 1e12) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 109), 100);
            }
        } else if (currentPhase == phaseType.sales4) {
            if (_amount >= 1e12) {
                _reward = SafeMath.div(SafeMath.mul(_amount, 102), 100);
            }
        } else if (currentPhase == phaseType.preFinish) {
            _reward = _amount;
        }
        
        if (thisBalance < _reward) {
            _reward = 0;
        }
        
        return (_success, _reward);
    }
    
    function calcVesting(address _owner) public view override returns(bool _success, uint256 _reward) {
        vesting_s memory _vesting = vesting[_owner];
        if (_vesting.amount == 0 || block.number < _vesting.startBlock) {
            return (true, 0);
        }
        
        _reward = SafeMath.div(
            SafeMath.mul(
                _vesting.amount,
                SafeMath.sub(block.number, _vesting.startBlock)
            ),
            SafeMath.sub(_vesting.endBlock, _vesting.startBlock)
        );
        
        if (_reward > _vesting.amount) {
            _reward = _vesting.amount;
        }
        
        if (_reward <= _vesting.claimedAmount) {
            return (true, 0);
        }
        
        return (true, SafeMath.sub(_reward, _vesting.claimedAmount));
    }
}
