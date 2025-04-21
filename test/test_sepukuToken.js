const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SepukuToken Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/SepukuToken_legacy.sol:SepukuToken");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/SepukuToken_upgraded.sol:SepukuToken");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/SepukuToken_legacy.sol:SepukuToken");
    contractVersions.push("contracts/upgraded/SepukuToken_upgraded.sol:SepukuToken");
  }

  // Helper functions
  async function getExpectedBalanceAfterTransfer(amount) {
    return amount - Math.floor(amount / 900);
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let contractInstance;
      let owner, account1, account2;
      let isSolidity8OrHigher;
      const initialSupply = BigInt("33000000000000000000000000000");

      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }

      // Helper to handle errors correctly depending on Solidity version
      async function expectRevert(promise, reason) {
        if (isSolidity8OrHigher) {
          // For Solidity 0.8.x we expect a revert with a reason
          await expect(promise).to.be.revertedWith(reason);
        } else {
          // For Solidity 0.5.x we expect a generic revert
          await expect(promise).to.be.reverted;
        }
      }

      beforeEach(async function () {
        [owner, account1, account2] = await ethers.getSigners();
        detectSolidityVersion();
        const ContractFactory = await ethers.getContractFactory(contractName);
        contractInstance = await ContractFactory.deploy();
        await contractInstance.waitForDeployment();
      });

      describe("Deployment and Basic Functions", function() {
        it("Should set the right token metadata", async function() {
          expect(await contractInstance.name()).to.equal("Sepuku Token");
          expect(await contractInstance.symbol()).to.equal("SEPUKU");
          expect(await contractInstance.decimals()).to.equal(18);
        });

        it("Should assign the total supply to the owner", async function() {
          expect(await contractInstance.totalSupply()).to.equal(initialSupply);
          expect(await contractInstance.balanceOf(owner.address)).to.equal(initialSupply);
        });
      });

      describe("Token Transfers", function() {
        const transferAmount = BigInt("1000000000000000000"); // 1 token

        it("Should transfer tokens correctly and burn 1/900 of them", async function() {
          await contractInstance.transfer(account1.address, transferAmount);
          
          const expectedTransferAmount = transferAmount - (transferAmount / BigInt(900));
          
          expect(await contractInstance.balanceOf(account1.address)).to.equal(expectedTransferAmount);
          expect(await contractInstance.balanceOf(owner.address)).to.equal(initialSupply - transferAmount);
          
          // Check total supply has decreased by burnAmount
          const expectedTotalSupply = initialSupply - (transferAmount / BigInt(900));
          expect(await contractInstance.totalSupply()).to.equal(expectedTotalSupply);
        });

        it("Should fail to transfer if sender has insufficient balance", async function() {
          // Account1 starts with 0 balance
          const promise = contractInstance.connect(account1).transfer(account2.address, transferAmount);
          
          if (isSolidity8OrHigher) {
            await expect(promise).to.be.revertedWith("Insufficient balance");
          } else {
            // In 0.5.0, it should just revert (our assert in SafeMath will trigger)
            await expect(promise).to.be.reverted;
          }
        });

        it("Should fail to transfer to zero address", async function() {
          const promise = contractInstance.transfer(ethers.ZeroAddress, transferAmount);
          
          if (isSolidity8OrHigher) {
            await expect(promise).to.be.revertedWith("Transfer to zero address");
          } else {
            await expect(promise).to.be.reverted;
          }
        });
      });

      describe("Multi Transfer Function", function() {
        it("Should transfer to multiple recipients correctly", async function() {
          const amount1 = BigInt("1000000000000000000"); // 1 token
          const amount2 = BigInt("2000000000000000000"); // 2 tokens
          
          await contractInstance.multiTransfer(
            [account1.address, account2.address],
            [amount1, amount2]
          );
          
          const expectedAmount1 = amount1 - (amount1 / BigInt(900));
          const expectedAmount2 = amount2 - (amount2 / BigInt(900));
          
          expect(await contractInstance.balanceOf(account1.address)).to.equal(expectedAmount1);
          expect(await contractInstance.balanceOf(account2.address)).to.equal(expectedAmount2);
        });
      });

      describe("Allowance and TransferFrom", function() {
        const approvalAmount = BigInt("10000000000000000000"); // 10 tokens
        const transferAmount = BigInt("5000000000000000000"); // 5 tokens

        beforeEach(async function() {
          // Transfer some tokens to account1 first
          // When transferring to account1, we need to account for the burn rate
          const initialTransferAmount = BigInt("20000000000000000000"); // 20 tokens
          await contractInstance.transfer(account1.address, initialTransferAmount);
          
          // account1 approves account2 to spend tokens
          await contractInstance.connect(account1).approve(account2.address, approvalAmount);
        });

        it("Should set allowance correctly", async function() {
          expect(await contractInstance.allowance(account1.address, account2.address)).to.equal(approvalAmount);
        });

        it("Should transfer from another account when approved", async function() {
          // Get the actual balance of account1 before the transfer
          const actualInitialBalance = await contractInstance.balanceOf(account1.address);
          
          // Perform transferFrom
          await contractInstance.connect(account2).transferFrom(account1.address, account2.address, transferAmount);
          
          // Get actual updated balances
          const actualAccount1Balance = await contractInstance.balanceOf(account1.address);
          const actualAccount2Balance = await contractInstance.balanceOf(account2.address);
          
          // Calculate expected values
          const burnAmount = transferAmount / BigInt(900);
          const expectedTransferAmount = transferAmount - burnAmount;
          const expectedAccount1Balance = actualInitialBalance - transferAmount;
          
          // Verify results
          expect(actualAccount2Balance).to.equal(expectedTransferAmount);
          expect(actualAccount1Balance).to.equal(expectedAccount1Balance);
          expect(await contractInstance.allowance(account1.address, account2.address)).to.equal(approvalAmount - transferAmount);
        });

        it("Should fail transferFrom if allowance is insufficient", async function() {
          const excessiveAmount = BigInt("15000000000000000000"); // 15 tokens
          
          const promise = contractInstance.connect(account2).transferFrom(account1.address, account2.address, excessiveAmount);
          
          if (isSolidity8OrHigher) {
            await expect(promise).to.be.revertedWith("Insufficient allowance");
          } else {
            await expect(promise).to.be.reverted;
          }
        });
      });

      describe("Allowance Management Functions", function() {
        const initialAllowance = BigInt("10000000000000000000"); // 10 tokens
        const increaseAmount = BigInt("5000000000000000000"); // 5 tokens
        const decreaseAmount = BigInt("3000000000000000000"); // 3 tokens

        beforeEach(async function() {
          await contractInstance.approve(account1.address, initialAllowance);
        });

        it("Should increase allowance correctly", async function() {
          await contractInstance.increaseAllowance(account1.address, increaseAmount);
          expect(await contractInstance.allowance(owner.address, account1.address)).to.equal(initialAllowance + increaseAmount);
        });

        it("Should decrease allowance correctly", async function() {
          await contractInstance.decreaseAllowance(account1.address, decreaseAmount);
          expect(await contractInstance.allowance(owner.address, account1.address)).to.equal(initialAllowance - decreaseAmount);
        });
      });

      describe("Burning Functions", function() {
        const burnAmount = BigInt("5000000000000000000"); // 5 tokens
        const transferAmount = BigInt("10000000000000000000"); // 10 tokens
        const approvalAmount = BigInt("8000000000000000000"); // 8 tokens

        beforeEach(async function() {
          // Transfer some tokens to account1
          await contractInstance.transfer(account1.address, transferAmount);
          // account1 approves owner to burn tokens
          await contractInstance.connect(account1).approve(owner.address, approvalAmount);
        });

        it("Should burn tokens correctly", async function() {
          const initialBalance = await contractInstance.balanceOf(owner.address);
          const initialSupply = await contractInstance.totalSupply();
          
          await contractInstance.burn(burnAmount);
          
          expect(await contractInstance.balanceOf(owner.address)).to.equal(initialBalance - burnAmount);
          expect(await contractInstance.totalSupply()).to.equal(initialSupply - burnAmount);
        });

        it("Should fail to burn more than balance", async function() {
          const excessiveAmount = await contractInstance.balanceOf(owner.address) + BigInt(1);
          
          const promise = contractInstance.burn(excessiveAmount);
          
          if (isSolidity8OrHigher) {
            await expect(promise).to.be.revertedWith("Burn amount exceeds balance");
          } else {
            await expect(promise).to.be.reverted;
          }
        });

        it("Should burn from another account when approved", async function() {
          const initialBalance = await contractInstance.balanceOf(account1.address);
          const initialSupply = await contractInstance.totalSupply();
          
          await contractInstance.burnFrom(account1.address, burnAmount);
          
          expect(await contractInstance.balanceOf(account1.address)).to.equal(initialBalance - burnAmount);
          expect(await contractInstance.totalSupply()).to.equal(initialSupply - burnAmount);
          expect(await contractInstance.allowance(account1.address, owner.address)).to.equal(approvalAmount - burnAmount);
        });

        it("Should fail burnFrom if allowance is insufficient", async function() {
          const excessiveAmount = approvalAmount + BigInt(1);
          
          const promise = contractInstance.burnFrom(account1.address, excessiveAmount);
          
          if (isSolidity8OrHigher) {
            await expect(promise).to.be.revertedWith("Burn amount exceeds allowance");
          } else {
            await expect(promise).to.be.reverted;
          }
        });
      });
    });
  });
});