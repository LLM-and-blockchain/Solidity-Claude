const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NanaInu Token Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/NanaInu_legacy.sol:NanaInu");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/NanaInu_upgraded.sol:NanaInu");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/NanaInu_legacy.sol:NanaInu");
    contractVersions.push("contracts/upgraded/NanaInu_upgraded.sol:NanaInu");
  }

  // Helper function to format token amounts with the correct number of decimals
  function parseTokenAmount(amount) {
    return ethers.parseUnits(amount.toString(), 9); // 9 decimals for NanaInu
  }
  
  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let nanaInu;
      let owner;
      let user1;
      let user2;
      let isSolidity8OrHigher;
      
      // Version detection helper
      function detectSolidityVersion() {
        isSolidity8OrHigher = contractName.includes("upgraded");
      }

      beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        detectSolidityVersion();
        
        const NanaInuFactory = await ethers.getContractFactory(contractName);
        nanaInu = await NanaInuFactory.deploy();
        await nanaInu.waitForDeployment();
      });

      describe("Deployment", function () {
        it("Should set the right token name and symbol", async function () {
          expect(await nanaInu.name()).to.equal("NanaInu");
          expect(await nanaInu.symbol()).to.equal("NINU");
        });

        it("Should set the correct decimals", async function () {
          expect(await nanaInu.decimals()).to.equal(9);
        });

        it("Should assign the total supply to the owner", async function () {
          const totalSupply = await nanaInu.totalSupply();
          const ownerBalance = await nanaInu.balanceOf(owner.address);
          expect(ownerBalance).to.equal(totalSupply);
          expect(totalSupply).to.equal(parseTokenAmount(100000000000));
        });
      });

      describe("Transactions", function () {
        it("Should transfer tokens between accounts", async function () {
          const transferAmount = parseTokenAmount(50);

          // Transfer from owner to user1
          await nanaInu.transfer(user1.address, transferAmount);
          
          // Check balances after transfer
          const user1Balance = await nanaInu.balanceOf(user1.address);
          expect(user1Balance).to.equal(transferAmount);
        });

        it("Should fail if sender doesn't have enough tokens", async function () {
          const initialOwnerBalance = await nanaInu.balanceOf(owner.address);
          const excessiveAmount = initialOwnerBalance + parseTokenAmount(1);
          
          // Try to transfer more than the owner has
          if (isSolidity8OrHigher) {
            // Solidity 0.8.x throws a built-in overflow error that gets wrapped differently
            await expect(
              nanaInu.transfer(user1.address, excessiveAmount)
            ).to.be.reverted; // Exact error message might differ, so we just check for reversion
          } else {
            // Solidity 0.5.x will revert with "require(b <= a)" error from the safeSub function
            await expect(
              nanaInu.transfer(user1.address, excessiveAmount)
            ).to.be.reverted;
          }
        });

        it("Should update balances after transfers", async function () {
          const initialOwnerBalance = await nanaInu.balanceOf(owner.address);
          const amount1 = parseTokenAmount(100);
          const amount2 = parseTokenAmount(50);

          // Transfer from owner to user1
          await nanaInu.transfer(user1.address, amount1);

          // Transfer from user1 to user2
          await nanaInu.connect(user1).transfer(user2.address, amount2);

          // Check final balances
          const ownerEndingBalance = await nanaInu.balanceOf(owner.address);
          const user1Balance = await nanaInu.balanceOf(user1.address);
          const user2Balance = await nanaInu.balanceOf(user2.address);

          expect(ownerEndingBalance).to.equal(initialOwnerBalance - amount1);
          expect(user1Balance).to.equal(amount1 - amount2);
          expect(user2Balance).to.equal(amount2);
        });
      });

      describe("Allowances", function () {
        it("Should update allowance when approved", async function () {
          const approvalAmount = parseTokenAmount(100);
          
          await nanaInu.approve(user1.address, approvalAmount);
          
          const allowance = await nanaInu.allowance(owner.address, user1.address);
          expect(allowance).to.equal(approvalAmount);
        });

        it("Should allow transferFrom when properly approved", async function () {
          const approvalAmount = parseTokenAmount(100);
          const transferAmount = parseTokenAmount(50);
          
          // Owner approves user1
          await nanaInu.approve(user1.address, approvalAmount);
          
          // User1 transfers tokens from owner to user2 via transferFrom
          await nanaInu.connect(user1).transferFrom(
            owner.address,
            user2.address,
            transferAmount
          );
          
          // Check balances and updated allowance
          const ownerBalance = await nanaInu.balanceOf(owner.address);
          const user2Balance = await nanaInu.balanceOf(user2.address);
          const remainingAllowance = await nanaInu.allowance(owner.address, user1.address);
          
          expect(user2Balance).to.equal(transferAmount);
          expect(ownerBalance).to.equal(parseTokenAmount(100000000000) - transferAmount);
          expect(remainingAllowance).to.equal(approvalAmount - transferAmount);
        });

        it("Should not allow transferFrom beyond allowance", async function () {
          const approvalAmount = parseTokenAmount(50);
          const excessiveAmount = parseTokenAmount(100);
          
          // Owner approves user1
          await nanaInu.approve(user1.address, approvalAmount);
          
          // User1 tries to transfer more than allowed
          await expect(
            nanaInu.connect(user1).transferFrom(
              owner.address,
              user2.address,
              excessiveAmount
            )
          ).to.be.reverted;
        });
      });

      describe("SafeMath operations", function() {
        it("Should handle safe addition correctly", async function() {
          // This test directly calls the SafeMath function
          const a = 1000;
          const b = 500;
          const result = await nanaInu.safeAdd(a, b);
          expect(result).to.equal(a + b);
        });

        it("Should handle safe subtraction correctly", async function() {
          // This test directly calls the SafeMath function
          const a = 1000;
          const b = 500;
          const result = await nanaInu.safeSub(a, b);
          expect(result).to.equal(a - b);
        });

        it("Should revert when subtraction would underflow", async function() {
          // This test directly calls the SafeMath function
          const a = 500;
          const b = 1000;
          
          // Safe subtraction should revert when b > a
          await expect(nanaInu.safeSub(a, b)).to.be.reverted;
        });
      });
    });
  });
});