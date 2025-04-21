# Upgrade of solidity smart contracts via LLM


## Dataset of Legacy Contracts

| File Name   | Pragma  | Category  | Implementation Notes | Lines of Code | Number of Contracts | Number of Functions |
|-------------|---------|-----------|----------------------|---------------|---------------------|---------------------|
| [Alcanium](contracts/legacy/Alcanium_legacy.sol) |  ^0.5.0  | ERC20                 |                                                | 72            | 3                   | 16                  |
| [BNIToken](contracts/legacy/BNIToken_legacy.sol) |   0.4.18   | ERC20                 |                                                | 111           | 7                   | 19                  |
| [FreePalestine](contracts/legacy/FreePalestine_legacy.sol)| 0.6.6  | ERC20                 |                                                | 108           | 4                   | 21                  |
| [NanaInu](contracts/legacy/NanaInu_legacy.sol)   |     ^0.5.0       | ERC20                 |                                                | 72            | 3                   | 16                  |
| [Omosubi](contracts/legacy/Omosubi_legacy.sol)   |   0.6.0         | ERC20                 | Dummy contract                                 | 198           | 3                   | 19                  |
| [O2OToken](contracts/legacy/O2OToken_legacy.sol)   |   ^0.4.16   | ERC20                 |                                                | 208           | 6                   | 18                  |
| [Shop](contracts/legacy/Shop_legacy.sol)         | ^0.4.18            | ERC20 and Transfer    | With opening and closing functions             | 314           | 8                   | 29                  |
| [TokenMintERC20Token](contracts/legacy/TokenMintERC20Token_legacy.sol) |  ^0.5.2 (earliest) | ERC20      |                                                | 429           | 4                   | 29                  |
| [Eloncat](contracts/legacy/Eloncat_legacy.sol)  | ^0.6.12      | Custom ERC20          | With exclusions and fee reflection                                | 545           | 6                   | 54                  |
| [Entropy](contracts/legacy/Entropy_legacy.sol)  |  ^0.5.16    | Custom ERC20          | With Custom mint strategy, delegation, voting, signature verification | 517         | 2                   | 31                  |
| [PonderAirDropToken](contracts/legacy/PonderAirdropToken_legacy.sol) | ^0.4.21 | Custom ERC20 and Transfer | initial airdrop and freezing logic                | 498           | 4                   | 33                  |
| [BlindAuction](contracts/legacy/BlindAuction_legacy.sol) |  >0.4.23 <0.6.0  | Auction               |                                                | 96            | 1                   | 5                   |
| [SimpleAuction](contracts/legacy/SimpleAuction_legacy.sol) | >0.4.22 <0.6.0 | Auction               |                                                | 52            | 1                   | 3                   |
| [Ballot](contracts/legacy/Ballot_legacy.sol)    |  >0.4.23 <0.6.0   | Voting                |                                                | 79            | 1                   | 5                   |
| [EtherTool](contracts/legacy/EtherTool_legacy.sol)  |  ^0.4.18        | Transfer              | With batch transfer                            | 144           | 2                   | 19                  |
| [Purchase](contracts/legacy/Purchase_legacy.sol)| >0.4.22 <0.6.0  | Transfer              |                                                | 70            | 1                   | 3                   |
| [ReceiverPays](contracts/legacy/ReceiverPays_legacy.sol) | >=0.4.24 <0.6.0  | Transfer              | Signature Verification                         | 41            | 1                   | 5                   |
| [SepukuToken](contracts/legacy/SepukuToken_legacy.sol) |^0.5.0 | ERC20   |                         | 149            | 2                   | 27                   |
| [SimplePaymentChannel](contracts/legacy/SimplePaymentChannel_legacy.sol) |>=0.4.24 <0.6.0; | Transfer   | Signature Verification                         | 61            | 1                   | 7                   |
| [Timelock](contracts/legacy/Timelock_legacy.sol) |   ^0.4.24         | TLC                   | Simple time lock based on the value of "now"  | 49            | 3                   | 6                   |
| [IcoLib](contracts/legacy/IcoLib_legacy.sol)    |   0.4.24   | Vesting               | ICO                                            | 477           | 6                   | 47                  |

