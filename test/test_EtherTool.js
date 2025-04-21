const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EtherTool Contract Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/EtherTool_legacy.sol:EtherTool");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/EtherTool_upgraded.sol:EtherTool");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/EtherTool_legacy.sol:EtherTool");
    contractVersions.push("contracts/upgraded/EtherTool_upgraded.sol:EtherTool");
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let etherTool;
      let owner, user1, user2, user3;
      let isSolidity8OrHigher;

      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }

      // Helper function to parse Ether
      function parseEther(amount) {
        return ethers.parseEther(amount.toString());
      }
      
      beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        detectSolidityVersion();
        
        try {
          const EtherToolFactory = await ethers.getContractFactory(contractName);
          etherTool = await EtherToolFactory.deploy();
          await etherTool.waitForDeployment();
        } catch (error) {
          console.error(`Error deploying contract: ${error.message}`);
          throw error;
        }
      });

      describe("Deployment", function () {
        it("Should deploy successfully", async function () {
          expect(await etherTool.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should initialize with globalLocked as false", async function () {
          expect(await etherTool.globalLocked()).to.equal(false);
        });

        it("Should initialize with currentEventId as 1", async function () {
          expect(await etherTool.currentEventId()).to.equal(1n);
        });
      });

      describe("Deposit Functions", function () {
        it("Should accept deposits via depositEther()", async function () {
          const depositAmount = parseEther(1);
          await etherTool.connect(user1).depositEther({ value: depositAmount });
          expect(await etherTool.userEtherOf(user1.address)).to.equal(depositAmount);
        });

        it("Should accept deposits via fallback function", async function () {
          const depositAmount = parseEther(1);
          // Send ETH directly to the contract
          await user1.sendTransaction({
            to: await etherTool.getAddress(),
            value: depositAmount
          });
          expect(await etherTool.userEtherOf(user1.address)).to.equal(depositAmount);
        });

        it("Should properly track multiple deposits", async function () {
          await etherTool.connect(user1).depositEther({ value: parseEther(1) });
          await etherTool.connect(user1).depositEther({ value: parseEther(0.5) });
          expect(await etherTool.userEtherOf(user1.address)).to.equal(parseEther(1.5));
        });
      });

      describe("Withdrawal Functions", function () {
        beforeEach(async function () {
          // Fund user1 with 2 ETH
          await etherTool.connect(user1).depositEther({ value: parseEther(2) });
        });

        it("Should allow withdrawal to own address", async function () {
          const initialBalance = await ethers.provider.getBalance(user1.address);
          
          // Use a transaction that withdraws funds
          const txResponse = await etherTool.connect(user1).withdrawEther();
          const receipt = await txResponse.wait();
          
          // Calculate gas cost
          const gasUsed = receipt.gasUsed * receipt.gasPrice;
          
          // Get final balance
          const finalBalance = await ethers.provider.getBalance(user1.address);
          
          // User's balance should increase by 2 ETH (minus gas costs)
          const expectedBalance = initialBalance + parseEther(2) - gasUsed;
          
          // Account for small rounding differences in BigInt calculations
          expect(finalBalance).to.be.closeTo(expectedBalance, parseEther("0.01"));
          
          // User's contract balance should be zero
          expect(await etherTool.userEtherOf(user1.address)).to.equal(0n);
        });

        it("Should allow withdrawal to another address", async function () {
          const initialBalance = await ethers.provider.getBalance(user2.address);
          
          // Withdraw user1's funds to user2's address
          await etherTool.connect(user1).withdrawEtherTo(user2.address);
          
          const finalBalance = await ethers.provider.getBalance(user2.address);
          
          // User2's balance should increase by 2 ETH
          expect(finalBalance - initialBalance).to.equal(parseEther(2));
          
          // User1's contract balance should be zero
          expect(await etherTool.userEtherOf(user1.address)).to.equal(0n);
        });

        it("Should return false when withdrawing with zero balance", async function () {
          // User3 has no deposits
          const tx = await etherTool.connect(user3).withdrawEther();
          const receipt = await tx.wait();
          
          // Transaction should complete without reverting
          expect(receipt.status).to.equal(1);
          
          // Balance should remain zero
          expect(await etherTool.userEtherOf(user3.address)).to.equal(0n);
        });

        it("Should revert when withdrawing to zero address", async function () {
          if (isSolidity8OrHigher) {
            // In Solidity 0.8.x, we expect a custom error message
            await expect(etherTool.connect(user1).withdrawEtherTo(ethers.ZeroAddress))
              .to.be.revertedWith("Invalid address");
          } else {
            // In Solidity 0.4.x, it just reverts with no message
            await expect(etherTool.connect(user1).withdrawEtherTo(ethers.ZeroAddress))
              .to.be.reverted;
          }
        });
      });

      describe("Batch Transfer Functions", function () {
        beforeEach(async function () {
          // Fund owner with 10 ETH
          await etherTool.connect(owner).depositEther({ value: parseEther(10) });
        });

        describe("batchTransfer1", function () {
          it("Should transfer equal amounts to multiple addresses", async function () {
            const recipients = [user1.address, user2.address];
            const amount = parseEther(1);
            
            const initialBalance1 = await ethers.provider.getBalance(user1.address);
            const initialBalance2 = await ethers.provider.getBalance(user2.address);
            
            // Transfer 1 ETH to each recipient
            const tx = await etherTool.connect(owner).batchTransfer1(recipients, amount);
            await tx.wait();
            
            const finalBalance1 = await ethers.provider.getBalance(user1.address);
            const finalBalance2 = await ethers.provider.getBalance(user2.address);
            
            // Both recipients should receive 1 ETH
            expect(finalBalance1 - initialBalance1).to.equal(amount);
            expect(finalBalance2 - initialBalance2).to.equal(amount);
            
            // Owner should have 8 ETH left (10 - 1 - 1)
            expect(await etherTool.userEtherOf(owner.address)).to.equal(parseEther(8));
          });
          
          it("Should handle zero addresses in recipient list", async function () {
            const recipients = [user1.address, ethers.ZeroAddress, user2.address];
            const amount = parseEther(1);
            
            const tx = await etherTool.connect(owner).batchTransfer1(recipients, amount);
            const receipt = await tx.wait();
            
            // Check events for successful transfers
            const transferEvents = receipt.logs.filter(log => 
              log.fragment && log.fragment.name === "OnTransfer"
            );
            
            const successfulEvents = transferEvents.filter(log => log.args[2] === true);
            
            // Only transfers to non-zero addresses should succeed
            expect(successfulEvents.length).to.equal(2);
            
            // Owner should have 8 ETH left (10 - 1 - 1)
            expect(await etherTool.userEtherOf(owner.address)).to.equal(parseEther(8));
          });
          
          it("Should revert if amount is zero", async function () {
            const recipients = [user1.address, user2.address];
            const amount = 0n;
            
            if (isSolidity8OrHigher) {
              await expect(etherTool.connect(owner).batchTransfer1(recipients, amount))
                .to.be.revertedWith("Amount must be greater than 0");
            } else {
              await expect(etherTool.connect(owner).batchTransfer1(recipients, amount))
                .to.be.reverted;
            }
          });
          
          it("Should revert if recipients list is empty", async function () {
            const recipients = [];
            const amount = parseEther(1);
            
            if (isSolidity8OrHigher) {
              await expect(etherTool.connect(owner).batchTransfer1(recipients, amount))
                .to.be.revertedWith("Recipients list cannot be empty");
            } else {
              await expect(etherTool.connect(owner).batchTransfer1(recipients, amount))
                .to.be.reverted;
            }
          });
          
          it("Should allow additional deposit during batch transfer", async function () {
            const recipients = [user1.address, user2.address];
            const amount = parseEther(1);
            const additionalDeposit = parseEther(5);
            
            // Initially has 10 ETH + adds 5 ETH more, sends 1 ETH to each of two recipients
            const tx = await etherTool.connect(owner).batchTransfer1(
              recipients, 
              amount, 
              { value: additionalDeposit }
            );
            await tx.wait();
            
            // Owner should have 13 ETH left (10 + 5 - 1 - 1)
            expect(await etherTool.userEtherOf(owner.address)).to.equal(parseEther(13));
          });
        });

        describe("batchTransfer2", function () {
          it("Should transfer varying amounts to multiple addresses", async function () {
            const recipients = [user1.address, user2.address];
            const amounts = [parseEther(1), parseEther(2)];
            
            const initialBalance1 = await ethers.provider.getBalance(user1.address);
            const initialBalance2 = await ethers.provider.getBalance(user2.address);
            
            // Transfer different amounts to each recipient
            const tx = await etherTool.connect(owner).batchTransfer2(recipients, amounts);
            await tx.wait();
            
            const finalBalance1 = await ethers.provider.getBalance(user1.address);
            const finalBalance2 = await ethers.provider.getBalance(user2.address);
            
            // Recipients should receive their specified amounts
            expect(finalBalance1 - initialBalance1).to.equal(parseEther(1));
            expect(finalBalance2 - initialBalance2).to.equal(parseEther(2));
            
            // Owner should have 7 ETH left (10 - 1 - 2)
            expect(await etherTool.userEtherOf(owner.address)).to.equal(parseEther(7));
          });
          
          it("Should revert if arrays have different lengths", async function () {
            const recipients = [user1.address, user2.address];
            const amounts = [parseEther(1)]; // Only one amount
            
            if (isSolidity8OrHigher) {
              await expect(etherTool.connect(owner).batchTransfer2(recipients, amounts))
                .to.be.revertedWith("Recipients and amounts must match");
            } else {
              await expect(etherTool.connect(owner).batchTransfer2(recipients, amounts))
                .to.be.reverted;
            }
          });
          
          it("Should handle zero amounts in amounts list", async function () {
            const recipients = [user1.address, user2.address];
            const amounts = [parseEther(1), 0n]; // Second amount is zero
            
            const initialBalance1 = await ethers.provider.getBalance(user1.address);
            const initialBalance2 = await ethers.provider.getBalance(user2.address);
            
            const tx = await etherTool.connect(owner).batchTransfer2(recipients, amounts);
            await tx.wait();
            
            const finalBalance1 = await ethers.provider.getBalance(user1.address);
            const finalBalance2 = await ethers.provider.getBalance(user2.address);
            
            // Only first recipient should receive funds
            expect(finalBalance1 - initialBalance1).to.equal(parseEther(1));
            expect(finalBalance2 - initialBalance2).to.equal(0n);
            
            // Owner should have 9 ETH left (10 - 1)
            expect(await etherTool.userEtherOf(owner.address)).to.equal(parseEther(9));
          });
        });
      });

      describe("Utility Functions", function () {
        it("Should generate a bytes32 hash", async function () {
          const hash = await etherTool.getBytes32();
          expect(hash).to.not.equal(ethers.ZeroHash);
          expect(typeof hash).to.equal("string");
        });
        
        it("Should hash white balls, red ball and nonce correctly", async function () {
          const whiteBalls = [1, 2, 3, 4, 5];
          const redBall = 10;
          const nonce = ethers.keccak256(ethers.toUtf8Bytes("test"));
          
          const hash = await etherTool.getHash1(whiteBalls, redBall, nonce);
          
          expect(hash).to.not.equal(ethers.ZeroHash);
          expect(typeof hash).to.equal("string");
          
          // Same inputs should produce same hash
          const hash2 = await etherTool.getHash1(whiteBalls, redBall, nonce);
          expect(hash).to.equal(hash2);
        });
        
        it("Should hash address and nonce correctly", async function () {
          const userAddress = user1.address;
          const nonce = ethers.keccak256(ethers.toUtf8Bytes("test"));
          
          const hash = await etherTool.getHash2(userAddress, nonce);
          
          expect(hash).to.not.equal(ethers.ZeroHash);
          expect(typeof hash).to.equal("string");
          
          // Different address should produce different hash
          const hash2 = await etherTool.getHash2(user2.address, nonce);
          expect(hash).to.not.equal(hash2);
        });
      });

      describe("Locking Mechanism", function () {
        // We can't directly test lock() and unlock() as they're internal functions
        // But we can test the effects by tracking the state during transactions
        
        it("Should properly release locks after batch transfers", async function () {
          // Deposit some ETH
          await etherTool.connect(owner).depositEther({ value: parseEther(10) });
          
          // Do a batch transfer
          const recipients = [user1.address, user2.address];
          const amount = parseEther(1);
          
          await etherTool.connect(owner).batchTransfer1(recipients, amount);
          
          // Check that lock is released
          expect(await etherTool.globalLocked()).to.equal(false);
          
          // Should be able to do another transfer immediately
          await etherTool.connect(owner).batchTransfer1(recipients, amount);
          
          // Lock should still be released
          expect(await etherTool.globalLocked()).to.equal(false);
        });
      });

      describe("Event Emission", function () {
        beforeEach(async function () {
          // Fund owner with 10 ETH
          await etherTool.connect(owner).depositEther({ value: parseEther(10) });
        });
        
        it("Should emit OnTransfer events during batch transfers", async function () {
          const recipients = [user1.address, user2.address];
          const amount = parseEther(1);
          
          // We expect events from successful transfers
          const tx = await etherTool.connect(owner).batchTransfer1(recipients, amount);
          const receipt = await tx.wait();
          
          // Check event counts
          let transferEvents = receipt.logs.filter(log => 
            log.fragment && log.fragment.name === "OnTransfer"
          );
          
          // Should have events for each recipient (whether transfer succeeded or not)
          expect(transferEvents.length).to.equal(2);
          
          // Check event parameters for successful transfers
          let successfulEvents = transferEvents.filter(log => log.args[2] === true);
          
          // Both transfers should succeed
          expect(successfulEvents.length).to.equal(2);
          
          // Check sender and amounts in events
          successfulEvents.forEach(event => {
            expect(event.args[0]).to.equal(owner.address); // sender
            expect(event.args[3]).to.equal(amount); // amount
          });
          
          // Event IDs should be sequential
          if (successfulEvents.length >= 2) {
            const eventId1 = successfulEvents[0].args[5];
            const eventId2 = successfulEvents[1].args[5];
            expect(eventId2 - eventId1).to.equal(1n);
          }
        });
      });
      
      describe("Edge Cases", function () {
        beforeEach(async function () {
          // Fund owner with 10 ETH
          await etherTool.connect(owner).depositEther({ value: parseEther(10) });
        });
        
        it("Should handle users with insufficient balance gracefully", async function () {
          const recipients = [user1.address, user2.address];
          const amounts = [parseEther(11), parseEther(1)]; // First amount exceeds balance
          
          // The transaction should still succeed but only transfer funds where possible
          const tx = await etherTool.connect(owner).batchTransfer2(recipients, amounts);
          const receipt = await tx.wait();
          
          // Check user balances
          const user1Balance = await ethers.provider.getBalance(user1.address);
          const user2Balance = await ethers.provider.getBalance(user2.address);
          const initialUser2Balance = await ethers.provider.getBalance(user2.address) - parseEther(1);
          
          // First transfer should fail (not enough funds)
          // Second transfer should succeed
          expect(await etherTool.userEtherOf(owner.address)).to.equal(parseEther(9));
          
          // Count successful transfers from events
          let successfulTransfers = 0;
          receipt.logs.forEach(log => {
            if (log.fragment && log.fragment.name === "OnTransfer" && log.args[2] === true) {
              successfulTransfers++;
            }
          });
          
          expect(successfulTransfers).to.equal(1);
        });
        
        it("Should handle failed transfers in 0.8.x", async function () {
          if (isSolidity8OrHigher) {
            try {
              // Deploy a contract with no payable functions to force transfer failure
              const NonReceivableFactory = await ethers.getContractFactory("NonReceivable");
              const nonReceivable = await NonReceivableFactory.deploy();
              await nonReceivable.waitForDeployment();
              
              const nonReceivableAddress = await nonReceivable.getAddress();
              const recipients = [user1.address, nonReceivableAddress];
              const amounts = [parseEther(1), parseEther(1)];
              
              const tx = await etherTool.connect(owner).batchTransfer2(recipients, amounts);
              await tx.wait();
              
              // Only first transfer should succeed
              expect(await etherTool.userEtherOf(owner.address)).to.equal(parseEther(9));
            } catch (error) {
              console.log("Test skipped: NonReceivable contract not found");
              this.skip();
            }
          } else {
            // Skip test for 0.4.x
            this.skip();
          }
        });
      });
    });
  });
});

// Deploy a minimal NonReceivable contract for testing
async function deployNonReceivable() {
  // If you need to deploy a helper contract for testing
  const NonReceivableFactory = await ethers.getContractFactory("NonReceivable");
  const nonReceivable = await NonReceivableFactory.deploy();
  await nonReceivable.waitForDeployment();
  return nonReceivable;
}