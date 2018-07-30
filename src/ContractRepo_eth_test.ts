import "mocha"
import { assert } from "chai"

import { repoData, ethRpc } from "./test"
import { ContractsRepo } from "./ContractsRepo"

describe("ContractsRepo", () => {
  const repo = new ContractsRepo(ethRpc, repoData)

  it("can instantiate a contract", () => {
    const contract = repo.contract("LogOfDependantContract")

    assert.isNotNull(contract)
    assert.strictEqual(contract.info, repoData.contracts.LogOfDependantContract)
  })

  it("can instantiate a contract with an log decoder that knows about all events", async () => {
    const contract = repo.contract("LogOfDependantContract")

    const tx = await contract.send("emitLog")
    const result = await tx.confirm(0)

    const fooEvent = result.logs[0]!

    assert.isNotNull(fooEvent)
    assert.deepEqual(fooEvent[0], "Foo!")
    assert.deepEqual(fooEvent, {
      0: "Foo!",
      data: "Foo!",
      _eventName: "LogOfDependantContractChildEvent"
    })
  })
})
