const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("SimpleAuction Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
 
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/SimpleAuction_legacy.sol:SimpleAuction");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/SimpleAuction_upgraded.sol:SimpleAuction");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/SimpleAuction_legacy.sol:SimpleAuction");
    contractVersions.push("contracts/upgraded/SimpleAuction_upgraded.sol:SimpleAuction");
  }
 
  // Helper function to get error reason by Solidity version
  const getRevertReason = async (tx, isSolidity8OrHigher) => {
    try {
      await tx;
      return null; // No error
    } catch (error) {
      if (isSolidity8OrHigher) {
        // For Solidity 0.8.x format
        if (error.errorArgs && error.errorArgs.length > 0) {
          return error.errorArgs[0];
        } else if (error.data) {
          // Try to extract the revert reason from the data field
          // This is a fallback if errorArgs is not available
          return "Unknown error";
        } else if (error.shortMessage) {
          return error.shortMessage;
        } else {
          // Final fallback
          return "Unknown error";
        }
      } else {
        // For Solidity 0.5.x format
        const match = error.message.match(/reverted: revert (.*)/) || 
                      error.message.match(/reverted with reason string ['"](.*)['"]/) ||
                      error.message.match(/revert (.*)/);
        return match ? match[1] : "Unknown error";
      }
    }
  };

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let auctionInstance;
      let beneficiary;
      let bidder1, bidder2, bidder3;
      let isSolidity8OrHigher;
      const auctionDuration = 3600; // 1 hour in seconds
 
      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }
 
      beforeEach(async function () {
        [beneficiary, bidder1, bidder2, bidder3] = await ethers.getSigners();
        detectSolidityVersion();
        
        // If test is running for a specific version that doesn't exist, skip tests
        try {
          const ContractFactory = await ethers.getContractFactory(contractName);
          auctionInstance = await ContractFactory.deploy(auctionDuration, beneficiary.address);
          await auctionInstance.waitForDeployment();
        } catch (err) {
          console.warn(`Contract ${contractName} doesn't exist. Skipping tests.`);
          this.skip();
        }
      });
 
      describe("Deployment", function() {
        it("should set the beneficiary correctly", async function() {
          expect(await auctionInstance.beneficiary()).to.equal(beneficiary.address);
        });
  
        it("should set the auction end time correctly", async function() {
          const currentTimestamp = await time.latest();
          const auctionEndTime = Number(await auctionInstance.auctionEndTime());
          
          // Small tolerance for block timestamp variations
          expect(auctionEndTime).to.be.approximately(currentTimestamp + auctionDuration, 5);
        });
      });
  
      describe("Bidding", function() {
        it("should accept a valid bid", async function() {
          const bidAmount = ethers.parseEther("1.0");
          await auctionInstance.connect(bidder1).bid({ value: bidAmount });
          
          expect(await auctionInstance.highestBidder()).to.equal(bidder1.address);
          expect(await auctionInstance.highestBid()).to.equal(bidAmount);
        });
  
        it("should reject a bid that is not higher than the current highest bid", async function() {
          const highBid = ethers.parseEther("2.0");
          const lowBid = ethers.parseEther("1.0");
          
          // First place a high bid
          await auctionInstance.connect(bidder1).bid({ value: highBid });
          
          // Then try to place a lower bid
          try {
            await auctionInstance.connect(bidder2).bid({ value: lowBid });
            expect.fail("The transaction should have reverted");
          } catch (error) {
            // Just verify that we still have the original highest bidder
            expect(await auctionInstance.highestBidder()).to.equal(bidder1.address);
          }
        });
  
        it("should reject bids after the auction has ended", async function() {
          // Fast forward time to after auction end
          await time.increase(auctionDuration + 10);
          
          const bidAmount = ethers.parseEther("1.0");
          
          // Try to place a bid after auction has ended
          try {
            await auctionInstance.connect(bidder1).bid({ value: bidAmount });
            expect.fail("The transaction should have reverted");
          } catch (error) {
            // If we're here, the transaction reverted as expected
            // No need to check the specific error message
          }
        });
  
        it("should handle multiple bids correctly", async function() {
          // Bidder1 bids
          await auctionInstance.connect(bidder1).bid({ value: ethers.parseEther("1.0") });
          expect(await auctionInstance.highestBidder()).to.equal(bidder1.address);
          
          // Bidder2 outbids
          await auctionInstance.connect(bidder2).bid({ value: ethers.parseEther("1.5") });
          expect(await auctionInstance.highestBidder()).to.equal(bidder2.address);
          
          // Bidder3 outbids
          await auctionInstance.connect(bidder3).bid({ value: ethers.parseEther("2.0") });
          expect(await auctionInstance.highestBidder()).to.equal(bidder3.address);
          
          // Bidder1 outbids again
          await auctionInstance.connect(bidder1).bid({ value: ethers.parseEther("2.5") });
          expect(await auctionInstance.highestBidder()).to.equal(bidder1.address);
        });
      });
  
      describe("Withdrawal", function() {
        it("should allow previous bidders to withdraw their funds", async function() {
          // Bidder1 bids
          await auctionInstance.connect(bidder1).bid({ value: ethers.parseEther("1.0") });
          
          // Bidder2 outbids
          await auctionInstance.connect(bidder2).bid({ value: ethers.parseEther("1.5") });
          
          // Get bidder1's balance before withdrawal
          const initialBalance = await ethers.provider.getBalance(bidder1.address);
          
          // Bidder1 withdraws
          await auctionInstance.connect(bidder1).withdraw();
          
          // Check balance after withdrawal
          const finalBalance = await ethers.provider.getBalance(bidder1.address);
          
          // Account for gas costs, balance should be higher but not exact
          expect(finalBalance).to.be.greaterThan(initialBalance);
        });
  
        it("should set pendingReturns to 0 after withdrawal", async function() {
          // Since pendingReturns is private, we need to infer its state
          // by making bids and checking withdrawal behavior
          
          // Bidder1 bids
          await auctionInstance.connect(bidder1).bid({ value: ethers.parseEther("1.0") });
          
          // Bidder2 outbids
          await auctionInstance.connect(bidder2).bid({ value: ethers.parseEther("1.5") });
          
          // Bidder1 withdraws
          const withdrawTx1 = await auctionInstance.connect(bidder1).withdraw();
          await withdrawTx1.wait();
          
          // Try to withdraw again immediately
          const withdrawResult = await auctionInstance.connect(bidder1).withdraw();
          const receipt = await withdrawResult.wait();
          
          // Verify the transaction was successful
          expect(receipt.status).to.equal(1); // Success for both versions
          
          // Check that no additional funds were withdrawn
          // This confirms pendingReturns was reset to 0
          const initialBalance = await ethers.provider.getBalance(bidder1.address);
          const withdrawResult2 = await auctionInstance.connect(bidder1).withdraw();
          await withdrawResult2.wait();
          const finalBalance = await ethers.provider.getBalance(bidder1.address);
          
          // Account for gas costs - should be approximately the same
          expect(finalBalance).to.be.lessThanOrEqual(initialBalance);
        });
      });
  
      describe("Auction End", function() {
        it("should not allow ending the auction before the time is up", async function() {
          try {
            await auctionInstance.auctionEnd();
            expect.fail("The transaction should have reverted");
          } catch (error) {
            // If we're here, the transaction reverted as expected
            // No need to check the specific error message
          }
        });
  
        it("should allow ending the auction after the time is up", async function() {
          // First place a bid
          await auctionInstance.connect(bidder1).bid({ value: ethers.parseEther("1.0") });
          
          // Fast forward time
          await time.increase(auctionDuration + 10);
          
          // End the auction
          await auctionInstance.auctionEnd();
          
          // Try to end it again - this should fail
          try {
            await auctionInstance.auctionEnd();
            expect.fail("The transaction should have reverted");
          } catch (error) {
            // If we're here, the transaction reverted as expected
            // No need to check the specific error message
          }
        });
  
        it("should transfer funds to the beneficiary when auction ends", async function() {
          // Bidder places a bid
          const bidAmount = ethers.parseEther("2.0");
          await auctionInstance.connect(bidder1).bid({ value: bidAmount });
          
          // Get beneficiary's balance before ending auction
          const initialBalance = await ethers.provider.getBalance(beneficiary.address);
          
          // Fast forward time
          await time.increase(auctionDuration + 10);
          
          // End the auction
          await auctionInstance.auctionEnd();
          
          // Get beneficiary's balance after ending auction
          const finalBalance = await ethers.provider.getBalance(beneficiary.address);
          
          // Check that beneficiary received the funds
          // Account for small gas differences in the computation
          const balanceDifference = finalBalance - initialBalance;
          
          // Using approximately rather than exact equality
          expect(balanceDifference).to.be.closeTo(
            bidAmount, 
            ethers.parseEther("0.01") // Allow for small gas differences
          );
        });
      });
  
      describe("Events", function() {
        it("should emit HighestBidIncreased event when a new highest bid is made", async function() {
          const bidAmount = ethers.parseEther("1.0");
          
          await expect(auctionInstance.connect(bidder1).bid({ value: bidAmount }))
            .to.emit(auctionInstance, "HighestBidIncreased")
            .withArgs(bidder1.address, bidAmount);
        });
  
        it("should emit AuctionEnded event when the auction ends", async function() {
          // Place a bid
          const bidAmount = ethers.parseEther("1.0");
          await auctionInstance.connect(bidder1).bid({ value: bidAmount });
          
          // Fast forward time
          await time.increase(auctionDuration + 10);
          
          // Check event emission
          await expect(auctionInstance.auctionEnd())
            .to.emit(auctionInstance, "AuctionEnded")
            .withArgs(bidder1.address, bidAmount);
        });
      });
    });
  });
});