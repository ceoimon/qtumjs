The Ethereum JavaScript library for Smart Contract development.

# Install

```
npm install qtumjs-eth
```

This is a sample code snippet that transfer ERC20 tokens:

```js
import {
  EthRPC,
} from "qtumjs-eth"

const repoData = require("./solar.json")
const ethereum = new Ethereum("http://localhost:8545", repoData)

const myToken = ethereum.contract("zeppelin-solidity/contracts/token/CappedToken.sol")

async function transfer(fromAddr, toAddr, amount) {
  const tx = await myToken.send("transfer", [toAddr, amount], {
    from: fromAddr,
  })

  console.log("transfer tx:", tx.txid)
  console.log(tx)

  await tx.confirm(3)
  console.log("transfer confirmed")
}
```

# Running Tests

Run [Ethereum Test RPC (Ganache CLI)](https://github.com/trufflesuite/ganache-cli):

```
ganache-cli
```

Deploy test contracts:

```
export ETH_RPC=http://{$eth_sender_Address}:@localhost:8545
sh deploy-test-contracts.sh
```

Build and run tests:

```
npm build
npm run test
```
