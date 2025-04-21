const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Timelock Contract Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/Timelock_legacy.sol:Timelock");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/Timelock_upgraded.sol:Timelock");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/Timelock_legacy.sol:Timelock");
    contractVersions.push("contracts/upgraded/Timelock_upgraded.sol:Timelock");
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let timelockContract;
      let mockToken;
      let owner, account1, account2;
      let releaseTime;
      let isSolidity8OrHigher;
      let timelockAddress;
      
      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }
      
      beforeEach(async function () {
        [owner, account1, account2] = await ethers.getSigners();
        detectSolidityVersion();
        
        // Determine which token contract to use with fully qualified path
        const mockTokenName = isSolidity8OrHigher
          ? "contracts/upgraded/MockTimelock_upgraded.sol:MockToken" 
          : "contracts/legacy/MockTimelock_legacy.sol:MockToken";
          
        // Deploy token
        const MockTokenFactory = await ethers.getContractFactory(mockTokenName);
        mockToken = await MockTokenFactory.deploy();
        await mockToken.waitForDeployment();
        
        // Set release time for 1 hour in the future
        const latestTime = await time.latest();
        releaseTime = latestTime + 3600; // 1 hour in the future
        
        // Deploy timelock contract - use the full contract path
        const TimelockFactory = await ethers.getContractFactory(contractName);
        
        timelockContract = await TimelockFactory.deploy(
          await mockToken.getAddress(), 
          releaseTime
        );
        await timelockContract.waitForDeployment();
        
        // Get contract address for use in tests
        timelockAddress = await timelockContract.getAddress();
        
        // Transfer some tokens to the timelock contract
        const transferAmount = ethers.parseEther("100");
        await mockToken.transfer(timelockAddress, transferAmount);
      });

      describe("Initialization", function() {
        it("should set the owner correctly", async function() {
          expect(await timelockContract.owner()).to.equal(owner.address);
        });
        
        it("should set the token contract correctly", async function() {
          expect(await timelockContract.tokenContract()).to.equal(await mockToken.getAddress());
        });
        
        it("should set the release time correctly", async function() {
          expect(await timelockContract.releaseTime()).to.equal(releaseTime);
        });
      });
      
      describe("Ownership", function() {
        it("should transfer ownership", async function() {
          await timelockContract.transferOwnership(account1.address);
          expect(await timelockContract.newOwner()).to.equal(account1.address);
          
          await timelockContract.connect(account1).acceptOwnership();
          expect(await timelockContract.owner()).to.equal(account1.address);
          expect(await timelockContract.newOwner()).to.equal("0x0000000000000000000000000000000000000000");
        });
        
        it("should reject unauthorized ownership transfer", async function() {
          await expect(
            timelockContract.connect(account1).transferOwnership(account2.address)
          ).to.be.reverted;
        });
        
        it("should reject invalid new owner address", async function() {
          await expect(
            timelockContract.transferOwnership("0x0000000000000000000000000000000000000000")
          ).to.be.reverted;
        });
      });
      
      describe("Time Locking", function() {
        it("should correctly report unlocked status", async function() {
          // Initially locked
          expect(await timelockContract.unlocked()).to.be.false;
          
          // Advance time past release time
          await time.increaseTo(releaseTime + 10);
          
          // Now it should be unlocked
          expect(await timelockContract.unlocked()).to.be.true;
        });
        
        it("should not allow claims before release time", async function() {
          // Attempt to claim tokens via fallback function
          await expect(
            owner.sendTransaction({
              to: timelockAddress,
              value: 0
            })
          ).to.be.reverted;
        });
        
        it("should allow claims after release time", async function() {
          const initialOwnerBalance = await mockToken.balanceOf(owner.address);
          const timelockBalance = await mockToken.balanceOf(timelockAddress);
          
          // Advance time past release time
          await time.increaseTo(releaseTime + 10);
          
          // Now claim tokens via fallback function
          await owner.sendTransaction({
            to: timelockAddress,
            value: 0
          });
          
          // Check balances
          const finalOwnerBalance = await mockToken.balanceOf(owner.address);
          const finalTimelockBalance = await mockToken.balanceOf(timelockAddress);
          
          expect(finalOwnerBalance - initialOwnerBalance).to.equal(timelockBalance);
          expect(finalTimelockBalance).to.equal(0);
        });
        
        it("should only allow owner to claim", async function() {
          // Advance time past release time
          await time.increaseTo(releaseTime + 10);
          
          // Non-owner attempts to claim
          await expect(
            account1.sendTransaction({
              to: timelockAddress,
              value: 0
            })
          ).to.be.reverted;
        });
      });
    });
  });
});
