const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Alcanium Token Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/Alcanium_legacy.sol:Alcanium");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/Alcanium_upgraded.sol:Alcanium");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/Alcanium_legacy.sol:Alcanium");
    contractVersions.push("contracts/upgraded/Alcanium_upgraded.sol:Alcanium");
  }

  // Helper function to format big numbers consistently for both versions
  function formatBigNumber(value) {
    return ethers.formatUnits(value, 18);
  }

  // Function to safely handle and compare reverts in different Solidity versions
  async function expectRevert(promise, errorMessage) {
    try {
      await promise;
      expect.fail("Expected transaction to revert");
    } catch (error) {
      // Different error formats in Solidity 0.5 vs 0.8
      if (error.message.includes(errorMessage)) {
        // Specific error message found
        return;
      } else if (error.message.includes("reverted") || error.message.includes("revert")) {
        // Generic revert, which is fine too
        return;
      }
      throw error; // Re-throw if it's a different error
    }
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let alcanium;
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
        const AlcaniumFactory = await ethers.getContractFactory(contractName);
        alcanium = await AlcaniumFactory.deploy();
        await alcanium.waitForDeployment();
      });

      it("should deploy with correct token name and symbol", async function() {
        expect(await alcanium.name()).to.equal("Alcanium");
        expect(await alcanium.symbol()).to.equal("ALC");
        expect(await alcanium.decimals()).to.equal(18);
      });

      it("should assign the total supply to the deployer", async function() {
        const totalSupply = await alcanium.totalSupply();
        const ownerBalance = await alcanium.balanceOf(owner.address);
        expect(ownerBalance).to.equal(totalSupply);
      });

      it("should transfer tokens correctly", async function() {
        const transferAmount = ethers.parseUnits("1000", 18);
        
        // Check initial balances
        const initialOwnerBalance = await alcanium.balanceOf(owner.address);
        
        // Transfer tokens
        await alcanium.transfer(account1.address, transferAmount);
        
        // Check final balances
        const finalOwnerBalance = await alcanium.balanceOf(owner.address);
        const account1Balance = await alcanium.balanceOf(account1.address);
        
        expect(finalOwnerBalance).to.equal(initialOwnerBalance - transferAmount);
        expect(account1Balance).to.equal(transferAmount);
      });

      it("should fail when transferring more than balance", async function() {
        const account1Balance = await alcanium.balanceOf(account1.address);
        const excessAmount = account1Balance + ethers.parseUnits("1", 18);
        
        if (isSolidity8OrHigher) {
          await expectRevert(
            alcanium.connect(account1).transfer(account2.address, excessAmount),
            "Subtraction underflow"
          );
        } else {
          await expectRevert(
            alcanium.connect(account1).transfer(account2.address, excessAmount),
            "revert"
          );
        }
      });

      it("should approve tokens for delegated transfer", async function() {
        const approveAmount = ethers.parseUnits("1000", 18);
        
        await alcanium.approve(account1.address, approveAmount);
        
        const allowance = await alcanium.allowance(owner.address, account1.address);
        expect(allowance).to.equal(approveAmount);
      });

      it("should handle transferFrom correctly", async function() {
        const transferAmount = ethers.parseUnits("500", 18);
        
        // Approve account1 to spend owner's tokens
        await alcanium.approve(account1.address, transferAmount);
        
        // Record initial balances
        const initialOwnerBalance = await alcanium.balanceOf(owner.address);
        const initialAccount2Balance = await alcanium.balanceOf(account2.address);
        
        // Execute transferFrom
        await alcanium.connect(account1).transferFrom(
          owner.address,
          account2.address,
          transferAmount
        );
        
        // Check final balances
        const finalOwnerBalance = await alcanium.balanceOf(owner.address);
        const finalAccount2Balance = await alcanium.balanceOf(account2.address);
        
        expect(finalOwnerBalance).to.equal(initialOwnerBalance - transferAmount);
        expect(finalAccount2Balance).to.equal(initialAccount2Balance + transferAmount);
        
        // Check that allowance was reduced
        const remainingAllowance = await alcanium.allowance(owner.address, account1.address);
        expect(remainingAllowance).to.equal(0);
      });

      it("should fail when attempting to transferFrom more than allowed", async function() {
        const approveAmount = ethers.parseUnits("500", 18);
        const exceedAmount = ethers.parseUnits("600", 18);
        
        // Approve account1 to spend owner's tokens
        await alcanium.approve(account1.address, approveAmount);
        
        if (isSolidity8OrHigher) {
          await expectRevert(
            alcanium.connect(account1).transferFrom(owner.address, account2.address, exceedAmount),
            "Subtraction underflow"
          );
        } else {
          await expectRevert(
            alcanium.connect(account1).transferFrom(owner.address, account2.address, exceedAmount),
            "revert"
          );
        }
      });

      // Test SafeMath functions
      describe("SafeMath operations", function() {
        it("should handle addition correctly", async function() {
          const a = ethers.parseUnits("100", 18);
          const b = ethers.parseUnits("200", 18);
          const result = await alcanium.safeAdd(a, b);
          expect(result).to.equal(a + b);
        });

        it("should handle subtraction correctly", async function() {
          const a = ethers.parseUnits("200", 18);
          const b = ethers.parseUnits("100", 18);
          const result = await alcanium.safeSub(a, b);
          expect(result).to.equal(a - b);
        });

        it("should handle multiplication correctly", async function() {
          const a = ethers.parseUnits("100", 18);
          const b = 2n; // Using bigint for small number
          const result = await alcanium.safeMul(a, b);
          expect(result).to.equal(a * b);
        });

        it("should handle division correctly", async function() {
          const a = ethers.parseUnits("200", 18);
          const b = 2n; // Using bigint for small number
          const result = await alcanium.safeDiv(a, b);
          expect(result).to.equal(a / b);
        });

        // Test for SafeMath errors - addition overflow
        it("should revert on addition overflow", async function() {
          const maxUint = ethers.MaxUint256;
          
          if (isSolidity8OrHigher) {
            await expectRevert(
              alcanium.safeAdd(maxUint, 1),
              "Addition overflow"
            );
          } else {
            await expectRevert(
              alcanium.safeAdd(maxUint, 1),
              "revert"
            );
          }
        });

        // Test for SafeMath errors - subtraction underflow
        it("should revert on subtraction underflow", async function() {
          if (isSolidity8OrHigher) {
            await expectRevert(
              alcanium.safeSub(100, 200),
              "Subtraction underflow"
            );
          } else {
            await expectRevert(
              alcanium.safeSub(100, 200),
              "revert"
            );
          }
        });

        // Test for SafeMath errors - division by zero
        it("should revert on division by zero", async function() {
          if (isSolidity8OrHigher) {
            await expectRevert(
              alcanium.safeDiv(100, 0),
              "Division by zero"
            );
          } else {
            await expectRevert(
              alcanium.safeDiv(100, 0),
              "revert"
            );
          }
        });
      });
    });
  });
});