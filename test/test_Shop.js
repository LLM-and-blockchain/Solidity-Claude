const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Shop Contract Tests", function () {
  // Array of contract fully qualified names to test
  const contractVersions = [];
  
  // Determine which contract(s) to test based on environment variable
  const requestedVersion = process.env.CONTRACT_VERSION;
  if (requestedVersion === "legacy") {
    contractVersions.push("contracts/legacy/Shop_legacy.sol:Shop");
  } else if (requestedVersion === "upgraded") {
    contractVersions.push("contracts/upgraded/Shop_upgraded.sol:Shop");
  } else {
    // If no specific version is requested, test both
    contractVersions.push("contracts/legacy/Shop_legacy.sol:Shop");
    contractVersions.push("contracts/upgraded/Shop_upgraded.sol:Shop");
  }

  // Helper function to determine if we're testing Solidity 0.8.x version
  function isSolidity8(contractName) {
    return contractName.includes("upgraded");
  }
  
  // Run the same tests for each contract version
  contractVersions.forEach(contractName => {
    describe(`Testing ${contractName}`, function() {
      let shopContract;
      let owner;
      let bank;
      let buyer;
      let otherAccount;
      let endTime;
      const tokenName = "TestToken";
      const tokenSymbol = "TT";
      const rate = ethers.parseEther("10"); // 10 tokens per ETH
      
      beforeEach(async function () {
        [owner, bank, buyer, otherAccount] = await ethers.getSigners();
        
        // Set end time 1 hour from now
        const currentTime = await time.latest();
        endTime = currentTime + 3600; // 1 hour from now
        
        // Create contract instance
        const ShopFactory = await ethers.getContractFactory(contractName);
        shopContract = await ShopFactory.deploy(
          bank.address,
          tokenName,
          tokenSymbol,
          rate,
          endTime
        );
        await shopContract.waitForDeployment();
      });
      
      describe("Shop Deployment", function () {
        it("Should set the right owner", async function () {
          expect(await shopContract.owner()).to.equal(owner.address);
        });
        
        it("Should set the right bank address", async function () {
          const shopSettings = await shopContract.shopSettings();
          expect(shopSettings.bank).to.equal(bank.address);
        });
        
        it("Should set the correct rate", async function () {
          const shopSettings = await shopContract.shopSettings();
          expect(shopSettings.rate).to.equal(rate);
        });
        
        it("Should set the correct start and end time", async function () {
          const shopSettings = await shopContract.shopSettings();
          const currentTime = await time.latest();
          
          // Start time should be close to the current time at deployment
          expect(Number(shopSettings.startTime)).to.be.closeTo(currentTime - 10, 10);
          
          // End time should be 1 hour from the deployment time
          expect(Number(shopSettings.endTime)).to.be.closeTo(currentTime + 3600, 10);
        });
        
        it("Should create a new Object token contract", async function () {
          const objectAddress = await shopContract.object();
          // Verify address is not zero
          expect(objectAddress).to.not.equal(ethers.ZeroAddress);
        });
      });

      describe("Token Purchase", function () {
        it("Should allow buying tokens with correct price", async function () {
          // Calculate price (1 ETH / rate)
          const expectedPrice = ethers.parseEther("1") * ethers.parseEther("1") / rate;
          const shopSettings = await shopContract.shopSettings();
          expect(shopSettings.price).to.equal(expectedPrice);
          
          // Buy tokens - verify the event is emitted
          const purchaseAmount = expectedPrice;
          await expect(shopContract.connect(buyer).buyObject(buyer.address, { value: purchaseAmount }))
            .to.emit(shopContract, "ObjectPurchase")
            .withArgs(buyer.address, buyer.address, purchaseAmount, ethers.parseEther("1"));
        });
        
        it("Should transfer funds to bank address", async function () {
          // Note: Need to check the difference in balance due to gas costs
          const initialBankBalance = await ethers.provider.getBalance(bank.address);
          
          // Calculate price
          const shopSettings = await shopContract.shopSettings();
          const price = shopSettings.price;
          
          // Buy tokens
          await shopContract.connect(buyer).buyObject(buyer.address, { value: price });
          
          // Check bank balance after purchase
          const finalBankBalance = await ethers.provider.getBalance(bank.address);
          expect(finalBankBalance - initialBankBalance).to.equal(price);
        });
        
        it("Should require purchase to be in whole token increments", async function () {
          // Calculate price for one token
          const shopSettings = await shopContract.shopSettings();
          const price = shopSettings.price;
          
          // Try to buy a partial token (price - 1 wei)
          const partialAmount = price - 1n;
          
          // The error handling differs between Solidity versions
          if (isSolidity8(contractName)) {
            // Solidity 0.8.x provides more specific error messages
            await expect(
              shopContract.connect(buyer).buyObject(buyer.address, { value: partialAmount })
            ).to.be.revertedWith("Purchase must be in whole token increments");
          } else {
            // Solidity 0.4.x just reverts without a message
            await expect(
              shopContract.connect(buyer).buyObject(buyer.address, { value: partialAmount })
            ).to.be.reverted;
          }
        });
      });
      
      describe("Shop Management", function () {
        it("Should allow owner to close the shop", async function () {
          await expect(shopContract.closeShop())
            .to.emit(shopContract, "ShopClosed");
            
          const shopSettings = await shopContract.shopSettings();
          
          // In Solidity 0.4.x, now refers to block.timestamp
          // In Solidity 0.8.x, we use block.timestamp directly
          // Both will be close to the current timestamp
          const currentTimestamp = await time.latest();
          expect(Number(shopSettings.endTime)).to.be.closeTo(currentTimestamp, 5); // Allow small variation
        });
        
        it("Should not allow non-owner to close the shop", async function () {
          if (isSolidity8(contractName)) {
            await expect(shopContract.connect(otherAccount).closeShop())
              .to.be.revertedWith("Ownable: caller is not the owner");
          } else {
            await expect(shopContract.connect(otherAccount).closeShop())
              .to.be.reverted;
          }
        });
        
        it("Should not allow purchases after shop is closed", async function () {
          // Close the shop
          await shopContract.closeShop();
          
          // Calculate price
          const shopSettings = await shopContract.shopSettings();
          const price = shopSettings.price;
          
          // Try to buy after closing
          if (isSolidity8(contractName)) {
            await expect(
              shopContract.connect(buyer).buyObject(buyer.address, { value: price })
            ).to.be.revertedWith("Shop is closed or zero value sent");
          } else {
            await expect(
              shopContract.connect(buyer).buyObject(buyer.address, { value: price })
            ).to.be.reverted;
          }
        });
        
        it("Should allow owner to transfer ownership", async function () {
          // Transfer ownership to another account
          await shopContract.transferOwnership(otherAccount.address);
          
          // Verify new owner
          expect(await shopContract.owner()).to.equal(otherAccount.address);
          
          // Verify old owner can't call owner-only functions anymore
          await expect(shopContract.closeShop()).to.be.reverted;
          
          // Verify new owner can call owner-only functions
          await expect(shopContract.connect(otherAccount).closeShop()).to.emit(shopContract, "ShopClosed");
        });
        
        it("Should not allow transferring ownership to zero address", async function () {
          if (isSolidity8(contractName)) {
            await expect(shopContract.transferOwnership(ethers.ZeroAddress))
              .to.be.revertedWith("Ownable: new owner is the zero address");
          } else {
            await expect(shopContract.transferOwnership(ethers.ZeroAddress))
              .to.be.reverted;
          }
        });
      });
      
      describe("Edge Cases", function () {
        it("Should not allow purchasing with zero value", async function () {
          if (isSolidity8(contractName)) {
            await expect(
              shopContract.connect(buyer).buyObject(buyer.address, { value: 0 })
            ).to.be.revertedWith("Shop is closed or zero value sent");
          } else {
            await expect(
              shopContract.connect(buyer).buyObject(buyer.address, { value: 0 })
            ).to.be.reverted;
          }
        });
        
        it("Should calculate correct price based on rate", async function () {
          // Test price calculation (1 ETH / rate)
          const expectedPrice = ethers.parseEther("1") * ethers.parseEther("1") / rate;
          const shopSettings = await shopContract.shopSettings();
          expect(shopSettings.price).to.equal(expectedPrice);
          
          // If rate is 10 tokens per ETH, price should be 0.1 ETH per token
          const expectedPriceInEth = 0.1;
          const priceInEth = Number(ethers.formatEther(shopSettings.price));
          expect(priceInEth).to.be.closeTo(expectedPriceInEth, 0.001);
        });
        
        it("Should keep track of funds raised", async function () {
          // Initial funds raised should be 0
          let shopSettings = await shopContract.shopSettings();
          expect(shopSettings.fundsRaised).to.equal(0);
          
          // Calculate price
          const price = shopSettings.price;
          
          // Buy tokens - 3 tokens
          const purchaseAmount = price * 3n;
          await shopContract.connect(buyer).buyObject(buyer.address, { value: purchaseAmount });
          
          // Check funds raised
          shopSettings = await shopContract.shopSettings();
          expect(shopSettings.fundsRaised).to.equal(purchaseAmount);
        });
      });
      
      describe("Complex Scenarios", function () {
        it("Should handle multiple purchases correctly", async function () {
          const shopSettings = await shopContract.shopSettings();
          const price = shopSettings.price;
          
          // Multiple purchases from different accounts
          await shopContract.connect(buyer).buyObject(buyer.address, { value: price * 3n });
          await shopContract.connect(otherAccount).buyObject(otherAccount.address, { value: price * 2n });
          
          // Verify ObjectPurchase events
          const filter = shopContract.filters.ObjectPurchase();
          const events = await shopContract.queryFilter(filter);
          
          // Should have 2 events
          expect(events.length).to.equal(2);
          
          // Check fundsRaised
          const updatedSettings = await shopContract.shopSettings();
          const totalPurchaseAmount = price * 5n; // 3 + 2 tokens
          expect(updatedSettings.fundsRaised).to.equal(totalPurchaseAmount);
        });
      });
    });
  });
});