import { EventEmitter } from "eventemitter3"

import { sleep } from "./sleep"
import {
  EthRPC,
  IGetTransactionResult,
  IGetTransactionReceiptResult,
  TRANSACTION_STATUS
} from "./EthRPC"

export type EthTxReceiptConfirmationHandler = (
  tx: IGetTransactionResult,
  receipt: IGetTransactionReceiptResult
) => any

const EVENT_CONFIRM = "confirm"

const ETH_HALF_ESTIMATED_AVERAGE_BLOCK_TIME = 7500

// tslint:disable-next-line:no-empty-interface
export interface ITxReceiptConfirmOptions {
  pollInterval?: number
}

export class TxReceiptPromise {
  private _emitter: EventEmitter

  constructor(private _rpc: EthRPC, public txid: string) {
    this._emitter = new EventEmitter()
  }

  // TODO should return parsed logs with the receipt
  public async confirm(
    confirm: number = 3,
    opts: ITxReceiptConfirmOptions = {}
  ): Promise<IGetTransactionReceiptResult> {
    const rpc = this._rpc
    const tx = await rpc.getTransaction(this.txid)
    if (tx == null) {
      throw new Error(`Cannot find transaction(${tx}`)
    }

    const { txid } = this
    const { pollInterval = ETH_HALF_ESTIMATED_AVERAGE_BLOCK_TIME } = opts

    let prevConfirmationCounter = 0

    while (true) {
      const receipt = await rpc.getTransactionReceipt(txid)
      const currentBlockNumber = await rpc.getBlockNumber()

      // not yet confirmed or is pending
      if (receipt == null) {
        await sleep(pollInterval)
        continue
      }

      const hasTransactionError =
        receipt.status != null &&
        Number(receipt.status) === TRANSACTION_STATUS.FAILED
      if (hasTransactionError) {
        throw new Error("Transaction process error")
      }

      const receiptBlockNumber = receipt.blockNumber

      const confirmationCounter =
        currentBlockNumber - Number(receiptBlockNumber)
      if (confirmationCounter === 0 && confirm > 0) {
        // ignore fresh receipt
        await sleep(pollInterval)
        continue
      }

      if (confirmationCounter < confirm) {
        // wait for more confirmations
        let confirmationCount = 1
        if (confirmationCounter !== prevConfirmationCounter) {
          confirmationCount = confirmationCounter - prevConfirmationCounter
          prevConfirmationCounter = confirmationCount
        }

        for (let i = 0; i < confirmationCount; i++) {
          this._emitter.emit(EVENT_CONFIRM, tx, receipt)
        }

        await sleep(pollInterval)
        continue
      }

      // enough confirmation, success
      this._emitter.removeAllListeners(EVENT_CONFIRM)
      return receipt
    }
  }

  public onConfirm(fn: EthTxReceiptConfirmationHandler) {
    this._emitter.on(EVENT_CONFIRM, fn)
  }

  public offConfirm(fn: EthTxReceiptConfirmationHandler) {
    this._emitter.off(EVENT_CONFIRM, fn)
  }
}
