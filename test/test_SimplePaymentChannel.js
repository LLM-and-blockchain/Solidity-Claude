const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("SimplePaymentChannel Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/SimplePaymentChannel_legacy.sol:SimplePaymentChannel");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/SimplePaymentChannel_upgraded.sol:SimplePaymentChannel");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/SimplePaymentChannel_legacy.sol:SimplePaymentChannel");
    contractVersions.push("contracts/upgraded/SimplePaymentChannel_upgraded.sol:SimplePaymentChannel");
  }

  // Helper function to sign messages
  async function signPayment(signer, contractAddress, amount) {
    // Format the message as expected by the contract
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256"],
        [contractAddress, amount]
      )
    );
    
    // Sign the raw hash (not the prefixed one, as the contract handles prefixing)
    return signer.signMessage(ethers.getBytes(messageHash));
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let contract;
      let sender;
      let recipient;
      let other;
      let isSolidity8OrHigher;
      let mockStartTime;
      
      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }
      
      // Fixture to deploy the contract
      async function deployContractFixture() {
        [sender, recipient, other] = await ethers.getSigners();
        detectSolidityVersion();
        
        // Duration of 1 hour in seconds
        const duration = 60 * 60;
        const initialDeposit = ethers.parseEther("1.0");
        
        // Get the current block timestamp to use as a reference
        const latestBlock = await ethers.provider.getBlock("latest");
        mockStartTime = latestBlock.timestamp;
        
        const ContractFactory = await ethers.getContractFactory(contractName);
        const contract = await ContractFactory.deploy(
          recipient.address, 
          duration,
          { value: initialDeposit }
        );
        await contract.waitForDeployment();
        
        return { contract, sender, recipient, other, duration, initialDeposit, mockStartTime };
      }
      
      beforeEach(async function () {
        ({ contract, sender, recipient, other, mockStartTime } = await loadFixture(deployContractFixture));
      });
      
      describe("Contract Deployment", function() {
        it("Should set the correct sender", async function() {
          expect(await contract.sender()).to.equal(sender.address);
        });
        
        it("Should set the correct recipient", async function() {
          expect(await contract.recipient()).to.equal(recipient.address);
        });
        
        it("Should set the expiration time correctly", async function() {
          const expiration = await contract.expiration();
          
          // In Solidity 0.4-0.5, 'now' is used which is block.timestamp
          // In Solidity 0.8+, we explicitly use block.timestamp
          // Both should set expiration to currentTimestamp + duration (3600 seconds)
          const expectedExpiration = BigInt(mockStartTime) + BigInt(3600);
          
          // Use a larger tolerance (15 minutes) to account for test environment variations
          const toleranceSeconds = 900; // 15 minutes
          
          expect(expiration).to.be.closeTo(
            expectedExpiration,
            BigInt(toleranceSeconds)
          );
        });
        
        it("Should have the correct initial balance", async function() {
          const balance = await ethers.provider.getBalance(await contract.getAddress());
          expect(balance).to.equal(ethers.parseEther("1.0"));
        });
      });
      
      describe("Extending Channel", function() {
        it("Should allow sender to extend expiration", async function() {
          const originalExpiration = await contract.expiration();
          const newExpiration = originalExpiration + BigInt(3600); // Add another hour
          
          await contract.connect(sender).extend(newExpiration);
          
          expect(await contract.expiration()).to.equal(newExpiration);
        });
        
        it("Should not allow extending to an earlier time", async function() {
          const originalExpiration = await contract.expiration();
          const earlierExpiration = originalExpiration - BigInt(1);
          
          // The error handling differs between Solidity versions
          if (isSolidity8OrHigher) {
            // Solidity 0.8.x has more specific revert reasons
            await expect(
              contract.connect(sender).extend(earlierExpiration)
            ).to.be.revertedWith("New expiration must be after current expiration");
          } else {
            // Legacy version just reverts without a specific reason
            await expect(
              contract.connect(sender).extend(earlierExpiration)
            ).to.be.reverted;
          }
        });
        
        it("Should not allow non-sender to extend expiration", async function() {
          const originalExpiration = await contract.expiration();
          const newExpiration = originalExpiration + BigInt(3600);
          
          if (isSolidity8OrHigher) {
            await expect(
              contract.connect(recipient).extend(newExpiration)
            ).to.be.revertedWith("Only sender can extend expiration");
          } else {
            await expect(
              contract.connect(recipient).extend(newExpiration)
            ).to.be.reverted;
          }
        });
      });
      
      describe("Closing Channel", function() {
        it("Should allow recipient to close channel with valid signature", async function() {
          const paymentAmount = ethers.parseEther("0.5");
          const contractAddress = await contract.getAddress();
          
          // Sign the payment with the sender's key
          const signature = await signPayment(sender, contractAddress, paymentAmount);
          
          // Track balances before and after closing
          const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);
          const contractBalanceBefore = await ethers.provider.getBalance(contractAddress);
          
          // Close the channel
          const tx = await contract.connect(recipient).close(paymentAmount, signature);
          const receipt = await tx.wait();
          const gasUsed = receipt.gasUsed * receipt.gasPrice;
          
          // Check recipient received the payment
          const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
          const expectedRecipientBalance = recipientBalanceBefore + paymentAmount - gasUsed;
          
          expect(recipientBalanceAfter).to.be.closeTo(
            expectedRecipientBalance,
            ethers.parseEther("0.01") // Allow for some rounding/gas estimation variance
          );
          
          // For both versions, the contract should have a zero balance after closing
          const contractBalanceAfter = await ethers.provider.getBalance(contractAddress);
          expect(contractBalanceAfter).to.equal(0);
        });
        
        it("Should not allow non-recipient to close channel", async function() {
          const paymentAmount = ethers.parseEther("0.5");
          const contractAddress = await contract.getAddress();
          
          // Sign the payment with the sender's key
          const signature = await signPayment(sender, contractAddress, paymentAmount);
          
          if (isSolidity8OrHigher) {
            await expect(
              contract.connect(other).close(paymentAmount, signature)
            ).to.be.revertedWith("Only recipient can close the channel");
          } else {
            await expect(
              contract.connect(other).close(paymentAmount, signature)
            ).to.be.reverted;
          }
        });
        
        it("Should not allow closing with invalid signature", async function() {
          const paymentAmount = ethers.parseEther("0.5");
          const contractAddress = await contract.getAddress();
          
          // Sign with the wrong account
          const signature = await signPayment(recipient, contractAddress, paymentAmount);
          
          if (isSolidity8OrHigher) {
            await expect(
              contract.connect(recipient).close(paymentAmount, signature)
            ).to.be.revertedWith("Invalid signature");
          } else {
            await expect(
              contract.connect(recipient).close(paymentAmount, signature)
            ).to.be.reverted;
          }
        });
      });
      
      describe("Timeout Claiming", function() {
        it("Should not allow claiming timeout before expiration", async function() {
          if (isSolidity8OrHigher) {
            await expect(contract.claimTimeout()).to.be.revertedWith("Channel not expired yet");
          } else {
            await expect(contract.claimTimeout()).to.be.reverted;
          }
        });
        
        it("Should allow claiming timeout after expiration", async function() {
          // This test requires time manipulation
          // For hardhat, we increase time and mine a new block
          await ethers.provider.send("evm_increaseTime", [3601]); // 1 hour + 1 second
          await ethers.provider.send("evm_mine");
          
          const senderBalanceBefore = await ethers.provider.getBalance(sender.address);
          const contractBalance = await ethers.provider.getBalance(await contract.getAddress());
          
          const tx = await contract.connect(sender).claimTimeout();
          const receipt = await tx.wait();
          const gasUsed = receipt.gasUsed * receipt.gasPrice;
          
          const senderBalanceAfter = await ethers.provider.getBalance(sender.address);
          
          // Allow for some variance in gas estimation
          const expectedBalance = senderBalanceBefore + contractBalance - gasUsed;
          expect(senderBalanceAfter).to.be.closeTo(
            expectedBalance,
            ethers.parseEther("0.01")
          );
          
          // For both versions, the contract should have a zero balance after claiming timeout
          const contractBalanceAfter = await ethers.provider.getBalance(await contract.getAddress());
          expect(contractBalanceAfter).to.equal(0);
        });
      });
    });
  });
});
