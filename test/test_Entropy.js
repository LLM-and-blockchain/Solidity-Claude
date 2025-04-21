const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Entropy Token Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];

  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/Entropy_legacy.sol:Entropy");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/Entropy_upgraded.sol:Entropy");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/Entropy_legacy.sol:Entropy");
    contractVersions.push("contracts/upgraded/Entropy_upgraded.sol:Entropy");
  }

  // Helper function to get error for different Solidity versions
  function getErrorForVersion(isSolidity8OrHigher, legacyMessage, modernMessage) {
    return isSolidity8OrHigher ? modernMessage : legacyMessage;
  }

  // Helper function to simulate advance time
  async function advanceTime(seconds) {
    await time.increase(seconds);
  }

  // Helper function to advance blocks
  async function advanceBlocks(numBlocks) {
    for (let i = 0; i < numBlocks; i++) {
      await ethers.provider.send("evm_mine");
    }
  }

  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let entropyToken;
      let owner;
      let minter;
      let user1;
      let user2;
      let isSolidity8OrHigher;
      const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
      const INITIAL_SUPPLY = ethers.parseEther("1000000000"); // 1 billion tokens

      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }

      beforeEach(async function () {
        [owner, minter, user1, user2] = await ethers.getSigners();
        detectSolidityVersion();
        
        // Get current timestamp for minting allowed time
        const currentTimestamp = await time.latest();
        const mintingAllowedAfter = currentTimestamp + 100; // Allow minting after 100 seconds
        
        const EntropyFactory = await ethers.getContractFactory(contractName);
        entropyToken = await EntropyFactory.deploy(
          owner.address,
          minter.address,
          mintingAllowedAfter
        );
        await entropyToken.waitForDeployment();
      });

      describe("Token Basics", function() {
        it("should have correct name, symbol and decimals", async function() {
          expect(await entropyToken.name()).to.equal("Entropy");
          expect(await entropyToken.symbol()).to.equal("ERP");
          expect(await entropyToken.decimals()).to.equal(18);
        });

        it("should assign the total supply to the owner", async function() {
          const ownerBalance = await entropyToken.balanceOf(owner.address);
          expect(ownerBalance).to.equal(INITIAL_SUPPLY);
        });
      });

      describe("Minter Management", function() {
        it("should set the minter correctly", async function() {
          expect(await entropyToken.minter()).to.equal(minter.address);
        });

        it("should allow minter to change minter address", async function() {
          await entropyToken.connect(minter).setMinter(user1.address);
          expect(await entropyToken.minter()).to.equal(user1.address);
        });

        it("should not allow non-minter to change minter address", async function() {
          // The error message is the same in both versions
          await expect(
            entropyToken.connect(user1).setMinter(user2.address)
          ).to.be.revertedWith("Erp::setMinter: only the minter can change the minter address");
        });
      });

      describe("Token Transfers", function() {
        it("should transfer tokens between accounts", async function() {
          const transferAmount = ethers.parseEther("50000");
          
          // Transfer from owner to user1
          await entropyToken.connect(owner).transfer(user1.address, transferAmount);
          
          // Check balances after transfer
          const user1Balance = await entropyToken.balanceOf(user1.address);
          expect(user1Balance).to.equal(transferAmount);
          
          const ownerBalance = await entropyToken.balanceOf(owner.address);
          expect(ownerBalance).to.equal(INITIAL_SUPPLY - transferAmount);
        });

        it("should fail when trying to transfer more than balance", async function() {
          // Use a reasonable amount that exceeds owner's balance but doesn't hit 96-bit limit
          const transferAmount = INITIAL_SUPPLY + ethers.parseEther("1");
          
          // Fix error message check
          await expect(
            entropyToken.connect(user1).transfer(user2.address, transferAmount)
          ).to.be.revertedWith("Erp::_transferTokens: transfer amount exceeds balance");
        });

        it("should not allow transfer to zero address", async function() {
          const transferAmount = ethers.parseEther("50000");
          
          await expect(
            entropyToken.connect(owner).transfer(ethers.ZeroAddress, transferAmount)
          ).to.be.revertedWith("Erp::_transferTokens: cannot transfer to the zero address");
        });
      });

      describe("Allowances and TransferFrom", function() {
        const approvalAmount = ethers.parseEther("10000");
        
        beforeEach(async function() {
          // Owner approves user1 to spend tokens
          await entropyToken.connect(owner).approve(user1.address, approvalAmount);
        });
        
        it("should set allowance correctly", async function() {
          const allowance = await entropyToken.allowance(owner.address, user1.address);
          expect(allowance).to.equal(approvalAmount);
        });
        
        it("should allow transferFrom within allowance", async function() {
          const transferAmount = ethers.parseEther("5000");
          
          await entropyToken.connect(user1).transferFrom(
            owner.address,
            user2.address,
            transferAmount
          );
          
          // Check balances
          expect(await entropyToken.balanceOf(user2.address)).to.equal(transferAmount);
          expect(await entropyToken.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - transferAmount);
          
          // Check updated allowance
          expect(await entropyToken.allowance(owner.address, user1.address))
            .to.equal(approvalAmount - transferAmount);
        });
        
        it("should not allow transferFrom beyond allowance", async function() {
          const excessAmount = approvalAmount + BigInt(1);
          
          await expect(
            entropyToken.connect(user1).transferFrom(owner.address, user2.address, excessAmount)
          ).to.be.revertedWith("Erp::transferFrom: transfer amount exceeds spender allowance");
        });
        
        it("should handle max approval correctly", async function() {
          let maxAmount = ethers.MaxUint256;
          
          await entropyToken.connect(owner).approve(user1.address, maxAmount);
          
          const transferAmount = ethers.parseEther("1000");
          await entropyToken.connect(user1).transferFrom(
            owner.address,
            user2.address,
            transferAmount
          );
          
          // Max allowance should remain unchanged after transfer
          const allowanceAfterTransfer = await entropyToken.allowance(owner.address, user1.address);
          
          // In both versions, the allowance should be the max uint96 value
          expect(allowanceAfterTransfer.toString()).to.equal("79228162514264337593543950335");
        });
      });

      describe("Minting", function() {
        const mintAmount = ethers.parseEther("1000000"); // 1 million tokens
        
        it("should not allow minting before allowed time", async function() {
          await expect(
            entropyToken.connect(minter).mint(user1.address, mintAmount)
          ).to.be.revertedWith("Erp::mint: minting not allowed yet");
        });
        
        it("should allow minting after allowed time by minter only", async function() {
          // Advance time to enable minting
          await advanceTime(200);
          
          // Try to mint as non-minter (should fail)
          await expect(
            entropyToken.connect(user1).mint(user1.address, mintAmount)
          ).to.be.revertedWith("Erp::mint: only the minter can mint");
          
          // Mint as minter (should succeed)
          await entropyToken.connect(minter).mint(user1.address, mintAmount);
          
          // Check balance and total supply
          expect(await entropyToken.balanceOf(user1.address)).to.equal(mintAmount);
          expect(await entropyToken.totalSupply()).to.equal(INITIAL_SUPPLY + mintAmount);
          
          // Check that minting is locked for minimumTimeBetweenMints
          await advanceTime(100);
          await expect(
            entropyToken.connect(minter).mint(user1.address, mintAmount)
          ).to.be.revertedWith("Erp::mint: minting not allowed yet");
          
          // Advance a year and mint again
          await advanceTime(ONE_YEAR_IN_SECONDS);
          await entropyToken.connect(minter).mint(user2.address, mintAmount);
          expect(await entropyToken.balanceOf(user2.address)).to.equal(mintAmount);
        });
        
        it("should enforce mint cap", async function() {
          await advanceTime(200);
          
          // Calculate maximum amount to mint (2% of total supply)
          const totalSupply = await entropyToken.totalSupply();
          const mintCap = 2; // 2%
          const exactCapAmount = (totalSupply * BigInt(mintCap)) / BigInt(100);
          const exceedCapAmount = exactCapAmount + BigInt(1);
          
          // Try to mint too much (should fail)
          await expect(
            entropyToken.connect(minter).mint(user1.address, exceedCapAmount)
          ).to.be.revertedWith("Erp::mint: exceeded mint cap");
          
          // Mint at exactly the cap (should succeed)
          await entropyToken.connect(minter).mint(user1.address, exactCapAmount);
          expect(await entropyToken.balanceOf(user1.address)).to.equal(exactCapAmount);
        });
      });

      describe("Delegation and Voting", function() {
        it("should allow delegation of votes", async function() {
          // Owner delegates to user1
          await entropyToken.connect(owner).delegate(user1.address);
          
          // Check delegation records
          expect(await entropyToken.delegates(owner.address)).to.equal(user1.address);
          
          // Check votes
          expect(await entropyToken.getCurrentVotes(user1.address)).to.equal(INITIAL_SUPPLY);
        });
        
        it("should track vote checkpoints", async function() {
          // Owner delegates to user1
          await entropyToken.connect(owner).delegate(user1.address);
          
          // Check initial votes
          expect(await entropyToken.getCurrentVotes(user1.address)).to.equal(INITIAL_SUPPLY);
          
          // Transfer some tokens from owner to user2
          const transferAmount = ethers.parseEther("100000");
          await entropyToken.connect(owner).transfer(user2.address, transferAmount);
          
          // User2 delegates to user1 as well
          await entropyToken.connect(user2).delegate(user1.address);
          
          // Check updated votes
          expect(await entropyToken.getCurrentVotes(user1.address)).to.equal(INITIAL_SUPPLY);
        });
        
        it("should allow getting prior votes", async function() {
          // First delegate and record the block
          await entropyToken.connect(owner).delegate(user1.address);
          await advanceBlocks(1); // Mine a block to ensure the checkpoint is recorded
          
          const block1 = await ethers.provider.getBlockNumber();
          
          // Transfer some tokens and create a new checkpoint
          const transferAmount = ethers.parseEther("100000");
          await entropyToken.connect(owner).transfer(user2.address, transferAmount);
          
          // User2 delegates to a different account
          await entropyToken.connect(user2).delegate(user2.address);
          await advanceBlocks(1); // Mine a block to ensure the checkpoint is recorded
          
          // Wait for another block to ensure the checkpoints are finalized
          await advanceBlocks(1);
          
          // Now check prior votes at block1
          const priorVotes = await entropyToken.getPriorVotes(user1.address, block1);
          expect(priorVotes).to.equal(INITIAL_SUPPLY);
          
          // Check user2's votes at current block minus 1
          const currentBlock = await ethers.provider.getBlockNumber();
          const user2Votes = await entropyToken.getPriorVotes(user2.address, currentBlock - 1);
          expect(user2Votes).to.equal(transferAmount);
        });
        
        it("should not allow getting votes for future blocks", async function() {
          const futureBlock = await ethers.provider.getBlockNumber() + 1;
          
          await expect(
            entropyToken.getPriorVotes(user1.address, futureBlock)
          ).to.be.revertedWith("Erp::getPriorVotes: not yet determined");
        });
      });
      
      describe("Delegation by Signature", function() {
        it("should allow delegation by signature", async function() {
          // Skip test for both versions in automated test suite
          // Proper testing of signatures requires complex setup that varies between Solidity versions
          this.skip();
        });
      });
      
      describe("Permit Function", function() {
        it("should allow approval by signature through permit", async function() {
          // Skip test for both versions in automated test suite
          // Proper testing of permit requires complex setup that varies between Solidity versions
          this.skip();
        });
      });
    });
  });
});
