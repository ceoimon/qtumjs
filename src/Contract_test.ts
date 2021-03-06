import "mocha"
import { assert } from "chai"

import { repoData, ethRpc, assertThrow } from "./test"
import { Contract } from "./Contract"

describe("Contract", () => {
  // don't act as sender
  const { sender: _, ...info } = repoData.contracts.Methods

  const contract = new Contract(ethRpc, info)

  describe("#call", async () => {
    it("calls a method and get returned value", async () => {
      const result = await contract.call("getFoo")

      assert.isArray(result)
      assert.isNumber(result[0].toNumber())
    })

    it("throws error if method doesn't exist", async () => {
      await assertThrow(async () => {
        await contract.call("unknownMethod")
      })
    })

    it("throws error if using invalid number of parameters for a method", async () => {
      await assertThrow(async () => {
        await contract.call("getFoo", [1])
      }, "invalid number of parameters")
    })

    it("throws error if using invalid type for a parameter", async () => {
      await assertThrow(async () => {
        await contract.call("setFoo", ["zfoo bar baz"])
      }, "invalid parameter type")
    })

    describe("method overloading", () => {
      const overload = new Contract(
        ethRpc,
        repoData.contracts.MethodOverloading
      )

      it("calls a method and get returned value", async () => {
        let result
        result = await overload.call("foo")
        assert.equal(result[0], "foo()")

        result = await overload.call("foo()")
        assert.equal(result[0], "foo()")

        result = await overload.call("foo(uint256)", [1])
        assert.equal(result[0], "foo(uint256)")
        result = await overload.call("foo(string)", ["a"])
        assert.equal(result[0], "foo(string)")

        result = await overload.call("foo(uint256,uint256)", [1, 2])
        assert.equal(result[0], "foo(uint256,uint256)")
        result = await overload.call("foo(int256,int256)", [1, 2])
        assert.equal(result[0], "foo(int256,int256)")

        result = await overload.call("foo", [1, 2, 3])
        assert.equal(result[0], "foo(int256,int256,int256)")
        result = await overload.call("foo(int256,int256,int256)", [1, 2, 3])
        assert.equal(result[0], "foo(int256,int256,int256)")
      })
    })
  })

  describe("ABI encoding", async () => {
    it("can encode address[]", async () => {
      const logs = new Contract(ethRpc, repoData.contracts.ArrayArguments)

      const calldata = logs.encodeParams("takeArray", [
        [
          "0xaa00000000000000000000000000000000000011",
          "0xbb00000000000000000000000000000000000022"
        ]
      ])

      assert.equal(
        calldata,
        // tslint:disable-next-line:max-line-length
        `0xee3b88ea00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000aa00000000000000000000000000000000000011000000000000000000000000bb00000000000000000000000000000000000022`
      )
    })
  })

  describe("#send", async () => {
    it("can send and confirm tx", async () => {
      const v = Math.floor(Math.random() * 1000000)

      const tx = await contract.send("setFoo", [v])

      // testrpc will not automatic mining, so we can't use tx.confirm(1) here
      const receipt = await tx.confirm(0, (_r) => {
        //
      })

      assert.hasAllKeys(receipt, [
        "blockHash",
        "blockNumber",
        "transactionHash",
        "transactionIndex",
        "from",
        "to",
        "cumulativeGasUsed",
        "gasUsed",
        "contractAddress",
        "logs",
        "rawlogs",
        "logsBloom",
        "status"
      ])

      const result = await contract.call("getFoo")
      assert.equal(result[0].toNumber(), v)
    })

    it("throws error if method exists but is constant", async () => {
      await assertThrow(async () => {
        await contract.send("getFoo")
      }, "method is contant")
    })
  })

  describe("event logs", () => {
    const logs = new Contract(ethRpc, repoData.contracts.Logs)

    it("decodes logs for call", async () => {
      const tx = await logs.send("emitFooEvent", ["abc"])
      const receipt = await tx.confirm(0)
      assert.deepEqual(receipt.logs, [
        {
          0: "abc",
          _eventName: "FooEvent",
          a: "abc"
        }
      ])
    })
  })
})
