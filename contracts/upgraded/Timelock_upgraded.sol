// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Ownable {
    address public owner;
    address public newOwner;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
        newOwner = address(0);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "msg.sender == owner");
        _;
    }

    function transferOwnership(address _newOwner) public onlyOwner {
        require(address(0) != _newOwner, "address(0) != _newOwner");
        newOwner = _newOwner;
    }

    function acceptOwnership() public {
        require(msg.sender == newOwner, "msg.sender == newOwner");
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        newOwner = address(0);
    }
}

interface tokenInterface {
    function balanceOf(address _owner) external view returns (uint256 balance);
    function transfer(address _to, uint256 _value) external returns (bool);
}

contract Timelock is Ownable {
    tokenInterface public tokenContract;

    uint256 public releaseTime;

    constructor(address _tokenAddress, uint256 _releaseTime) {
        tokenContract = tokenInterface(_tokenAddress);
        releaseTime = _releaseTime;
    }

    receive() external payable {
        if (msg.sender == newOwner) acceptOwnership();
        claim();
    }
    
    function claim() private onlyOwner {
        require(block.timestamp > releaseTime, "now > releaseTime");
        
        uint256 tknToSend = tokenContract.balanceOf(address(this));
        require(tknToSend > 0, "tknToSend > 0");
            
        require(tokenContract.transfer(msg.sender, tknToSend), "transfer failed");
    }
    
    function unlocked() view public returns(bool) {
        return block.timestamp > releaseTime;
    }
}
