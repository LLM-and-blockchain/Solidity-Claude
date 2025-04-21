# General comments
In general, after the process, the update corrects the syntax of keywords for defining constructs (abstract, interface etc.) and for functions (override) as well as basic modifiers (external, internal, view). 
It also almost always adds an MIT license when no license has been specified (in one case, it does not add it).
It consistently corrects .now to block.timestamp. It always adds a message to require statements when missing. In two cases, it retains assert statements without comments.
It almost always removes the visibility of the constructor (leaving it intact once).

The differences in approach when updating safeMath are interesting (sometimes it eliminates it, sometimes it downgrades it, and sometimes it leaves it unchanged).

The same applies to .transfer. Although it updates it to .call{value ... } from the first iteration in the majority of cases, it occasionally (twice) retains .transfer.

To remove selfdestruct, it was necessary to request fixing the compilation warnings of the updated contract.




## Number of Iteractions  
In the following table, the number of furter iteractions necessary to obtain no errors nor warnings in compilation and testing. 

| Contract              | #It. upgrade | #It. test | #newtextprompt                                                                 | #itUpgradedAfterTest | #continue |
|-----------------------|--------------|-----------|----------------------------------------------------------------------------------|-----------------------|-----------|
| Alcanium              | 0            | 0         | 0                                                                                | 0                     | 0         |
| BNIToken              | 2            | 0         | 0                                                                                | 0                     | 0         |
| FreePalestine         | 0            | 2         | 0                                                                                | 0                     | 0         |
| NanaInu               | 0            | 0         | 0                                                                                | 0                     | 0         |
| Omosubi               | 0            | 1         | 0                                                                                | 0                     | 1         |
| O2OToken              | 4            | 2         | 1 - Fix test missing code                                                        |                       | 4         |
| Shop                  | 2            | 7         | 3 - fix errors in test file<br>  - Add other test<br>  - add missing code        | 0                     | 5         |
| TokenMintERC20Token   | 1            | 1         | 0                                                                                | 0                     | 0         |
| Eloncat               | 2            | 2         | 2 - add test missing code<br>  - fix the warning                                 | 0                     | 2         |
| Entropy               | 0            | 2         | 1 - add test missing code                                                        | 0                     | 1         |
| PonderAirDropToken    | 2            | 4         | 3 - fix the warning<br>  - add test missing code<br>  - I cannot modify legacy contract | 0               | 5         |
| BlindAuction          | 0            | 2         | 0                                                                                | 0                     | 0         |
| SimpleAuction         | 0            | 2         | 0                                                                                | 0                     | 0         |
| Ballot                | 0            | 1         | 0                                                                                | 0                     | 0         |
| EtherTool             | 0            | 2         | 0                                                                                | 0                     | 4         |
| Purchase              | 0            | 1         | 0                                                                                | 0                     | 0         |
| ReceiverPays          | 1            | 2         | 0                                                                                | 0                     | 0         |
| SepukuToken           | 1            | 3         | 0                                                                                | 0                     | 0         |
| SimplePaymentChannel  | 1            | 1         | 0                                                                                | 0                     | 0         |
| Timelock              | 0            | 2         | 0                                                                                | 0                     | 0         |
| IcoLib                | 1            | 3         | 2 - fix the warning<br>  - add test missing code                                 | 0                     | 2         |



## Manually inspections of the final code 

