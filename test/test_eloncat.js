const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ELONCAT Contract Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/Eloncat_legacy.sol:ELONCAT");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/Eloncat_upgraded.sol:ELONCAT");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/Eloncat_legacy.sol:ELONCAT");
    contractVersions.push("contracts/upgraded/Eloncat_upgraded.sol:ELONCAT");
  }
  
  // Helper function to handle revert errors across different Solidity versions
  async function expectRevert(transaction, errorMessage) {
    try {
      await transaction;
      expect.fail("Expected transaction to revert");
    } catch (error) {
      // For Solidity 0.8.x, the error structure is different than in 0.6.x
      if (error.message.includes(errorMessage) || 
          (error.reason && error.reason.includes(errorMessage)) ||
          (error.data && error.data.message && error.data.message.includes(errorMessage))) {
        // This is the expected behavior
      } else {
        throw error;
      }
    }
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let eloncat;
      let owner;
      let addr1;
      let addr2;
      let addr3;
      let addrs;
      let isSolidity8OrHigher;
      const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"; // For compatibility with ethers v5 and v6

      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }

      beforeEach(async function () {
        [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
        detectSolidityVersion();
        
        const EloncatFactory = await ethers.getContractFactory(contractName);
        eloncat = await EloncatFactory.deploy();
        await eloncat.waitForDeployment();
      });

      describe("Deployment", function () {
        it("Should set the right owner", async function () {
          expect(await eloncat.owner()).to.equal(owner.address);
        });

        it("Should assign the total supply of tokens to the owner", async function () {
          const ownerBalance = await eloncat.balanceOf(owner.address);
          expect(await eloncat.totalSupply()).to.equal(ownerBalance);
        });

        it("Should have correct token details", async function () {
          expect(await eloncat.name()).to.equal("ELONCAT");
          expect(await eloncat.symbol()).to.equal("CELON");
          expect(await eloncat.decimals()).to.equal(9);
        });
      });

      describe("Transactions", function () {
        it("Should transfer tokens between accounts", async function () {
          // Transfer 50 tokens from owner to addr1
          const transferAmount = ethers.parseUnits("50", 9);
          await eloncat.transfer(addr1.address, transferAmount);
          
          // Due to reflection mechanism, we need to account for the 2% fee
          const feeAmount = transferAmount * 2n / 100n;
          const expectedTransferAmount = transferAmount - feeAmount;
          
          // Check balances reflect the transfer
          const addr1Balance = await eloncat.balanceOf(addr1.address);
          expect(addr1Balance).to.equal(expectedTransferAmount);
        });

        it("Should fail if sender doesn't have enough tokens", async function () {
          // Try to send tokens when addr1 has no balance
          await expectRevert(
            eloncat.connect(addr1).transfer(owner.address, 1),
            "subtraction overflow"
          );
        });

        it("Should update balances after transfers", async function () {
          const initialOwnerBalance = await eloncat.balanceOf(owner.address);
          const amount1 = ethers.parseUnits("100", 9);
          const amount2 = ethers.parseUnits("50", 9);
          
          // Transfer from owner to addr1
          await eloncat.transfer(addr1.address, amount1);
          
          // Due to 2% fee
          const fee1 = amount1 * 2n / 100n;
          const receivedAmount1 = amount1 - fee1;
          
          // Transfer from addr1 to addr2
          await eloncat.connect(addr1).transfer(addr2.address, amount2);
          
          // Due to 2% fee
          const fee2 = amount2 * 2n / 100n;
          const receivedAmount2 = amount2 - fee2;
          
          // Check balances reflect all transfers
          const finalOwnerBalance = await eloncat.balanceOf(owner.address);
          // Check that owner's balance has decreased
          expect(finalOwnerBalance).to.be.lt(initialOwnerBalance);
          
          const addr1Balance = await eloncat.balanceOf(addr1.address);
          expect(addr1Balance).to.equal(receivedAmount1 - amount2);
          
          const addr2Balance = await eloncat.balanceOf(addr2.address);
          expect(addr2Balance).to.equal(receivedAmount2);
        });
      });

      describe("Reflection Mechanism", function () {
        it("Should apply the 2% fee on transfers", async function () {
          const amount = ethers.parseUnits("100", 9);
          const feeAmount = amount * 2n / 100n;
          const transferAmount = amount - feeAmount;
          
          // Initial fee total should be 0
          expect(await eloncat.totalFees()).to.equal(0);
          
          // Transfer tokens
          await eloncat.transfer(addr1.address, amount);
          
          // Check that receiver got the right amount (minus fee)
          expect(await eloncat.balanceOf(addr1.address)).to.equal(transferAmount);
          
          // Check that fee was collected
          expect(await eloncat.totalFees()).to.equal(feeAmount);
        });

        it("Should allow reflection of tokens", async function() {
          // First transfer some tokens to addr1
          const initialAmount = ethers.parseUnits("1000", 9);
          await eloncat.transfer(addr1.address, initialAmount);
          
          // Due to 2% fee
          const transferFee = initialAmount * 2n / 100n;
          const receivedAmount = initialAmount - transferFee;
          
          // Amount to reflect
          const reflectAmount = ethers.parseUnits("100", 9);
          
          // Reflect tokens
          await eloncat.connect(addr1).reflect(reflectAmount);
          
          // Check addr1 balance decreased by reflected amount
          const expectedBalance = receivedAmount - reflectAmount;
          expect(await eloncat.balanceOf(addr1.address)).to.equal(expectedBalance);
          
          // Check fees increased
          const expectedTotalFees = transferFee + reflectAmount;
          expect(await eloncat.totalFees()).to.equal(expectedTotalFees);
        });
      });

      describe("Exclusion Mechanism", function () {
        it("Should check exclusion status correctly", async function () {
          // Check addr1 is not excluded initially
          expect(await eloncat.isExcluded(addr1.address)).to.be.false;
        });

        it("Should exclude and include addresses from rewards if functions exist", async function () {
          // Skip if functions don't exist on this contract version
          if (!eloncat.excludeFromReward) {
            this.skip();
            return;
          }
          
          // Exclude addr1 from rewards
          await eloncat.excludeFromReward(addr1.address);
          
          // Check addr1 is now excluded
          expect(await eloncat.isExcluded(addr1.address)).to.be.true;
          
          // Include addr1 back in rewards
          await eloncat.includeInReward(addr1.address);
          
          // Check addr1 is no longer excluded
          expect(await eloncat.isExcluded(addr1.address)).to.be.false;
        });

        it("Should handle transfers with excluded addresses differently if exclusion functions exist", async function () {
          // Skip if functions don't exist on this contract version
          if (!eloncat.excludeFromReward) {
            this.skip();
            return;
          }
          
          // First let's transfer some tokens to our test accounts
          const initialAmount = ethers.parseUnits("1000", 9);
          await eloncat.transfer(addr1.address, initialAmount);
          await eloncat.transfer(addr2.address, initialAmount);
          
          // Record initial balances
          const addr1InitialBalance = await eloncat.balanceOf(addr1.address);
          const addr2InitialBalance = await eloncat.balanceOf(addr2.address);
          
          // Exclude addr2 from rewards
          await eloncat.excludeFromReward(addr2.address);
          
          // Transfer from non-excluded to excluded
          const transferAmount = ethers.parseUnits("100", 9);
          await eloncat.connect(addr1).transfer(addr2.address, transferAmount);
          
          // Fee should be 2%
          const feeAmount = transferAmount * 2n / 100n;
          const expectedReceivedAmount = transferAmount - feeAmount;
          
          // Check balances after transfer
          const addr1FinalBalance = await eloncat.balanceOf(addr1.address);
          const addr2FinalBalance = await eloncat.balanceOf(addr2.address);
          
          // Addr1 should have lost the transfer amount
          expect(addr1FinalBalance).to.equal(addr1InitialBalance - transferAmount);
          
          // Addr2 should have gained the transfer amount minus fee
          // This is a simplification - reflection mechanism makes exact calculation complex
          expect(addr2FinalBalance).to.be.gt(addr2InitialBalance);
        });
      });

      describe("Allowances", function () {
        it("Should update allowance correctly", async function () {
          const allowanceAmount = ethers.parseUnits("100", 9);
          
          // Initially allowance should be 0
          expect(await eloncat.allowance(owner.address, addr1.address)).to.equal(0);
          
          // Approve addr1 to spend tokens on owner's behalf
          await eloncat.approve(addr1.address, allowanceAmount);
          
          // Check allowance was set correctly
          expect(await eloncat.allowance(owner.address, addr1.address)).to.equal(allowanceAmount);
        });

        it("Should transfer using allowance mechanism", async function () {
          const allowanceAmount = ethers.parseUnits("500", 9);
          const transferAmount = ethers.parseUnits("200", 9);
          
          // Transfer tokens to addr1 first
          await eloncat.transfer(addr1.address, ethers.parseUnits("1000", 9));
          
          // Approve addr2 to spend addr1's tokens
          await eloncat.connect(addr1).approve(addr2.address, allowanceAmount);
          
          // addr2 transfers tokens from addr1 to addr3
          await eloncat.connect(addr2).transferFrom(addr1.address, addr3.address, transferAmount);
          
          // Check balances reflect the transfer
          const feeAmount = transferAmount * 2n / 100n;
          const expectedReceivedAmount = transferAmount - feeAmount;
          
          expect(await eloncat.balanceOf(addr3.address)).to.equal(expectedReceivedAmount);
          
          // Check allowance was reduced
          expect(await eloncat.allowance(addr1.address, addr2.address)).to.equal(allowanceAmount - transferAmount);
        });
        
        it("Should prevent transferFrom when allowance is insufficient", async function () {
          const allowanceAmount = ethers.parseUnits("100", 9);
          const transferAmount = ethers.parseUnits("200", 9);
          
          // Transfer tokens to addr1 first
          await eloncat.transfer(addr1.address, ethers.parseUnits("1000", 9));
          
          // Approve addr2 to spend addr1's tokens
          await eloncat.connect(addr1).approve(addr2.address, allowanceAmount);
          
          // Try to transfer more than the allowance
          await expectRevert(
            eloncat.connect(addr2).transferFrom(addr1.address, addr3.address, transferAmount),
            "transfer amount exceeds allowance"
          );
          
          // Balances should remain unchanged
          expect(await eloncat.balanceOf(addr3.address)).to.equal(0);
          expect(await eloncat.allowance(addr1.address, addr2.address)).to.equal(allowanceAmount);
        });
        
        it("Should handle increaseAllowance correctly", async function() {
          const initialAllowance = ethers.parseUnits("100", 9);
          const additionalAllowance = ethers.parseUnits("50", 9);
          
          // Set initial allowance
          await eloncat.approve(addr1.address, initialAllowance);
          
          // Increase allowance
          await eloncat.increaseAllowance(addr1.address, additionalAllowance);
          
          // Check new allowance
          expect(await eloncat.allowance(owner.address, addr1.address))
            .to.equal(initialAllowance + additionalAllowance);
        });
        
        it("Should handle decreaseAllowance correctly", async function() {
          const initialAllowance = ethers.parseUnits("100", 9);
          const decreaseAmount = ethers.parseUnits("30", 9);
          
          // Set initial allowance
          await eloncat.approve(addr1.address, initialAllowance);
          
          // Decrease allowance
          await eloncat.decreaseAllowance(addr1.address, decreaseAmount);
          
          // Check new allowance
          expect(await eloncat.allowance(owner.address, addr1.address))
            .to.equal(initialAllowance - decreaseAmount);
        });
      });
      
      describe("Max Transaction Amount", function() {
        it("Should enforce max transaction amount", async function() {
          // Get max transaction amount
          const maxTxAmount = await eloncat._maxTxAmount();
          
          // Transfer some tokens to addr1 first
          await eloncat.transfer(addr1.address, maxTxAmount * 3n);
          
          // Try to transfer more than max allowed from addr1 to addr2
          await expectRevert(
            eloncat.connect(addr1).transfer(addr2.address, maxTxAmount + 1n),
            "Transfer amount exceeds the maxTxAmount"
          );
          
          // Owner should be able to exceed max amount
          const largeAmount = maxTxAmount * 2n;
          await eloncat.transfer(addr3.address, largeAmount);
          
          // Transfer exactly max amount should work
          await eloncat.connect(addr1).transfer(addr2.address, maxTxAmount);
          
          // Check the transfer went through
          expect(await eloncat.balanceOf(addr2.address)).to.be.gt(0);
        });
      });
      
      describe("Token Reflection Calculations", function() {
        it("Should calculate reflection amounts correctly", async function() {
          const tokenAmount = ethers.parseUnits("100", 9);
          
          // Get reflection amount without fee deduction
          const reflectionAmount = await eloncat.reflectionFromToken(tokenAmount, false);
          
          // Get reflection amount with fee deduction
          const reflectionAmountAfterFee = await eloncat.reflectionFromToken(tokenAmount, true);
          
          // Due to 2% fee, reflection with fee should be less
          expect(reflectionAmountAfterFee).to.be.lt(reflectionAmount);
          
          // Convert reflection back to tokens
          const tokensFromReflection = await eloncat.tokenFromReflection(reflectionAmount);
          
          // Should get original amount back (within rounding tolerance)
          // Since we're working with bigint, use approximation
          const difference = tokenAmount > tokensFromReflection 
            ? tokenAmount - tokensFromReflection 
            : tokensFromReflection - tokenAmount;
            
          const tolerance = tokenAmount / 1000n; // 0.1% tolerance
          expect(difference).to.be.lte(tolerance);
        });
      });
      
      describe("Error Handling", function() {
        it("Should handle address zero cases properly", async function() {
          const amount = ethers.parseUnits("100", 9);
          
          // Test transfer to zero address
          await expectRevert(
            eloncat.transfer(ZERO_ADDRESS, amount),
            "transfer to the zero address"
          );
          
          // Test approve zero address
          await expectRevert(
            eloncat.approve(ZERO_ADDRESS, amount),
            "approve to the zero address"
          );
          
          // Test transfer ownership to zero address
          await expectRevert(
            eloncat.transferOwnership(ZERO_ADDRESS),
            "new owner is the zero address"
          );
        });
        
        it("Should prevent invalid reflection conversions", async function() {
          const totalSupply = await eloncat.totalSupply();
          
          // Try to get reflection for amount exceeding total supply
          await expectRevert(
            eloncat.reflectionFromToken(totalSupply + 1n, false),
            "Amount must be less than supply"
          );
          
          // For tokenFromReflection, we need a value larger than _rTotal
          // Using a more direct approach to avoid numerical issues
          const maxUint = ethers.MaxUint256;
          
          // When using the MAX value directly, we'd expect a revert
          await expectRevert(
            eloncat.tokenFromReflection(maxUint),
            "Amount must be less than total reflections"
          );
        });
        
        it("Should verify zero amount transfers are rejected", async function() {
          await expectRevert(
            eloncat.transfer(addr1.address, 0),
            "Transfer amount must be greater than zero"
          );
        });
      });
      
      describe("Ownership", function() {
        it("Should allow ownership transfer", async function() {
          // Transfer ownership to addr1
          await eloncat.transferOwnership(addr1.address);
          
          // Verify ownership changed
          expect(await eloncat.owner()).to.equal(addr1.address);
        });
        
        it("Should prevent non-owners from transferring ownership", async function() {
          await expectRevert(
            eloncat.connect(addr1).transferOwnership(addr2.address),
            "caller is not the owner"
          );
        });
        
        it("Should allow owner to renounce ownership", async function() {
          await eloncat.renounceOwnership();
          
          // Verify ownership is renounced (zero address)
          expect(await eloncat.owner()).to.equal(ZERO_ADDRESS);
        });
      });
    });
  });
});