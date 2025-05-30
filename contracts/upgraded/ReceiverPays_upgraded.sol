// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract ReceiverPays {
    address owner;

    mapping(uint256 => bool) usedNonces;

    constructor() payable {
        owner = msg.sender;
    }

    function claimPayment(uint256 amount, uint256 nonce, bytes memory signature) public {
        require(!usedNonces[nonce], "Nonce already used");
        usedNonces[nonce] = true;

        // this recreates the message that was signed on the client
        bytes32 message = prefixed(keccak256(abi.encodePacked(msg.sender, amount, nonce, address(this))));

        require(recoverSigner(message, signature) == owner, "Invalid signature");

        // Using call instead of transfer to avoid revert on failure
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    /// destroy the contract and reclaim the leftover funds.
    function kill() public {
        require(msg.sender == owner, "Only owner can kill contract");
        
        // Instead of using the deprecated selfdestruct,
        // transfer the balance to the owner and leave the contract with zero balance
        (bool success, ) = payable(owner).call{value: address(this).balance}("");
        require(success, "Transfer failed");
        
        // Note: This doesn't actually destroy the contract like selfdestruct did,
        // but it achieves the same practical effect of emptying the contract
    }

    /// signature methods.
    function splitSignature(bytes memory sig)
        internal
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            // first 32 bytes, after the length prefix.
            r := mload(add(sig, 32))
            // second 32 bytes.
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes).
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