| Name            | Authors Notes  | Automatic Report  |                                                           
|--------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Alcanium                 | Corrects the use of interface. Specifies returns. Limits function visibility. Adds messages to require. Continues to use SafeMath.                                                                             | The report admits the redundancy of SafeMath.                                                         |
| BNIToken                 | Correctly renames the abstract. Modifies SafeMath by eliminating checks. Does not use SafeMath for mathematical operations. Uses the "unchecked" block to limit gas. Adds messages to require.                 | The report confirms.                                                                                 |
| FreePalestine            | Does not modify SafeMath, leaving checks and implicit return. Adds comments to require. Does not modify the visibility of the mapping. Does not use unchecked.                                               | The report admits the redundancy of SafeMath. Shows (few) code changes instead of describing them. Coverage check: 78% overall (low). |
| NanaInu                  | Changes visibility to external. Maintains and specifies the return of SafeMath. Adds messages to require. NanaInu is identical to Alcanium.                                                                    | The report confirms.                                                                                 |
| Omosubi                  | Eliminates SafeMath. Replaces ~uint256(0) with type(uint256).max.                                                                                                                                          | The report confirms.                                                                                 |
| O2OToken                 | Adds constructor keyword. Removes checks from SafeMath but does not make use of SafeMath. Uses the keyword interface. Removed var type. Makes explicit modifiers such as public, virtual, and override. Adds messages to require. | The report confirms and states that SafeMath is now unnecessary.                                      |
| Shop                     | Maintains SafeMath and uses it in the code, changing the syntax of the call. Adds messages to require. Removes now for block.timestamp. Adds receive and fallback. Removes .tansfer.                          | The report confirms. No practical motivation for the new usage of SafeMath. Shows code changes instead of describing them. Test coverage: 72% (all core functions tested). |
| TokenMintERC20Token      | Maintains SafeMath. Replaces .transfer wiht .call. Other few changes concern visibility and keywords for overriding.                                                                                                     | The report states that it uses built-in overflow checks but actually keeps using programmed checks.   |
| Eloncat                  | Maintains and uses SafeMath. Uses calldata. Adds "excludeFromReward" and "includeInReward" functions.                                                                                                       | The report states that SafeMath was kept to maintain identical behavior and ensure that calculations produce the same results. The two functions were added to fully implement implied functionality. |
| Entropy                  | Removes SafeMath. Removes now. Replaces value uint256(-1) with type(uint256).max. Replaces assembly with block.chainid.                                                                                     | The report confirms.                                                                                 |
| PonderAirdrop            | Removes checks on SafeMath. Corrects visibility and modes. Adds comments to require. Adds override if needed. Important: implements kill without selfdestruct, but disables the contract and recovers funds. Note: emits freeze twice and should not do it even once. | The report confirms but does not explain the double event.                                          |
| BlindAuction              | Adds messages to require. Removes now for block.timestamp. Replaces .transfer with .call.                                                                                                                 | The report confirms.                                                                                 |
| SimpleAuction            | Removes now for block.timestamp. Continues to use .send(amount).                                                                                                                                           | The report confirms.                                                                                 |
| Ballot                   | No substantial changes to the code.                                                                                                                                                                         | The report confirms.                                                                                 |
| EtherTool                | Leaves SafeMath unchanged (with asserts without messages) and uses it. Adds messages to require. Replaces .transfer with .call. In the two batchTransfer, if one of the expected tx fails, it does not stop but returns that amount to the msg.sender's account. Updates keccak. Adds receive. Adds a fallback that probably is not needed. | The report confirms and describes safety upgrades.                                                  |
| Purchase                 | Maintains .transfer.                                                                                                                                                                            | The report does not mention .transfer.                                                               |
| ReceiverPays             | Replaces .transfer with .call. Adds messages on require. Replaces selfdestruct with a simple fund emptying.                                                                                                 | The report confirms.                                                                                 |
| SepukuToken              | Makes explicit abstract contract and override functions. Maintains and uses SafeMath. Adds messages to require.                                                                                             | The report confirms.                                                                                 |
| SimplePaymentChannel      | Updates now with block.timestamp. Adds a state variable isChannelOpen. Adds a modifier to check isChannelOpen. Mantains .transfer. Changes selfdestruct to empty funds to the contract creator. Adds events. | The report does not mention .transfer nor new events.                                                |
| Timelock                 | Transforms contract to interface. Updates built-in modifiers (constant -> view), adds a receive function (but not a fallback). Replaces .now with block.timestamp. Adds comments to require. | The report confirms.|
|IcoLib | Removes direct assignment of owner = msg.sender from the state variable declaration. Adds messages to require. maintains SafeMath by modifying checks and changing asserts to require. Uses library style for calling safemath functions. Specifies virtual but does not use interface. Specifies memory of address[] in calldata in the TokenDB contract. Adds constructors. Adds receive and fallback functions. Replaces assembly with high-level delegatecall, and heavily modifies the first part of the setVesting function. Adds an emit on claimVesting and corrects various returns of CalculateReward. Improves readability. | The report partially confirms but does not mention the editing of setVesting, the new emit, and the returns.|

