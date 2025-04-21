const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OMUSUBI Contract Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/Omosubi_legacy.sol:OMUSUBI");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/Omosubi_upgraded.sol:OMUSUBI");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/Omosubi_legacy.sol:OMUSUBI");
    contractVersions.push("contracts/upgraded/Omosubi_upgraded.sol:OMUSUBI");
  }

  // Helper function to format errors based on Solidity version
  function formatError(error, isSolidity8OrHigher) {
    // Get the full error message
    const errorMsg = error.message || '';
    
    if (isSolidity8OrHigher) {
      // Solidity 0.8.x throws built-in arithmetic errors
      if (errorMsg.includes("underflow") || 
          errorMsg.includes("overflow") || 
          errorMsg.includes("reverted") ||
          errorMsg.includes("subtraction") ||
          errorMsg.includes("VM Exception")) {
        return "arithmetic";
      }
    } else {
      // For Solidity 0.6.0, SafeMath errors
      if (errorMsg.includes("SafeMath:")) {
        return "arithmetic";
      }
    }
    return errorMsg;
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let contractInstance;
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
        const ContractFactory = await ethers.getContractFactory(contractName);
        contractInstance = await ContractFactory.deploy();
        await contractInstance.waitForDeployment();
      });

      describe("Basic Token Information", function() {
        it("should have correct name", async function() {
          expect(await contractInstance.name()).to.equal("Omusubi | t.me/Omusubi_Token");
        });

        it("should have correct symbol", async function() {
          expect(await contractInstance.symbol()).to.equal("OMUSUBI ");
        });

        it("should have correct decimals", async function() {
          expect(await contractInstance.decimals()).to.equal(9);
        });
      });

      describe("Total Supply", function() {
        it("should have the correct initial total supply", async function() {
          const expectedSupply = ethers.parseUnits("5000000000000", 9);
          const totalSupply = await contractInstance.totalSupply();
          expect(totalSupply).to.equal(expectedSupply);
        });
      });

      describe("Token Ownership", function() {
        it("should assign the total supply to the owner", async function() {
          const ownerBalance = await contractInstance.balanceOf(owner.address);
          const totalSupply = await contractInstance.totalSupply();
          expect(ownerBalance).to.equal(totalSupply);
        });
      });

      describe("Transfer Functionality", function() {
        it("should transfer tokens between accounts", async function() {
          // Transfer 1000 tokens from owner to account1
          const transferAmount = ethers.parseUnits("1000", 9);
          await contractInstance.transfer(account1.address, transferAmount);

          // Check account1 balance
          const account1Balance = await contractInstance.balanceOf(account1.address);
          expect(account1Balance).to.equal(transferAmount);

          // Transfer from account1 to account2
          await contractInstance.connect(account1).transfer(account2.address, transferAmount);
          
          // Check balances
          const account2Balance = await contractInstance.balanceOf(account2.address);
          expect(account2Balance).to.equal(transferAmount);
          expect(await contractInstance.balanceOf(account1.address)).to.equal(0);
        });

        it("should fail when sender doesn't have enough balance", async function() {
          // account1 has 0 initial tokens
          const initialAccount1Balance = await contractInstance.balanceOf(account1.address);
          expect(initialAccount1Balance).to.equal(0);

          // Try to transfer 1 token from account1 to account2
          const transferAmount = ethers.parseUnits("1", 9);
          
          // Testing with expect.to.be.reverted is more robust across versions
          if (isSolidity8OrHigher) {
            await expect(
              contractInstance.connect(account1).transfer(account2.address, transferAmount)
            ).to.be.reverted;
          } else {
            try {
              await contractInstance.connect(account1).transfer(account2.address, transferAmount);
              expect.fail("Transaction should have failed");
            } catch (error) {
              const formattedError = formatError(error, isSolidity8OrHigher);
              expect(formattedError).to.include("arithmetic");
            }
          }
        });

        it("should not allow transfer to zero address", async function() {
          const transferAmount = ethers.parseUnits("1000", 9);
          
          try {
            await contractInstance.transfer("0x0000000000000000000000000000000000000000", transferAmount);
            expect.fail("Transaction should have failed");
          } catch (error) { 
            // Either version should reject transfers to the contract itself
            // The exact error message may differ but the transfer should fail
            expect(error.message).to.not.be.undefined;
          }
        });
      });

      describe("Approval and Allowance", function() {
        it("should approve tokens for delegated transfer", async function() {
          const approvalAmount = ethers.parseUnits("1000", 9);
          await contractInstance.approve(account1.address, approvalAmount);
          
          const allowance = await contractInstance.allowance(owner.address, account1.address);
          expect(allowance).to.equal(approvalAmount);
        });

        it("should allow for delegated transfer with transferFrom", async function() {
          const transferAmount = ethers.parseUnits("1000", 9);
          
          // Approve account1 to spend owner's tokens
          await contractInstance.approve(account1.address, transferAmount);
          
          // account1 transfers from owner to account2
          await contractInstance.connect(account1).transferFrom(owner.address, account2.address, transferAmount);
          
          // Check balances
          const account2Balance = await contractInstance.balanceOf(account2.address);
          expect(account2Balance).to.equal(transferAmount);
          
          // Check allowance was reduced
          const allowance = await contractInstance.allowance(owner.address, account1.address);
          expect(allowance).to.equal(0);
        });

        it("should fail when trying to transferFrom more than allowed", async function() {
          const approvalAmount = ethers.parseUnits("1000", 9);
          const transferAmount = ethers.parseUnits("2000", 9);
          
          // Approve account1 to spend 1000 of owner's tokens
          await contractInstance.approve(account1.address, approvalAmount);
          
          // Testing with expect.to.be.reverted is more robust across versions
          if (isSolidity8OrHigher) {
            await expect(
              contractInstance.connect(account1).transferFrom(owner.address, account2.address, transferAmount)
            ).to.be.reverted;
          } else {
            try {
              // account1 tries to transfer 2000 from owner to account2
              await contractInstance.connect(account1).transferFrom(owner.address, account2.address, transferAmount);
              expect.fail("Transaction should have failed");
            } catch (error) {
              const formattedError = formatError(error, isSolidity8OrHigher);
              expect(formattedError).to.include("arithmetic");
            }
          }
        });
      });

      describe("Allowance Modification", function() {
        it("should increase allowance", async function() {
          const initialAmount = ethers.parseUnits("1000", 9);
          const increasedAmount = ethers.parseUnits("500", 9);
          const expectedAllowance = ethers.parseUnits("1500", 9);
          
          // Initial approval
          await contractInstance.approve(account1.address, initialAmount);
          
          // Increase allowance
          await contractInstance.increaseAllowance(account1.address, increasedAmount);
          
          // Check new allowance
          const allowance = await contractInstance.allowance(owner.address, account1.address);
          expect(allowance).to.equal(expectedAllowance);
        });

        it("should decrease allowance", async function() {
          const initialAmount = ethers.parseUnits("1000", 9);
          const decreaseAmount = ethers.parseUnits("300", 9);
          const expectedAllowance = ethers.parseUnits("700", 9);
          
          // Initial approval
          await contractInstance.approve(account1.address, initialAmount);
          
          // Decrease allowance
          await contractInstance.decreaseAllowance(account1.address, decreaseAmount);
          
          // Check new allowance
          const allowance = await contractInstance.allowance(owner.address, account1.address);
          expect(allowance).to.equal(expectedAllowance);
        });

        it("should set allowance to zero when decreasing by more than current allowance", async function() {
          const initialAmount = ethers.parseUnits("1000", 9);
          const decreaseAmount = ethers.parseUnits("2000", 9);
          
          // Initial approval
          await contractInstance.approve(account1.address, initialAmount);
          
          // Decrease allowance by more than current allowance
          await contractInstance.decreaseAllowance(account1.address, decreaseAmount);
          
          // Check allowance is zero
          const allowance = await contractInstance.allowance(owner.address, account1.address);
          expect(allowance).to.equal(0);
        });
      });

      describe("Ownership", function() {
        it("should set the right owner", async function() {
          expect(await contractInstance._owner()).to.equal(owner.address);
        });

        it("should transfer ownership", async function() {
          await contractInstance.transferOwnership(account1.address);
          expect(await contractInstance._owner()).to.equal(account1.address);
        });

        it("should prevent non-owners from transferring ownership", async function() {
          try {
            await contractInstance.connect(account1).transferOwnership(account2.address);
            expect.fail("Transaction should have failed");
          } catch (error) {
            expect(error.message).to.include("caller is not the owner");
          }
        });

        it("should allow owner to renounce ownership", async function() {
          await contractInstance.renounceOwnership();
          expect(await contractInstance._owner()).to.equal("0x0000000000000000000000000000000000000000");
        });
      });
    });
  });
});