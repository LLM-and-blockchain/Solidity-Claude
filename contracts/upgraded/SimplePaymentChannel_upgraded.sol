// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract SimplePaymentChannel {
    address payable public sender;      // The account sending payments.
    address payable public recipient;   // The account receiving the payments.
    uint256 public expiration;  // Timeout in case the recipient never closes.

    constructor (address payable _recipient, uint256 duration)
        payable
    {
        sender = payable(msg.sender);
        recipient = _recipient;
        expiration = block.timestamp + duration;
    }

    function isValidSignature(uint256 amount, bytes memory signature)
        internal
        view
        returns (bool)
    {
        bytes32 message = prefixed(keccak256(abi.encodePacked(address(this), amount)));

        // check that the signature is from the payment sender
        return recoverSigner(message, signature) == sender;
    }

    /// the recipient can close the channel at any time by presenting a
    /// signed amount from the sender. the recipient will be sent that amount,
    /// and the remainder will go back to the sender
    function close(uint256 amount, bytes memory signature) public {
        require(msg.sender == recipient, "Only recipient can close the channel");
        require(isValidSignature(amount, signature), "Invalid signature");
        require(amount <= address(this).balance, "Insufficient contract balance");

        // Transfer to recipient
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
        
        // Transfer remaining balance to sender instead of using selfdestruct
        uint256 remainingBalance = address(this).balance;
        if (remainingBalance > 0) {
            (success, ) = sender.call{value: remainingBalance}("");
            require(success, "Transfer to sender failed");
        }
    }

    /// the sender can extend the expiration at any time
    function extend(uint256 newExpiration) public {
        require(msg.sender == sender, "Only sender can extend expiration");
        require(newExpiration > expiration, "New expiration must be after current expiration");

        expiration = newExpiration;
    }

    /// if the timeout is reached without the recipient closing the channel,
    /// then the Ether is released back to the sender.
    function claimTimeout() public {
        require(block.timestamp >= expiration, "Channel not expired yet");
        
        // Transfer all funds to sender instead of using selfdestruct
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = sender.call{value: balance}("");
            require(success, "Transfer to sender failed");
        }
    }

    /// All functions below this are just taken from the chapter
    /// 'creating and verifying signatures' chapter.

    function splitSignature(bytes memory sig)
        internal
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        return (v, r, s);
    }

    function recoverSigner(bytes32 message, bytes memory sig)
        internal
        pure
        returns (address)
    {
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(sig);

        return ecrecover(message, v, r, s);
    }

    /// builds a prefixed hash to mimic the behavior of eth_sign.
    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }
}
