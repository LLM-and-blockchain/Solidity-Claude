const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReceiverPays Contract Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
 
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/ReceiverPays_legacy.sol:ReceiverPays");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/ReceiverPays_upgraded.sol:ReceiverPays");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/ReceiverPays_legacy.sol:ReceiverPays");
    contractVersions.push("contracts/upgraded/ReceiverPays_upgraded.sol:ReceiverPays");
  }

  // Helper function to create signature using ethers v6
  async function createSignature(signer, recipient, amount, nonce, contractAddress) {
    // Create the same message hash that the contract creates
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "uint256", "address"],
        [recipient.address, amount, nonce, contractAddress]
      )
    );
    
    // Sign the message directly using the signer's signMessage
    // This handles the Ethereum specific message prefix internally
    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    
    return signature;
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let contractFactory;
      let receiverPays;
      let owner;
      let account1;
      let account2;
      let isSolidity8OrHigher;
      
      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }
      
      beforeEach(async function () {
        [owner, account1, account2] = await ethers.getSigners();
        detectSolidityVersion();
        
        contractFactory = await ethers.getContractFactory(contractName);
        
        // Deploy with 10 ETH initial balance
        receiverPays = await contractFactory.deploy({
          value: ethers.parseEther("10")
        });
        
        await receiverPays.waitForDeployment();
      });
      
      it("should deploy with correct initial balance", async function () {
        const contractAddress = await receiverPays.getAddress();
        const balance = await ethers.provider.getBalance(contractAddress);
        expect(balance).to.equal(ethers.parseEther("10"));
      });
      
      it("should allow owner to kill the contract", async function () {
        const contractAddress = await receiverPays.getAddress();
        const initialOwnerBalance = await ethers.provider.getBalance(owner.address);
        const initialContractBalance = await ethers.provider.getBalance(contractAddress);
        
        // Kill the contract
        const tx = await receiverPays.kill();
        const receipt = await tx.wait();
        
        // Check if the contract balance is now 0
        const contractBalance = await ethers.provider.getBalance(contractAddress);
        expect(contractBalance).to.equal(0n);
        
        // Owner should have received the contract's balance
        const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
        
        // Calculate gas cost
        const gasUsed = receipt.gasUsed * receipt.gasPrice;
        
        // Owner balance should increase by contract balance minus gas costs
        // Use BigInt for precision
        const expectedBalance = initialOwnerBalance + initialContractBalance - gasUsed;
        
        // Allow for small calculation differences
        const tolerance = ethers.parseEther("0.0001");
        const difference = finalOwnerBalance > expectedBalance ? 
            finalOwnerBalance - expectedBalance : 
            expectedBalance - finalOwnerBalance;
            
        expect(difference).to.be.lt(tolerance);
      });
      
      it("should not allow non-owner to kill the contract", async function () {
        // Try to kill the contract from a non-owner account
        try {
          await receiverPays.connect(account1).kill();
          // Should not reach here
          expect.fail("Non-owner was able to kill the contract");
        } catch (error) {
          // For both versions, we just check that it reverted
          // Hardhat sometimes doesn't expose the exact revert reason in the message
          expect(error.message).to.include("revert");
        }
      });
      
      it("should allow payment claims with valid signature", async function () {
        const contractAddress = await receiverPays.getAddress();
        const paymentAmount = ethers.parseEther("1");
        const nonce = 1;
        
        // Create a valid signature
        const signature = await createSignature(
          owner, 
          account1, 
          paymentAmount,
          nonce,
          contractAddress
        );
        
        const initialBalance = await ethers.provider.getBalance(account1.address);
        
        // Claim payment
        await receiverPays.connect(account1).claimPayment(paymentAmount, nonce, signature);
        
        // Check if account1 received the payment
        const finalBalance = await ethers.provider.getBalance(account1.address);
        
        // Account for gas costs by checking if balance increased appropriately
        // Using BigInt for precise comparisons
        expect(finalBalance > initialBalance).to.be.true;
        expect(finalBalance - initialBalance).to.be.gte(ethers.parseEther("0.9"));
      });
      
      it("should reject payment claims with invalid nonce", async function () {
        const contractAddress = await receiverPays.getAddress();
        const paymentAmount = ethers.parseEther("1");
        const nonce = 2;
        
        // Create a valid signature
        const signature = await createSignature(
          owner, 
          account1, 
          paymentAmount,
          nonce,
          contractAddress
        );
        
        // Claim payment with the valid signature
        await receiverPays.connect(account1).claimPayment(paymentAmount, nonce, signature);
        
        // Try to claim again with the same nonce
        try {
          await receiverPays.connect(account1).claimPayment(paymentAmount, nonce, signature);
          expect.fail("Should not allow reuse of nonce");
        } catch (error) {
          if (isSolidity8OrHigher) {
            // In Solidity 0.8.x, the error message is explicit
            expect(error.message).to.include("Nonce already used");
          } else {
            // In older Solidity versions, we just check that it reverted
            expect(error.message).to.include("revert");
          }
        }
      });
      
      it("should reject payment claims with invalid signature", async function () {
        const contractAddress = await receiverPays.getAddress();
        const paymentAmount = ethers.parseEther("1");
        const nonce = 3;
        
        // Create an invalid signature (signed by the wrong account)
        const invalidSignature = await createSignature(
          account2, 
          account1, 
          paymentAmount,
          nonce,
          contractAddress
        );
        
        // Try to claim with invalid signature
        try {
          await receiverPays.connect(account1).claimPayment(paymentAmount, nonce, invalidSignature);
          expect.fail("Should not allow invalid signature");
        } catch (error) {
          if (isSolidity8OrHigher) {
            // In Solidity 0.8.x, the error message is explicit
            expect(error.message).to.include("Invalid signature");
          } else {
            // In older Solidity versions, we just check that it reverted
            expect(error.message).to.include("revert");
          }
        }
      });
      
      it("should reject payments that exceed contract balance", async function () {
        const contractAddress = await receiverPays.getAddress();
        // Try to claim more than the contract has
        const excessiveAmount = ethers.parseEther("11");
        const nonce = 4;
        
        // Create a valid signature for an excessive amount
        const signature = await createSignature(
          owner, 
          account1, 
          excessiveAmount,
          nonce,
          contractAddress
        );
        
        // Try to claim with excessive amount
        try {
          await receiverPays.connect(account1).claimPayment(excessiveAmount, nonce, signature);
          expect.fail("Should not allow excessive withdrawal");
        } catch (error) {
          // Both versions should revert, but 0.8.x might have more specific error message
          expect(error.message).to.include("revert");
        }
      });
      
      it("should handle multiple valid claims correctly", async function () {
        const contractAddress = await receiverPays.getAddress();
        const paymentAmount1 = ethers.parseEther("1");
        const paymentAmount2 = ethers.parseEther("2");
        const nonce1 = 5;
        const nonce2 = 6;
        
        // Create two valid signatures
        const signature1 = await createSignature(
          owner, 
          account1, 
          paymentAmount1,
          nonce1,
          contractAddress
        );
        
        const signature2 = await createSignature(
          owner, 
          account2, 
          paymentAmount2,
          nonce2,
          contractAddress
        );
        
        const initialBalance1 = await ethers.provider.getBalance(account1.address);
        const initialBalance2 = await ethers.provider.getBalance(account2.address);
        
        // Claim payments
        await receiverPays.connect(account1).claimPayment(paymentAmount1, nonce1, signature1);
        await receiverPays.connect(account2).claimPayment(paymentAmount2, nonce2, signature2);
        
        // Check if accounts received payments
        const finalBalance1 = await ethers.provider.getBalance(account1.address);
        const finalBalance2 = await ethers.provider.getBalance(account2.address);
        
        // Account for gas costs - using BigInt for precise comparisons
        expect(finalBalance1 > initialBalance1).to.be.true;
        expect(finalBalance2 > initialBalance2).to.be.true;
        
        // Rough checks accounting for gas
        expect(finalBalance1 - initialBalance1).to.be.gte(ethers.parseEther("0.9"));
        expect(finalBalance2 - initialBalance2).to.be.gte(ethers.parseEther("1.9"));
      });
    });
  });
});