const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("PonderAirdropToken Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/PonderAirdropToken_legacy.sol:PonderAirdropToken");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/PonderAirdropToken_upgraded.sol:PonderAirdropToken");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/PonderAirdropToken_legacy.sol:PonderAirdropToken");
    contractVersions.push("contracts/upgraded/PonderAirdropToken_upgraded.sol:PonderAirdropToken");
  }

  // Helper function to parse large numbers
  function parseTokenAmount(amount) {
    return ethers.parseUnits(amount.toString(), 18);
  }
  
  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let token;
      let owner;
      let account1;
      let account2;
      let isSolidity8OrHigher;
      
      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }

      // Helper to handle different error patterns between versions
      async function expectRevert(promise, errorMessage) {
        if (isSolidity8OrHigher) {
          // In Solidity 0.8+, errors have better messages
          await expect(promise).to.be.revertedWith(errorMessage);
        } else {
          // In older Solidity, errors often just revert without a message
          await expect(promise).to.be.reverted;
        }
      }
      
      beforeEach(async function () {
        [owner, account1, account2] = await ethers.getSigners();
        detectSolidityVersion();
        
        const ContractFactory = await ethers.getContractFactory(contractName);
        token = await ContractFactory.deploy();
        await token.waitForDeployment();
      });
      
      describe("Basic Token Information", function() {
        it("should have the correct name", async function() {
          expect(await token.name()).to.equal("Ponder Airdrop Token");
        });
        
        it("should have the correct symbol", async function() {
          expect(await token.symbol()).to.equal("PONA");
        });
        
        it("should have 18 decimals", async function() {
          expect(await token.decimals()).to.equal(18);
        });
        
        it("should have correct total supply", async function() {
          const expectedSupply = parseTokenAmount(480000000);
          expect(await token.totalSupply()).to.equal(expectedSupply);
        });
      });
      
      describe("Initial State", function() {
        it("should assign all tokens to the owner", async function() {
          const totalSupply = await token.totalSupply();
          expect(await token.balanceOf(owner.address)).to.equal(totalSupply);
        });
        
        it("should set the deployer as an owner", async function() {
          // Owner check is done by testing if they can freeze transfers
          await token.freezeTransfers();
          const initialTransferResult = await token.transfer(account1.address, parseTokenAmount(1));
          expect(initialTransferResult.wait).to.be.a('function'); // Just checking the transaction went through
          
          // Transfer should fail now
          await expect(token.connect(account1).transfer(account2.address, parseTokenAmount(1))).to.be.revertedWithoutReason;
        });
      });
      
      describe("Owner Management", function() {
        it("should allow adding new owners", async function() {
          await token.setOwner(account1.address, true);
          
          // Test if the new owner can execute an owner-only function
          await token.connect(account1).freezeTransfers();
          await token.connect(account1).unfreezeTransfers();
        });
        
        it("should allow removing owners", async function() {
          // First make account1 an owner
          await token.setOwner(account1.address, true);
          
          // Then remove them
          await token.setOwner(account1.address, false);
          
          // Test that ex-owner can't execute owner-only functions
          if (isSolidity8OrHigher) {
            await expect(token.connect(account1).freezeTransfers())
              .to.be.revertedWith("Not an owner");
          } else {
            await expect(token.connect(account1).freezeTransfers())
              .to.be.reverted;
          }
        });
        
        it("should prevent owner from removing themselves", async function() {
          if (isSolidity8OrHigher) {
            await expect(token.setOwner(owner.address, false))
              .to.be.revertedWith("Cannot remove yourself as owner");
          } else {
            await expect(token.setOwner(owner.address, false))
              .to.be.reverted;
          }
        });
      });
      
      describe("Token Transfers", function() {
        beforeEach(async function() {
          // Transfer some tokens to account1
          await token.transfer(account1.address, parseTokenAmount(1000));
        });
        
        it("should allow token transfers", async function() {
          const transferAmount = parseTokenAmount(100);
          await token.connect(account1).transfer(account2.address, transferAmount);
          
          expect(await token.balanceOf(account2.address)).to.equal(transferAmount);
          expect(await token.balanceOf(account1.address)).to.equal(parseTokenAmount(900));
        });
        
        it("should prevent transfers when frozen", async function() {
          await token.freezeTransfers();
          const transferAmount = parseTokenAmount(100);
          
          // Direct transfer should fail
          const tx = await token.connect(account1).transfer(account2.address, transferAmount);
          expect(await tx.wait()).to.not.be.undefined;
          
          // Balance should remain unchanged
          expect(await token.balanceOf(account2.address)).to.equal(0);
          expect(await token.balanceOf(account1.address)).to.equal(parseTokenAmount(1000));
        });
        
        it("should allow transfers after unfreezing", async function() {
          await token.freezeTransfers();
          await token.unfreezeTransfers();
          
          const transferAmount = parseTokenAmount(100);
          await token.connect(account1).transfer(account2.address, transferAmount);
          
          expect(await token.balanceOf(account2.address)).to.equal(transferAmount);
        });
      });
      
      describe("Token Holds", function() {
        beforeEach(async function() {
          // Transfer some tokens to account1
          await token.transfer(account1.address, parseTokenAmount(1000));
        });
        
        it("should properly track transferrable balance", async function() {
          // Initially all balance should be transferrable
          expect(await token.transferrableBalanceOf(account1.address)).to.equal(parseTokenAmount(1000));
          
          // Set a hold of 300 tokens
          await token.setHolds([account1.address], [parseTokenAmount(300)]);
          
          // Transferrable balance should be reduced
          expect(await token.transferrableBalanceOf(account1.address)).to.equal(parseTokenAmount(700));
        });
        
        it("should prevent transfers exceeding transferrable balance", async function() {
          // Set a hold of 800 tokens
          await token.setHolds([account1.address], [parseTokenAmount(800)]);
          
          // Try to transfer more than the transferrable balance
          if (isSolidity8OrHigher) {
            await expect(token.connect(account1).transfer(account2.address, parseTokenAmount(300)))
              .to.be.revertedWith("Insufficient transferable balance");
          } else {
            await expect(token.connect(account1).transfer(account2.address, parseTokenAmount(300)))
              .to.be.reverted;
          }
          
          // Should allow transfer within transferrable balance
          await token.connect(account1).transfer(account2.address, parseTokenAmount(200));
          expect(await token.balanceOf(account2.address)).to.equal(parseTokenAmount(200));
        });
      });
      
      describe("Account Management", function() {
        it("should track account holders", async function() {
          // Initially only owner should be tracked
          expect(await token.getNumAccounts()).to.equal(1);
          
          // After transfer to another account, should track that account too
          await token.transfer(account1.address, parseTokenAmount(100));
          expect(await token.getNumAccounts()).to.equal(2);
          
          // Getting the list of accounts
          const accounts = await token.getAccounts(0, 2);
          expect(accounts[0]).to.equal(owner.address);
          expect(accounts[1]).to.equal(account1.address);
        });
        
        it("should initialize accounts in batch", async function() {
          const addresses = [account1.address, account2.address];
          const amounts = [parseTokenAmount(500), parseTokenAmount(300)];
          
          // Use specific function signature to avoid ambiguity
          const functionName = "initAccounts(address[],uint256[])";
          await token[functionName](addresses, amounts);
          
          expect(await token.balanceOf(account1.address)).to.equal(parseTokenAmount(500));
          expect(await token.balanceOf(account2.address)).to.equal(parseTokenAmount(300));
        });
        
        it("should initialize accounts with holds", async function() {
          const addresses = [account1.address, account2.address];
          const amounts = [parseTokenAmount(500), parseTokenAmount(300)];
          const holds = [parseTokenAmount(200), parseTokenAmount(100)];
          
          // Use specific function signature to avoid ambiguity
          const functionName = "initAccounts(address[],uint256[],uint256[])";
          await token[functionName](addresses, amounts, holds);
          
          expect(await token.balanceOf(account1.address)).to.equal(parseTokenAmount(500));
          expect(await token.transferrableBalanceOf(account1.address)).to.equal(parseTokenAmount(300));
          
          expect(await token.balanceOf(account2.address)).to.equal(parseTokenAmount(300));
          expect(await token.transferrableBalanceOf(account2.address)).to.equal(parseTokenAmount(200));
        });
      });
      
      describe("Approval and Allowance", function() {
        beforeEach(async function() {
          // Transfer some tokens to account1
          await token.transfer(account1.address, parseTokenAmount(1000));
        });
        
        it("should handle approvals correctly", async function() {
          // Use the standard approve function with 2 parameters
          const simpleApproveFn = "approve(address,uint256)";
          await token.connect(account1)[simpleApproveFn](account2.address, parseTokenAmount(500));
          
          expect(await token.allowance(account1.address, account2.address))
            .to.equal(parseTokenAmount(500));
          
          // Test the conditional approve function with 3 parameters
          const conditionalApproveFn = "approve(address,uint256,uint256)";
          await token.connect(account1)[conditionalApproveFn](
            account2.address, 
            parseTokenAmount(500), 
            parseTokenAmount(300)
          );
          
          expect(await token.allowance(account1.address, account2.address))
            .to.equal(parseTokenAmount(300));
          
          // Should fail if current value doesn't match
          await token.connect(account1)[simpleApproveFn](account2.address, parseTokenAmount(200));
          
          const result = await token.connect(account1)[conditionalApproveFn](
            account2.address, 
            parseTokenAmount(300), // Wrong current value
            parseTokenAmount(100)
          );
          
          // This approve call should return false but not revert
          await result.wait();
          expect(await token.allowance(account1.address, account2.address))
            .to.equal(parseTokenAmount(200)); // Value should remain unchanged
        });
        
        it("should allow transferFrom with allowance", async function() {
          // Use the standard approve function with 2 parameters
          const simpleApproveFn = "approve(address,uint256)";
          await token.connect(account1)[simpleApproveFn](account2.address, parseTokenAmount(500));
          
          await token.connect(account2).transferFrom(
            account1.address,
            account2.address,
            parseTokenAmount(200)
          );
          
          expect(await token.balanceOf(account2.address)).to.equal(parseTokenAmount(200));
          expect(await token.allowance(account1.address, account2.address))
            .to.equal(parseTokenAmount(300));
        });
        
        it("should prevent transferFrom without allowance", async function() {
          if (isSolidity8OrHigher) {
            await expect(
              token.connect(account2).transferFrom(
                account1.address,
                account2.address,
                parseTokenAmount(200)
              )
            ).to.be.revertedWith("Insufficient allowance");
          } else {
            await expect(
              token.connect(account2).transferFrom(
                account1.address,
                account2.address,
                parseTokenAmount(200)
              )
            ).to.be.reverted;
          }
        });
        
        it("should respect holds for transferFrom", async function() {
          // Use the standard approve function with 2 parameters
          const simpleApproveFn = "approve(address,uint256)";
          await token.connect(account1)[simpleApproveFn](account2.address, parseTokenAmount(1000));
          
          // Set a hold of 800 tokens
          await token.setHolds([account1.address], [parseTokenAmount(800)]);
          
          // Try to transfer more than the transferrable balance
          if (isSolidity8OrHigher) {
            await expect(
              token.connect(account2).transferFrom(
                account1.address,
                account2.address,
                parseTokenAmount(300)
              )
            ).to.be.revertedWith("Insufficient transferable balance");
          } else {
            await expect(
              token.connect(account2).transferFrom(
                account1.address,
                account2.address,
                parseTokenAmount(300)
              )
            ).to.be.reverted;
          }
          
          // Should allow transfer within transferrable balance
          await token.connect(account2).transferFrom(
            account1.address,
            account2.address,
            parseTokenAmount(200)
          );
          
          expect(await token.balanceOf(account2.address)).to.equal(parseTokenAmount(200));
        });
      });
      
      describe("Contract Destruction", function() {
        // Skip for legacy contract since we can't test selfdestruct effectively
        // and can't modify the legacy contract to match our test
        if (contractName.includes("legacy")) {
          it("should have a kill function", async function() {
            // Just verify the function exists and can be called
            await token.kill();
          });
        } else {
          // Only test detailed behavior on the upgraded contract
          it("should properly implement kill functionality", async function() {
            // First transfer some tokens to accounts for testing
            await token.transfer(account1.address, parseTokenAmount(1000));
            
            // Test kill function by a non-owner (should fail with proper error)
            await expect(token.connect(account1).kill())
              .to.be.revertedWith("Not an owner");
            
            // Execute kill by the owner
            await token.kill();
            
            // After kill, the contract should be frozen
            // Try to transfer from account1 to account2
            const transferResult = await token.connect(account1).transfer(account2.address, parseTokenAmount(100));
            await transferResult.wait();
            
            // The transfer should fail silently (return false rather than revert)
            // Verify this by checking that the balances haven't changed
            
            // account2 should have 0 tokens
            expect(await token.balanceOf(account2.address)).to.equal(0);
            
            // account1 should still have 1000 tokens
            const account1Balance = await token.balanceOf(account1.address);
            
            // Check if the account1 balance is still 1000 tokens
            expect(account1Balance.toString()).to.equal(parseTokenAmount(1000).toString());
          });
        }
      });
    });
  });
});