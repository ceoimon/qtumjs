import { EventEmitter } from "eventemitter3"

import { ContractLogDecoder } from "./abi"
import { IContractEventLog } from "./Contract"
import { EthRPC, IGetLogsRequest, IPromiseCancel } from "./EthRPC"
import { sleep } from "./sleep"

export type ICancelFunction = () => void

export interface ICancellableEventEmitter extends EventEmitter {
  cancel: ICancelFunction
}

const ETH_HALF_ESTIMATED_AVERAGE_BLOCK_TIME = 7500

export class EventListener {
  // TODO filter out unparseable logs

  constructor(private rpc: EthRPC, private logDecoder: ContractLogDecoder) {}

  /**
   * Get contract event logs. Long-poll wait if no log is found. Returns a cancel
   * function that stops the events subscription.
   *
   * @param req (optional) IRPCWaitForLogsRequest
   */
  public getLogs(
    req: IGetLogsRequest = {}
  ): IPromiseCancel<IContractEventLog[]> {
    const logPromise = this.rpc.getLogs(req)
    return logPromise.then((result) => {
      const entries = result.map((entry) => {
        const parsedLog = this.logDecoder.decode(entry)
        return {
          ...entry,
          event: parsedLog
        }
      })

      return entries
    })
  }

  /**
   * Subscribe to contract's events, using callback interface.
   */
  public onLog(
    fn: (entry: IContractEventLog) => void,
    opts: IGetLogsRequest = {}
  ): ICancelFunction {
    let fromBlock = opts.fromBlock || "latest"
    let toBlock = opts.toBlock || "latest"

    let promiseCancel: (() => void)
    let canceled = false
    let latestBlockNum: number
    let isFirstFetch = true
    const { rpc } = this
    const fetchToLatest = typeof fromBlock !== "number"

    const asyncLoop = async () => {
      while (!canceled) {
        latestBlockNum = await rpc.getBlockNumber()

        if (typeof fromBlock !== "number") {
          fromBlock = latestBlockNum
        }

        if (fetchToLatest) {
          toBlock = latestBlockNum
        }

        if (fromBlock > toBlock || (!isFirstFetch && fromBlock === toBlock)) {
          await sleep(ETH_HALF_ESTIMATED_AVERAGE_BLOCK_TIME)
          continue
        }

        if (isFirstFetch) {
          isFirstFetch = false
        }

        const logPromise = this.getLogs({
          ...opts,
          fromBlock,
          toBlock
        })

        promiseCancel = logPromise.cancel

        const result = await logPromise

        for (const entry of result) {
          fn(entry)
        }

        fromBlock = latestBlockNum + 1
      }
    }

    asyncLoop()

    // return a cancel function
    return () => {
      canceled = true
      if (promiseCancel) {
        promiseCancel()
      }
    }
  }

  /**
   * Subscribe to contract's events, use EventsEmitter interface.
   */
  public emitter(opts: IGetLogsRequest = {}): ICancellableEventEmitter {
    const emitter = new EventEmitter()

    const cancel = this.onLog((entry) => {
      const key = (entry.event && entry.event._eventName) || "?"
      emitter.emit(key, entry)
    }, opts)

    return Object.assign(emitter, {
      cancel
    })
  }
}
