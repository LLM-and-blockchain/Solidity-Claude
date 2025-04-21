const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("O2OToken Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/O2OToken_legacy.sol:O2OToken");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/O2OToken_upgraded.sol:O2OToken");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/O2OToken_legacy.sol:O2OToken");
    contractVersions.push("contracts/upgraded/O2OToken_upgraded.sol:O2OToken");
  }
  
  // Helper function to handle revert reasons differently based on Solidity version
  async function expectRevert(promise, expectedErrorMessage) {
    if (isSolidity8OrHigher) {
      // Solidity 0.8+ provides more precise error messages
      await expect(promise).to.be.revertedWith(expectedErrorMessage);
    } else {
      // Solidity <0.8 often just reverts without a message
      await expect(promise).to.be.reverted;
    }
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let tokenContract;
      let owner, account1, account2;
      let isSolidity8OrHigher;
      
      // Test constants
      const initialSupply = 1000000; // 1 million tokens
      const tokenName = "O2O Token";
      const tokenSymbol = "O2O";
      
      // Calculate expected total supply with decimals
      const expectedTotalSupply = BigInt(initialSupply) * BigInt(10 ** 18);

      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }

      beforeEach(async function () {
        [owner, account1, account2] = await ethers.getSigners();
        detectSolidityVersion();
        const TokenFactory = await ethers.getContractFactory(contractName);
        tokenContract = await TokenFactory.deploy(initialSupply, tokenName, tokenSymbol);
        await tokenContract.waitForDeployment();
      });

      describe("Initialization", function() {
        it("should set the correct token details", async function() {
          expect(await tokenContract.name()).to.equal(tokenName);
          expect(await tokenContract.symbol()).to.equal(tokenSymbol);
          expect(await tokenContract.decimals()).to.equal(18);
        });
        
        it("should assign the total supply to the owner", async function() {
          const ownerBalance = await tokenContract.balanceOf(owner.address);
          expect(ownerBalance).to.equal(expectedTotalSupply);
          expect(await tokenContract.totalSupply()).to.equal(expectedTotalSupply);
        });
        
        it("should set the owner correctly", async function() {
          expect(await tokenContract.owner()).to.equal(owner.address);
        });
        
        it("should initialize with saled state as false", async function() {
          expect(await tokenContract.saled()).to.equal(false);
        });
      });
      
      describe("Ownership and Saleable functions", function() {
        it("should allow owner to transfer ownership", async function() {
          await tokenContract.transferOwnership(account1.address);
          expect(await tokenContract.owner()).to.equal(account1.address);
        });
        
        it("should not allow non-owner to transfer ownership", async function() {
          const nonOwnerPromise = tokenContract.connect(account1).transferOwnership(account2.address);
          
          if (isSolidity8OrHigher) {
            await expect(nonOwnerPromise).to.be.revertedWith("Ownable: caller is not the owner");
          } else {
            await expect(nonOwnerPromise).to.be.reverted;
          }
        });
        
        it("should allow owner to set sale state", async function() {
          await tokenContract.sale();
          expect(await tokenContract.saled()).to.equal(true);
        });
        
        it("should allow owner to unset sale state", async function() {
          // First set sale state to true
          await tokenContract.sale();
          expect(await tokenContract.saled()).to.equal(true);
          
          // Then unset it
          await tokenContract.unsale();
          expect(await tokenContract.saled()).to.equal(false);
        });
        
        it("should not allow non-owner to change sale state", async function() {
          const nonOwnerPromise = tokenContract.connect(account1).sale();
          
          if (isSolidity8OrHigher) {
            await expect(nonOwnerPromise).to.be.revertedWith("Ownable: caller is not the owner");
          } else {
            await expect(nonOwnerPromise).to.be.reverted;
          }
        });
        
        it("should emit Sale event when entering sale state", async function() {
          await expect(tokenContract.sale())
            .to.emit(tokenContract, "Sale");
        });
        
        it("should emit Unsale event when exiting sale state", async function() {
          await tokenContract.sale();
          await expect(tokenContract.unsale())
            .to.emit(tokenContract, "Unsale");
        });
      });
      
      describe("Token transfers", function() {
        const transferAmount = BigInt(1000) * BigInt(10 ** 18);
        
        beforeEach(async function() {
          // Set the contract to sale state for transfer tests
          await tokenContract.sale();
        });
        
        it("should allow transfers when in sale state", async function() {
          await tokenContract.transfer(account1.address, transferAmount);
          expect(await tokenContract.balanceOf(account1.address)).to.equal(transferAmount);
        });
        
        it("should not allow transfers when not in sale state", async function() {
          // Set back to not sale state
          await tokenContract.unsale();
          
          const transferPromise = tokenContract.transfer(account1.address, transferAmount);
          
          if (isSolidity8OrHigher) {
            await expect(transferPromise).to.be.revertedWith("Contract is not in sale state");
          } else {
            await expect(transferPromise).to.be.reverted;
          }
        });
        
        it("should not allow transfer to zero address", async function() {
          const transferPromise = tokenContract.transfer(ethers.ZeroAddress, transferAmount);
          
          if (isSolidity8OrHigher) {
            await expect(transferPromise).to.be.revertedWith("Cannot transfer to zero address");
          } else {
            await expect(transferPromise).to.be.reverted;
          }
        });
        
        it("should not allow transfer more than balance", async function() {
          const excessiveAmount = expectedTotalSupply + BigInt(1);
          const transferPromise = tokenContract.transfer(account1.address, excessiveAmount);
          
          if (isSolidity8OrHigher) {
            await expect(transferPromise).to.be.revertedWith("Insufficient balance");
          } else {
            await expect(transferPromise).to.be.reverted;
          }
        });
        
        it("should allow owner to transfer tokens using transferOwner regardless of sale state", async function() {
          // Set back to not sale state
          await tokenContract.unsale();
          
          await tokenContract.transferOwner(account1.address, transferAmount);
          expect(await tokenContract.balanceOf(account1.address)).to.equal(transferAmount);
        });
        
        it("should emit Transfer event on transfer", async function() {
          await expect(tokenContract.transfer(account1.address, transferAmount))
            .to.emit(tokenContract, "Transfer")
            .withArgs(owner.address, account1.address, transferAmount);
        });
      });
      
      describe("Token approvals and transferFrom", function() {
        const approvalAmount = BigInt(1000) * BigInt(10 ** 18);
        const transferAmount = BigInt(500) * BigInt(10 ** 18);
        
        beforeEach(async function() {
          // Set the contract to sale state for transfer tests
          await tokenContract.sale();
        });
        
        it("should allow approval of tokens", async function() {
          await tokenContract.approve(account1.address, approvalAmount);
          expect(await tokenContract.allowance(owner.address, account1.address)).to.equal(approvalAmount);
        });
        
        it("should emit Approval event on approval", async function() {
          await expect(tokenContract.approve(account1.address, approvalAmount))
            .to.emit(tokenContract, "Approval")
            .withArgs(owner.address, account1.address, approvalAmount);
        });
        
        it("should require resetting approval to zero before changing", async function() {
          // First approve some tokens
          await tokenContract.approve(account1.address, approvalAmount);
          
          // Try to change the approval without resetting to 0 first
          const approvePromise = tokenContract.approve(account1.address, approvalAmount / BigInt(2));
          
          if (isSolidity8OrHigher) {
            await expect(approvePromise).to.be.revertedWith("Must reset approval to 0 first");
          } else {
            await expect(approvePromise).to.be.reverted;
          }
          
          // Should work when resetting to 0 first
          await tokenContract.approve(account1.address, 0);
          await tokenContract.approve(account1.address, approvalAmount / BigInt(2));
          
          expect(await tokenContract.allowance(owner.address, account1.address)).to.equal(approvalAmount / BigInt(2));
        });
        
        it("should allow transferFrom with approved tokens", async function() {
          // First transfer some tokens to account1
          await tokenContract.transfer(account1.address, transferAmount * BigInt(2));
          
          // account1 approves account2 to spend its tokens
          await tokenContract.connect(account1).approve(account2.address, transferAmount);
          
          // account2 transfers tokens from account1 to themselves
          await tokenContract.connect(account2).transferFrom(account1.address, account2.address, transferAmount);
          
          expect(await tokenContract.balanceOf(account2.address)).to.equal(transferAmount);
          expect(await tokenContract.balanceOf(account1.address)).to.equal(transferAmount);
          expect(await tokenContract.allowance(account1.address, account2.address)).to.equal(0);
        });
        
        it("should not allow transferFrom without approval", async function() {
          // First transfer some tokens to account1
          await tokenContract.transfer(account1.address, transferAmount);
          
          // account2 tries to transfer from account1 without approval
          const transferPromise = tokenContract.connect(account2).transferFrom(account1.address, account2.address, transferAmount);
          
          await expect(transferPromise).to.be.reverted;
        });
        
        it("should not allow transferFrom when not in sale state", async function() {
          // First transfer some tokens to account1 and approve account2
          await tokenContract.transfer(account1.address, transferAmount);
          await tokenContract.connect(account1).approve(account2.address, transferAmount);
          
          // Unsale the contract
          await tokenContract.unsale();
          
          const transferPromise = tokenContract.connect(account2).transferFrom(account1.address, account2.address, transferAmount);
          
          if (isSolidity8OrHigher) {
            await expect(transferPromise).to.be.revertedWith("Contract is not in sale state");
          } else {
            await expect(transferPromise).to.be.reverted;
          }
        });
        
        it("should correctly reduce allowance after transferFrom", async function() {
          // First transfer some tokens to account1
          await tokenContract.transfer(account1.address, transferAmount * BigInt(2));
          
          // account1 approves account2 to spend its tokens (more than we'll use)
          const largerAllowance = transferAmount * BigInt(2);
          await tokenContract.connect(account1).approve(account2.address, largerAllowance);
          
          // account2 transfers some tokens from account1
          await tokenContract.connect(account2).transferFrom(account1.address, account2.address, transferAmount);
          
          // Check remaining allowance
          const remainingAllowance = await tokenContract.allowance(account1.address, account2.address);
          expect(remainingAllowance).to.equal(largerAllowance - transferAmount);
        });
      });
      
      describe("Advanced scenarios", function() {
        const transferAmount = BigInt(1000) * BigInt(10 ** 18);
        
        beforeEach(async function() {
          await tokenContract.sale();
        });
        
        it("should handle token transfers between multiple accounts correctly", async function() {
          // Transfer from owner to account1
          await tokenContract.transfer(account1.address, transferAmount * BigInt(3));
          
          // Transfer from account1 to account2
          await tokenContract.connect(account1).transfer(account2.address, transferAmount);
          
          // Check balances
          expect(await tokenContract.balanceOf(owner.address)).to.equal(expectedTotalSupply - (transferAmount * BigInt(3)));
          expect(await tokenContract.balanceOf(account1.address)).to.equal(transferAmount * BigInt(2));
          expect(await tokenContract.balanceOf(account2.address)).to.equal(transferAmount);
        });
        
        it("should allow changing ownership and maintaining token control", async function() {
          // First transfer some tokens to account1 so they have a balance
          await tokenContract.transfer(account1.address, transferAmount * BigInt(3));
          
          // Transfer ownership to account1
          await tokenContract.transferOwnership(account1.address);
          
          // New owner should be able to control sale state
          await tokenContract.connect(account1).unsale();
          expect(await tokenContract.saled()).to.equal(false);
          
          // New owner should be able to transfer tokens regardless of sale state
          const smallAmount = BigInt(100) * BigInt(10 ** 18);
          await tokenContract.connect(account1).transferOwner(account2.address, smallAmount);
          expect(await tokenContract.balanceOf(account2.address)).to.equal(smallAmount);
          
          // Regular transfers should still be blocked due to unsale state
          const transferPromise = tokenContract.transfer(account2.address, transferAmount);
          await expect(transferPromise).to.be.reverted;
        });
      });
    });
  });
});