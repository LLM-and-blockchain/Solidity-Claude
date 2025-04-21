const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Ballot Contract Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/Ballot_legacy.sol:Ballot");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/Ballot_upgraded.sol:Ballot");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/Ballot_legacy.sol:Ballot");
    contractVersions.push("contracts/upgraded/Ballot_upgraded.sol:Ballot");
  }
  
  // Helper function to convert strings to bytes32
  function stringToBytes32(str) {
    return ethers.encodeBytes32String(str);
  }
  
  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let ballotContract;
      let owner;
      let voter1;
      let voter2;
      let voter3;
      let isSolidity8OrHigher;
      
      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }
      
      // Helper to handle version-specific errors
      async function expectRevertWithMessage(promise, message) {
        if (isSolidity8OrHigher) {
          // Solidity 0.8.x uses Error(string) by default
          await expect(promise).to.be.revertedWith(message);
        } else {
          // For Solidity <0.6, behavior depends on how require is used
          try {
            await promise;
            expect.fail("Expected transaction to be reverted");
          } catch (error) {
            // In older Solidity versions, the error might not contain the message directly
            // So we check if the transaction was reverted at least
            expect(error.message).to.include("reverted");
          }
        }
      }
      
      beforeEach(async function () {
        [owner, voter1, voter2, voter3] = await ethers.getSigners();
        detectSolidityVersion();
        
        // Prepare proposal names
        const proposalNames = [
          stringToBytes32("Proposal 1"),
          stringToBytes32("Proposal 2"),
          stringToBytes32("Proposal 3")
        ];
        
        // Deploy the contract
        const BallotFactory = await ethers.getContractFactory(contractName);
        ballotContract = await BallotFactory.deploy(proposalNames);
        await ballotContract.waitForDeployment();
      });
      
      describe("Deployment", function() {
        it("should set the deployer as chairperson", async function() {
          expect(await ballotContract.chairperson()).to.equal(owner.address);
        });
        
        it("should correctly store proposal names", async function() {
          // In Solidity, public array getters return individual values of struct members
          // rather than the entire struct with property names
          const proposal0 = await ballotContract.proposals(0);
          const proposal1 = await ballotContract.proposals(1);
          const proposal2 = await ballotContract.proposals(2);
          
          // First value returned is the name (bytes32)
          expect(proposal0[0]).to.equal(stringToBytes32("Proposal 1"));
          expect(proposal1[0]).to.equal(stringToBytes32("Proposal 2"));
          expect(proposal2[0]).to.equal(stringToBytes32("Proposal 3"));
        });
        
        it("should initialize vote counts to zero", async function() {
          for (let i = 0; i < 3; i++) {
            const proposal = await ballotContract.proposals(i);
            // Second value returned is the voteCount (uint)
            expect(proposal[1]).to.equal(0);
          }
        });
      });
      
      describe("Access Control", function() {
        it("should allow only chairperson to give right to vote", async function() {
          // Owner (chairperson) should be able to give right to vote
          await ballotContract.giveRightToVote(voter1.address);
          const voter = await ballotContract.voters(voter1.address);
          expect(voter.weight).to.equal(1);
          
          // Other addresses should not be able to give right to vote
          await expectRevertWithMessage(
            ballotContract.connect(voter1).giveRightToVote(voter2.address),
            "Only chairperson can give right to vote."
          );
        });
      });
      
      describe("Voting Process", function() {
        beforeEach(async function() {
          // Give right to vote to voter1 and voter2
          await ballotContract.giveRightToVote(voter1.address);
          await ballotContract.giveRightToVote(voter2.address);
        });
        
        it("should allow voting only for voters with rights", async function() {
          // voter1 has rights and should be able to vote
          await ballotContract.connect(voter1).vote(1);
          
          // voter3 doesn't have rights and should not be able to vote
          await expectRevertWithMessage(
            ballotContract.connect(voter3).vote(1),
            "Has no right to vote"
          );
        });
        
        it("should prevent voting twice", async function() {
          await ballotContract.connect(voter1).vote(1);
          
          await expectRevertWithMessage(
            ballotContract.connect(voter1).vote(2),
            "Already voted."
          );
        });
        
        it("should correctly accumulate votes", async function() {
          await ballotContract.connect(owner).vote(0); // vote for Proposal 1
          await ballotContract.connect(voter1).vote(1); // vote for Proposal 2
          await ballotContract.connect(voter2).vote(0); // vote for Proposal 1
          
          // Proposal 1 should have 2 votes
          expect((await ballotContract.proposals(0))[1]).to.equal(2);
          
          // Proposal 2 should have 1 vote
          expect((await ballotContract.proposals(1))[1]).to.equal(1);
          
          // Proposal 3 should have 0 votes
          expect((await ballotContract.proposals(2))[1]).to.equal(0);
        });
        
        it("should revert on out-of-bounds proposal index", async function() {
          // Try to vote for a non-existent proposal
          // This behavior should be consistent regardless of Solidity version
          await expect(ballotContract.connect(voter1).vote(99)).to.be.reverted;
        });
      });
      
      describe("Delegation", function() {
        beforeEach(async function() {
          // Give right to vote to all voters
          await ballotContract.giveRightToVote(voter1.address);
          await ballotContract.giveRightToVote(voter2.address);
          await ballotContract.giveRightToVote(voter3.address);
        });
        
        it("should allow a voter to delegate their vote", async function() {
          await ballotContract.connect(voter1).delegate(voter2.address);
          
          // Check voter1 has delegated and can't vote
          const voter1Info = await ballotContract.voters(voter1.address);
          expect(voter1Info.voted).to.be.true;
          expect(voter1Info.delegate).to.equal(voter2.address);
          
          // Check voter2's weight has increased
          const voter2Info = await ballotContract.voters(voter2.address);
          expect(voter2Info.weight).to.equal(2);
        });
        
        it("should prevent delegation after voting", async function() {
          await ballotContract.connect(voter1).vote(0);
          
          await expectRevertWithMessage(
            ballotContract.connect(voter1).delegate(voter2.address),
            "You already voted."
          );
        });
        
        it("should prevent self-delegation", async function() {
          await expectRevertWithMessage(
            ballotContract.connect(voter1).delegate(voter1.address),
            "Self-delegation is disallowed."
          );
        });
        
        it("should prevent delegation loops", async function() {
          // Create a delegation chain: voter1 -> voter2 -> voter3
          await ballotContract.connect(voter1).delegate(voter2.address);
          await ballotContract.connect(voter2).delegate(voter3.address);
          
          // Trying to make voter3 delegate to voter1 would create a loop
          await expectRevertWithMessage(
            ballotContract.connect(voter3).delegate(voter1.address),
            "Found loop in delegation."
          );
        });
        
        it("should transfer vote weight when delegate has already voted", async function() {
          // Have voter2 vote first
          await ballotContract.connect(voter2).vote(1);
          
          // Then have voter1 delegate to voter2
          await ballotContract.connect(voter1).delegate(voter2.address);
          
          // Proposal 2 should now have 2 votes (voter2's vote + voter1's delegated vote)
          expect((await ballotContract.proposals(1))[1]).to.equal(2);
        });
      });
      
      describe("Winner Determination", function() {
        beforeEach(async function() {
          // Cast some votes to set up a winner
          await ballotContract.connect(owner).vote(0);
          await ballotContract.giveRightToVote(voter1.address);
          await ballotContract.connect(voter1).vote(0);
          await ballotContract.giveRightToVote(voter2.address);
          await ballotContract.connect(voter2).vote(1);
        });
        
        it("should correctly identify the winning proposal", async function() {
          expect(await ballotContract.winningProposal()).to.equal(0);
        });
        
        it("should correctly return the winner name", async function() {
          expect(await ballotContract.winnerName()).to.equal(stringToBytes32("Proposal 1"));
        });
      });
    });
  });
});
