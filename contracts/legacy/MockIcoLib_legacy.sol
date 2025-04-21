pragma solidity 0.4.24;

contract TokenDBMockLegacy {
    address public owner;
    
    constructor(address _owner) public {
        owner = _owner;
    }
    
    function transfer(address /* _from */, address /* _to */, uint256 /* _amount */) external pure returns(bool _success) {
        return true;
    }
    
    function bulkTransfer(address /* _from */, address[] /* _to */, uint256[] /* _amount */) external pure returns(bool _success) {
        return true;
    }
    
    function setAllowance(address /* _owner */, address /* _spender */, uint256 /* _amount */) external pure returns(bool _success) {
        return true;
    }
    
    function getAllowance(address /* _owner */, address /* _spender */) public pure returns(bool _success, uint256 _remaining) {
        return (true, 1000000);
    }
    
    function balanceOf(address /* _owner */) public pure returns(bool _success, uint256 _balance) {
        return (true, 1000000);
    }
}

contract TokenMockLegacy {
    address public owner;
    address public icoAddress;
    bool public transferSuccess = true;
    
    constructor(address _owner) public {
        owner = _owner;
    }
    
    function changeIcoAddress(address _icoAddress) external {
        icoAddress = _icoAddress;
    }
    
    function transfer(address /* _to */, uint256 /* _amount */) external view returns (bool _success) {
        return transferSuccess;
    }
    
    function bulkTransfer(address[] /* _to */, uint256[] /* _amount */) external view returns (bool _success) {
        return transferSuccess;
    }
    
    function setTransferSuccess(bool _success) external {
        transferSuccess = _success;
    }
}