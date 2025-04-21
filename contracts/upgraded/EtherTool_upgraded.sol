// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

library SafeMath {
  function mul(uint256 a, uint256 b) internal pure returns (uint256 c) {
    if (a == 0) {
      return 0;
    }
    c = a * b;
    assert(c / a == b);
    return c;
  }

  function div(uint256 a, uint256 b) internal pure returns (uint256) {
    // assert(b > 0); // Solidity automatically throws when dividing by 0
    // uint256 c = a / b;
    // assert(a == b * c + a % b); // There is no case in which this doesn't hold
    return a / b;
  }

  function sub(uint256 a, uint256 b) internal pure returns (uint256) {
    assert(b <= a);
    return a - b;
  }

  function add(uint256 a, uint256 b) internal pure returns (uint256 c) {
    c = a + b;
    assert(c >= a);
    return c;
  }
}


contract EtherTool { 
    using SafeMath for uint256;     

    // Updated constructor syntax for Solidity 0.8.x
    constructor() {
    }

    bool public globalLocked = false;     

    function lock() internal {            
        require(!globalLocked, "Contract is locked");
        globalLocked = true;
    }

    function unLock() internal {
        require(globalLocked, "Contract is not locked");
        globalLocked = false;
    }    

    mapping (address => uint256) public userEtherOf;    
    
    function depositEther() public payable {
        if (msg.value > 0){
            userEtherOf[msg.sender] = userEtherOf[msg.sender].add(msg.value);  
        }
    }
    
    function withdrawEther() public returns(bool _result) {                  
        return _withdrawEther(msg.sender);
    }
    
    function withdrawEtherTo(address _user) public returns(bool _result) {     
        return _withdrawEther(_user);
    }

    function _withdrawEther(address _to) internal returns(bool _result) {     
        require(_to != address(0), "Invalid address");  
        lock();
        uint256 amount = userEtherOf[msg.sender];   
        if(amount > 0) {
            userEtherOf[msg.sender] = 0;
            // Updated to handle transfer failures in 0.8.x
            (bool success, ) = _to.call{value: amount}("");
            require(success, "Transfer failed");
            _result = true;
        }
        else {
            _result = false;
        }
        unLock();
    }
    
    uint public currentEventId = 1;                                    

    function getEventId() internal returns(uint _result) {           
        _result = currentEventId;
        currentEventId++;
    }

    event OnTransfer(address indexed _sender, address indexed _to, bool indexed _done, uint256 _amount, uint _eventTime, uint eventId);

    function batchTransfer1(address[] memory _tos, uint256 _amount) public payable returns (uint256 _doneNum){
        lock();
        if(msg.value > 0) {          
            userEtherOf[msg.sender] = userEtherOf[msg.sender].add(msg.value);
        }
        require(_amount > 0, "Amount must be greater than 0");
        require(_tos.length > 0, "Recipients list cannot be empty");

        _doneNum = 0;
        for(uint i = 0; i < _tos.length; i++){
            bool done = false;
            address to = _tos[i];
            if(to != address(0) && userEtherOf[msg.sender] >= _amount){
                userEtherOf[msg.sender] = userEtherOf[msg.sender].sub(_amount);
                // Updated to handle transfer failures in 0.8.x
                (bool success, ) = to.call{value: _amount}("");
                if (success) {
                    _doneNum = _doneNum.add(1);
                    done = true;
                } else {
                    // Revert the deduction if transfer fails
                    userEtherOf[msg.sender] = userEtherOf[msg.sender].add(_amount);
                }
            }
            emit OnTransfer(msg.sender, to, done, _amount, block.timestamp, getEventId());
        }
        unLock();
    }

    function batchTransfer2(address[] memory _tos, uint256[] memory _amounts) public payable returns (uint256 _doneNum){
        lock();
        if(msg.value > 0) {          
            userEtherOf[msg.sender] = userEtherOf[msg.sender].add(msg.value);
        }
        require(_amounts.length > 0, "Amounts list cannot be empty");
        require(_tos.length > 0, "Recipients list cannot be empty");
        require(_tos.length == _amounts.length, "Recipients and amounts must match");

        _doneNum = 0;
        for(uint i = 0; i < _tos.length; i++){
            bool done = false;
            address to = _tos[i];
            uint256 amount = _amounts[i]; 
            if((to != address(0)) && (amount > 0) && (userEtherOf[msg.sender] >= amount)){
                userEtherOf[msg.sender] = userEtherOf[msg.sender].sub(amount);
                // Updated to handle transfer failures in 0.8.x
                (bool success, ) = to.call{value: amount}("");
                if (success) {
                    _doneNum = _doneNum.add(1);
                    done = true;
                } else {
                    // Revert the deduction if transfer fails
                    userEtherOf[msg.sender] = userEtherOf[msg.sender].add(amount);
                }
            }
            emit OnTransfer(msg.sender, to, done, amount, block.timestamp, getEventId());
        }
        unLock();
    }
        
    function uint8ToString(uint8 v) private pure returns (string memory) {
        // Updated return type to include 'memory' keyword
        uint maxlength = 8;
        bytes memory reversed = new bytes(maxlength);
        uint i = 0;
        while (v != 0) {
            uint remainder = v % 10;
            v = v / 10;
            reversed[i++] = bytes1(uint8(48 + remainder));
        }
        bytes memory s = new bytes(i);
        for (uint j = 0; j < i; j++) {
            s[j] = reversed[i - j - 1];
        }
        string memory str = string(s);
        return str;
    }

    function getBytes32() public view returns (bytes32 _result){
        // Updated to use current block.timestamp and blockhash access
        _result = keccak256(abi.encodePacked(block.timestamp, blockhash(block.number - 1)));
    }

    function getHash1(uint8[5] memory _winWhiteBall, uint8 _winRedBall, bytes32 _nonce) public pure returns (bytes32 _result){
        // Updated keccak256 to use abi.encodePacked
        _result = keccak256(abi.encodePacked(_winWhiteBall, _winRedBall, _nonce));
    }

    function getHash2(address _user, bytes32 _nonce) public pure returns (bytes32 _result){
        // Updated keccak256 to use abi.encodePacked
        _result = keccak256(abi.encodePacked(_user, _nonce));
    }

    // Updated fallback function syntax for 0.8.x
    receive() external payable {
        if(msg.value > 0) {          
            userEtherOf[msg.sender] = userEtherOf[msg.sender].add(msg.value);
        }
    }

    // Added fallback to maintain compatibility with old interface
    fallback() external payable {
        if(msg.value > 0) {          
            userEtherOf[msg.sender] = userEtherOf[msg.sender].add(msg.value);
        }
    }
}