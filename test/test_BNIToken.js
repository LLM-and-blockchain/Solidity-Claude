const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BNIToken Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
 
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/BNIToken_legacy.sol:BNIToken");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/BNIToken_upgraded.sol:BNIToken");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/BNIToken_legacy.sol:BNIToken");
    contractVersions.push("contracts/upgraded/BNIToken_upgraded.sol:BNIToken");
  }
 
  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let tokenContract;
      let owner;
      let user1;
      let user2;
      let initialSupply;
      let isSolidity8OrHigher;
 
      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }

      // Helper to handle errors based on Solidity version
      async function expectRevert(promise, legacyMessage, modernMessage) {
        if (isSolidity8OrHigher) {
          // For Solidity 0.8.20, we have custom error messages
          if (modernMessage) {
            await expect(promise).to.be.revertedWith(modernMessage);
          } else {
            await expect(promise).to.be.reverted;
          }
        } else {
          // For Solidity 0.4.18, errors may not have custom messages
          await expect(promise).to.be.reverted;
        }
      }
 
      beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        detectSolidityVersion();
        
        try {
          const TokenFactory = await ethers.getContractFactory(contractName);
          tokenContract = await TokenFactory.deploy();
          await tokenContract.waitForDeployment();
          
          // Initial supply is 10 billion tokens with 2 decimals
          initialSupply = 10n * 10n ** 11n; // 10 * 10^(9+2)
        } catch (error) {
          console.error(`Error deploying contract: ${error.message}`);
          throw error;
        }
      });
 
      describe("Initial State", function() {
        it("Should have correct name and symbol", async function() {
          expect(await tokenContract.name()).to.equal("BNI");
          expect(await tokenContract.symbol()).to.equal("BNI");
        });

        it("Should have 2 decimals", async function() {
          expect(await tokenContract.decimals()).to.equal(2);
        });

        it("Should set the right owner", async function() {
          expect(await tokenContract.owner()).to.equal(owner.address);
        });

        it("Should assign the total supply of tokens to the owner", async function() {
          const ownerBalance = await tokenContract.balanceOf(owner.address);
          expect(ownerBalance).to.equal(initialSupply);
          expect(await tokenContract.totalSupply()).to.equal(initialSupply);
        });
      });

      describe("Token Transfer", function() {
        it("Should transfer tokens between accounts", async function() {
          // Transfer 100 tokens from owner to user1
          await tokenContract.transfer(user1.address, 100);
          
          const user1Balance = await tokenContract.balanceOf(user1.address);
          expect(user1Balance).to.equal(100);

          // Transfer 50 tokens from user1 to user2
          await tokenContract.connect(user1).transfer(user2.address, 50);
          
          const user2Balance = await tokenContract.balanceOf(user2.address);
          expect(user2Balance).to.equal(50);
          expect(await tokenContract.balanceOf(user1.address)).to.equal(50);
        });

        it("Should fail when sender doesn't have enough tokens", async function() {
          const initialOwnerBalance = await tokenContract.balanceOf(owner.address);
          
          // Try to send more tokens than available
          await expectRevert(
            tokenContract.connect(user1).transfer(owner.address, 1),
            "",  // Legacy version doesn't have error message
            "Insufficient balance"
          );

          // Owner balance shouldn't have changed
          expect(await tokenContract.balanceOf(owner.address)).to.equal(initialOwnerBalance);
        });

        it("Should not allow transfer to zero address", async function() {
          await expectRevert(
            tokenContract.transfer(ethers.ZeroAddress, 100),
            "",  // Legacy version doesn't have error message
            "Cannot transfer to zero address"
          );
        });
      });

      describe("Approval and Allowance", function() {
        it("Should update allowance when approve is called", async function() {
          await tokenContract.approve(user1.address, 100);
          expect(await tokenContract.allowance(owner.address, user1.address)).to.equal(100);
        });

        it("Should increase approval correctly", async function() {
          await tokenContract.approve(user1.address, 100);
          await tokenContract.increaseApproval(user1.address, 50);
          expect(await tokenContract.allowance(owner.address, user1.address)).to.equal(150);
        });

        it("Should decrease approval correctly", async function() {
          await tokenContract.approve(user1.address, 100);
          await tokenContract.decreaseApproval(user1.address, 40);
          expect(await tokenContract.allowance(owner.address, user1.address)).to.equal(60);
        });

        it("Should set allowance to zero when decreasing by more than current allowance", async function() {
          await tokenContract.approve(user1.address, 100);
          await tokenContract.decreaseApproval(user1.address, 200);
          expect(await tokenContract.allowance(owner.address, user1.address)).to.equal(0);
        });
      });

      describe("TransferFrom", function() {
        beforeEach(async function() {
          // Owner approves user1 to spend 1000 tokens
          await tokenContract.approve(user1.address, 1000);
        });

        it("Should allow approved spender to transfer tokens", async function() {
          await tokenContract.connect(user1).transferFrom(owner.address, user2.address, 500);
          
          expect(await tokenContract.balanceOf(user2.address)).to.equal(500);
          expect(await tokenContract.allowance(owner.address, user1.address)).to.equal(500);
        });

        it("Should fail when trying to transfer more than allowed", async function() {
          await expectRevert(
            tokenContract.connect(user1).transferFrom(owner.address, user2.address, 1500),
            "",  // Legacy version doesn't have error message
            "Insufficient allowance"
          );
        });

        it("Should fail when transferring from account with insufficient balance", async function() {
          // First give user1 some tokens
          await tokenContract.transfer(user1.address, 200);
          
          // User2 gets approval to spend user1's tokens
          await tokenContract.connect(user1).approve(user2.address, 500);
          
          // Verify the allowance was set correctly
          expect(await tokenContract.allowance(user1.address, user2.address)).to.equal(500);
          
          // Try to transfer more than user1 has
          await expectRevert(
            tokenContract.connect(user2).transferFrom(user1.address, owner.address, 300),
            "",  // Legacy version doesn't have error message
            "Insufficient balance"
          );
        });
      });

      describe("Ownership", function() {
        it("Should allow owner to transfer ownership", async function() {
          await tokenContract.transferOwnership(user1.address);
          expect(await tokenContract.owner()).to.equal(user1.address);
        });

        it("Should prevent non-owners from transferring ownership", async function() {
          await expectRevert(
            tokenContract.connect(user1).transferOwnership(user2.address),
            "",  // Legacy version doesn't have error message
            "Caller is not the owner"
          );
        });

        it("Should not allow transferring ownership to zero address", async function() {
          await expectRevert(
            tokenContract.transferOwnership(ethers.ZeroAddress),
            "",  // Legacy version doesn't have error message
            "New owner cannot be zero address"
          );
        });
      });
    });
  });
});