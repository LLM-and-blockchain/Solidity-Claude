const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BlindAuction Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
 
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/BlindAuction_legacy.sol:BlindAuction");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/BlindAuction_upgraded.sol:BlindAuction");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/BlindAuction_legacy.sol:BlindAuction");
    contractVersions.push("contracts/upgraded/BlindAuction_upgraded.sol:BlindAuction");
  }

  // Helper function to create a blinded bid
  async function createBid(value, fake, secret) {
    const encodedData = ethers.solidityPacked(
      ["uint", "bool", "bytes32"],
      [value, fake, secret]
    );
    return ethers.keccak256(encodedData);
  }
 
  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let isSolidity8OrHigher;
      
      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }

      // Define deployment fixture specific to this contract version
      async function deployAuctionFixture() {
        const [beneficiary, bidder1, bidder2] = await ethers.getSigners();
        
        // Set bidding time to 3 days and reveal time to 2 days (in seconds)
        const biddingTime = 3 * 24 * 60 * 60; // 3 days
        const revealTime = 2 * 24 * 60 * 60; // 2 days
        
        const ContractFactory = await ethers.getContractFactory(contractName);
        const auction = await ContractFactory.deploy(
          biddingTime,
          revealTime,
          beneficiary.address
        );
        
        await auction.waitForDeployment();
        
        return { auction, biddingTime, revealTime, beneficiary, bidder1, bidder2 };
      }
      
      beforeEach(async function () {
        detectSolidityVersion();
      });
      
      describe("Deployment", function() {
        it("Should set the right beneficiary", async function() {
          const { auction, beneficiary } = await loadFixture(deployAuctionFixture);
          
          expect(await auction.beneficiary()).to.equal(beneficiary.address);
        });
        
        it("Should set the bidding and reveal end times correctly", async function() {
          const { auction, biddingTime, revealTime } = await loadFixture(deployAuctionFixture);
          
          const deploymentTimestamp = isSolidity8OrHigher 
            ? await time.latest()
            : Math.floor(Date.now() / 1000); // Approximation for legacy test
            
          const expectedBiddingEnd = BigInt(deploymentTimestamp) + BigInt(biddingTime);
          const expectedRevealEnd = expectedBiddingEnd + BigInt(revealTime);
          
          // Allow small difference due to timing variations
          const biddingEndFromContract = await auction.biddingEnd();
          const revealEndFromContract = await auction.revealEnd();
          
          // For bidding end, allow a tolerance of 5 seconds in either direction
          expect(biddingEndFromContract).to.be.closeTo(
            expectedBiddingEnd,
            BigInt(5)
          );
          
          // For reveal end, allow the same tolerance
          expect(revealEndFromContract).to.be.closeTo(
            expectedRevealEnd,
            BigInt(5)
          );
        });
      });
      
      describe("Bidding", function() {
        it("Should allow placing bids before bidding end", async function() {
          const { auction, bidder1 } = await loadFixture(deployAuctionFixture);
          
          const secret = ethers.randomBytes(32);
          const blindedBid = await createBid(ethers.parseEther("1"), false, secret);
          
          await expect(auction.connect(bidder1).bid(blindedBid, {
            value: ethers.parseEther("1")
          })).not.to.be.reverted;
          
          // Verify bid was stored (can only check length)
          const bidStruct = await auction.bids(bidder1.address, 0);
          expect(bidStruct.blindedBid).to.equal(blindedBid);
          expect(bidStruct.deposit).to.equal(ethers.parseEther("1"));
        });
        
        it("Should not allow placing bids after bidding end", async function() {
          const { auction, biddingTime, bidder1 } = await loadFixture(deployAuctionFixture);
          
          // Fast forward time to after bidding end
          await time.increase(biddingTime + 1);
          
          const secret = ethers.randomBytes(32);
          const blindedBid = await createBid(ethers.parseEther("1"), false, secret);
          
          // Different error messages in different Solidity versions
          if (isSolidity8OrHigher) {
            await expect(auction.connect(bidder1).bid(blindedBid, {
              value: ethers.parseEther("1")
            })).to.be.revertedWith("Operation too late");
          } else {
            await expect(auction.connect(bidder1).bid(blindedBid, {
              value: ethers.parseEther("1")
            })).to.be.reverted; // Just check it reverts, without specific message
          }
        });
      });
      
      describe("Revealing bids", function() {
        it("Should not allow revealing bids before bidding end", async function() {
          const { auction, bidder1 } = await loadFixture(deployAuctionFixture);
          
          const secret = ethers.keccak256(ethers.toUtf8Bytes("bidder1Secret"));
          const values = [ethers.parseEther("1")];
          const fakes = [false];
          const secrets = [secret];
          
          if (isSolidity8OrHigher) {
            await expect(auction.connect(bidder1).reveal(values, fakes, secrets))
              .to.be.revertedWith("Operation too early");
          } else {
            await expect(auction.connect(bidder1).reveal(values, fakes, secrets))
              .to.be.reverted;
          }
        });
        
        it("Should allow revealing valid bids during reveal phase", async function() {
          const { auction, biddingTime, bidder1 } = await loadFixture(deployAuctionFixture);
          
          // Create a valid bid
          const secret = ethers.keccak256(ethers.toUtf8Bytes("bidder1Secret"));
          const bidValue = ethers.parseEther("1");
          const blindedBid = await createBid(bidValue, false, secret);
          
          // Place the bid
          await auction.connect(bidder1).bid(blindedBid, {
            value: ethers.parseEther("1.5") // Slightly more to hide true value
          });
          
          // Fast forward to reveal phase
          await time.increase(biddingTime + 1);
          
          // Reveal the bid
          await expect(auction.connect(bidder1).reveal(
            [bidValue],
            [false],
            [secret]
          )).not.to.be.reverted;
          
          // Should be highest bidder now
          expect(await auction.highestBidder()).to.equal(bidder1.address);
          expect(await auction.highestBid()).to.equal(bidValue);
        });
        
        it("Should refund deposits for fake bids", async function() {
          const { auction, biddingTime, bidder1 } = await loadFixture(deployAuctionFixture);
          
          // Create a fake bid
          const secret = ethers.keccak256(ethers.toUtf8Bytes("fakeBidSecret"));
          const bidValue = ethers.parseEther("2");
          const blindedBid = await createBid(bidValue, true, secret);
          
          // Place the bid with deposit
          const depositAmount = ethers.parseEther("2");
          await auction.connect(bidder1).bid(blindedBid, {
            value: depositAmount
          });
          
          // Fast forward to reveal phase
          await time.increase(biddingTime + 1);
          
          // Get balance before reveal
          const balanceBefore = await ethers.provider.getBalance(bidder1.address);
          
          // Reveal the fake bid
          const tx = await auction.connect(bidder1).reveal(
            [bidValue],
            [true], // This is a fake bid
            [secret]
          );
          
          // Wait for transaction
          const receipt = await tx.wait();
          const gasCost = receipt.gasUsed * receipt.gasPrice;
          
          // Get balance after reveal
          const balanceAfter = await ethers.provider.getBalance(bidder1.address);
          
          // Should have received back full deposit minus gas costs
          const expectedBalance = balanceBefore + depositAmount - gasCost;
          expect(balanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.01"));
          
          // Should not be highest bidder
          expect(await auction.highestBidder()).to.not.equal(bidder1.address);
        });
      });
      
      describe("Ending the auction", function() {
        it("Should not allow ending the auction before reveal end", async function() {
          const { auction, biddingTime } = await loadFixture(deployAuctionFixture);
          
          // Fast forward to reveal phase, but not yet to end
          await time.increase(biddingTime + 1);
          
          if (isSolidity8OrHigher) {
            await expect(auction.auctionEnd())
              .to.be.revertedWith("Operation too early");
          } else {
            await expect(auction.auctionEnd())
              .to.be.reverted;
          }
        });
        
        it("Should allow ending the auction after reveal end", async function() {
          const { auction, biddingTime, revealTime, beneficiary, bidder1 } = await loadFixture(deployAuctionFixture);
          
          // Place a bid
          const secret = ethers.keccak256(ethers.toUtf8Bytes("bidder1Secret"));
          const bidValue = ethers.parseEther("1");
          const blindedBid = await createBid(bidValue, false, secret);
          
          await auction.connect(bidder1).bid(blindedBid, {
            value: bidValue
          });
          
          // Fast forward to reveal phase
          await time.increase(biddingTime + 1);
          
          // Reveal the bid
          await auction.connect(bidder1).reveal(
            [bidValue],
            [false],
            [secret]
          );
          
          // Fast forward to after reveal end
          await time.increase(revealTime);
          
          // Check beneficiary balance before auction end
          const balanceBefore = await ethers.provider.getBalance(beneficiary.address);
          
          // End the auction
          await expect(auction.auctionEnd())
            .to.emit(auction, "AuctionEnded")
            .withArgs(bidder1.address, bidValue);
          
          // Check beneficiary received highest bid
          const balanceAfter = await ethers.provider.getBalance(beneficiary.address);
          // Use closeTo instead of equal as there might be small gas-related variations
          expect(balanceAfter - balanceBefore).to.be.closeTo(bidValue, ethers.parseEther("0.01"));
          
          // Check auction ended flag
          expect(await auction.ended()).to.be.true;
        });
        
        it("Should not allow ending the auction twice", async function() {
          const { auction, biddingTime, revealTime, bidder1 } = await loadFixture(deployAuctionFixture);
          
          // Place a bid
          const secret = ethers.keccak256(ethers.toUtf8Bytes("bidder1Secret"));
          const bidValue = ethers.parseEther("1");
          const blindedBid = await createBid(bidValue, false, secret);
          
          await auction.connect(bidder1).bid(blindedBid, {
            value: bidValue
          });
          
          // Fast forward to reveal phase
          await time.increase(biddingTime + 1);
          
          // Reveal the bid
          await auction.connect(bidder1).reveal(
            [bidValue],
            [false],
            [secret]
          );
          
          // Fast forward to after reveal end
          await time.increase(revealTime);
          
          // End the auction first time
          await auction.auctionEnd();
          
          // Try to end again
          if (isSolidity8OrHigher) {
            await expect(auction.auctionEnd())
              .to.be.revertedWith("Auction already ended");
          } else {
            await expect(auction.auctionEnd())
              .to.be.reverted;
          }
        });
      });
      
      describe("Withdrawing funds", function() {
        it("Should allow overbid bidders to withdraw their funds", async function() {
          const { auction, biddingTime, bidder1, bidder2 } = await loadFixture(deployAuctionFixture);
          
          // Bidder 1 places lower bid
          const secret1 = ethers.keccak256(ethers.toUtf8Bytes("bidder1Secret"));
          const bidValue1 = ethers.parseEther("1");
          const blindedBid1 = await createBid(bidValue1, false, secret1);
          
          await auction.connect(bidder1).bid(blindedBid1, {
            value: bidValue1
          });
          
          // Bidder 2 places higher bid
          const secret2 = ethers.keccak256(ethers.toUtf8Bytes("bidder2Secret"));
          const bidValue2 = ethers.parseEther("2");
          const blindedBid2 = await createBid(bidValue2, false, secret2);
          
          await auction.connect(bidder2).bid(blindedBid2, {
            value: bidValue2
          });
          
          // Fast forward to reveal phase
          await time.increase(biddingTime + 1);
          
          // Bidder 1 reveals first
          await auction.connect(bidder1).reveal(
            [bidValue1],
            [false],
            [secret1]
          );
          
          // Bidder 2 reveals second, outbidding bidder 1
          await auction.connect(bidder2).reveal(
            [bidValue2],
            [false],
            [secret2]
          );
          
          // Check bidder 1 can withdraw
          const balanceBefore = await ethers.provider.getBalance(bidder1.address);
          
          // Withdraw
          const tx = await auction.connect(bidder1).withdraw();
          const receipt = await tx.wait();
          const gasCost = receipt.gasUsed * receipt.gasPrice;
          
          // Check balance after
          const balanceAfter = await ethers.provider.getBalance(bidder1.address);
          
          // Should have received bid amount minus gas
          const expectedBalance = balanceBefore + bidValue1 - gasCost;
          expect(balanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.01"));
          
          // Trying to withdraw again should not provide additional funds
          const balanceBeforeSecondWithdraw = await ethers.provider.getBalance(bidder1.address);
          const tx2 = await auction.connect(bidder1).withdraw();
          const receipt2 = await tx2.wait();
          const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
          const balanceAfterSecondWithdraw = await ethers.provider.getBalance(bidder1.address);
          
          // Should not receive any more funds
          expect(balanceAfterSecondWithdraw).to.be.closeTo(balanceBeforeSecondWithdraw - gasCost2, ethers.parseEther("0.01"));
        });
      });
    });
  });
});