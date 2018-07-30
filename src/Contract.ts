import { IABIMethod, IParsedLog } from "./ethjs-abi"
import { EventEmitter } from "eventemitter3"

import { decodeOutputs, encodeInputs, ContractLogDecoder } from "./abi"

import { TxReceiptPromise } from "./TxReceiptPromise"

import { MethodMap } from "./MethodMap"
import {
  EthRPC,
  IGetTransactionResult,
  IGetTransactionReceiptBase,
  ISendTransactionResult,
  IGetTransactionReceiptResult,
  typeBlockTags,
  ILogEntry,
  IGetLogsRequest,
  ITransactionLog
} from "./EthRPC"
import { sleep } from "./sleep"
import { ICancelFunction, ICancellableEventEmitter } from "./EventListener"
import { add0xPrefix } from "./convert"

/**
 * The callback function invoked for each additional confirmation
 */
export type IContractSendConfirmationHandler = (
  tx: IGetTransactionResult,
  receipt: ITransactionReceipt
) => any

/**
 * @param n Number of confirmations to wait for
 * @param handler The callback function invoked for each additional confirmation
 */
export type IContractSendConfirmFunction = (
  n?: number,
  handler?: IContractSendConfirmationHandler
) => Promise<ITransactionReceipt>

/**
 * Result of contract send.
 */
export interface IContractSendResult extends IGetTransactionResult {
  /**
   * Name of contract method invoked.
   */
  method: string

  /**
   * Wait for transaction confirmations.
   */
  confirm: IContractSendConfirmFunction

  txid: string
}

/**
 * The minimal deployment information necessary to interact with a
 * deployed contract.
 */
export interface IContractInfo {
  /**
   * Contract's ABI definitions, produced by solc.
   */
  abi: IABIMethod[]

  /**
   * Contract's address
   */
  address: string

  /**
   * The owner address of the contract
   */
  sender?: string
}

/**
 * Deployment information stored by solar
 */
export interface IDeployedContractInfo extends IContractInfo {
  name: string
  deployName: string
  txid: string
  bin: string
  binhash: string
  createdAt: string // date string
  confirmed: boolean
}

/**
 * Options for `send` to a contract method.
 */
export interface IContractSendRequestOptions {
  /**
   * The amount in Ether to send. eg 0.1, default: 0
   */
  value?: number | string

  /**
   * gasLimit, default: 200000, max: 40000000
   */
  gasLimit?: number | string

  /**
   * gasPrice
   */
  gasPrice?: number | string

  /**
   * The ethereum address that will be used as sender.
   */
  from?: string

  nonce?: number | string
}

/**
 * Options for `call` to a contract method.
 */
export interface IContractCallRequestOptions {
  /**
   * The quantum/ethereum address that will be used as sender.
   */
  from?: string

  gasLimit?: string | number
  gasPrice?: string | number
  value?: string | number
  blockNumber?: typeBlockTags
}

/**
 * The transaction receipt for a `send` to a contract method, with the event
 * logs decoded.
 */
export interface ITransactionReceipt extends IGetTransactionReceiptBase {
  /**
   * logs decoded using ABI
   */
  logs: IParsedLog[]

  /**
   * undecoded logs
   */
  rawlogs: ITransactionLog[]
}

/**
 * A decoded contract event log.
 */
export interface IContractEventLog extends ILogEntry {
  /**
   * Solidity event, ABI decoded. Null if no ABI definition is found.
   */
  event?: IParsedLog | null
}

export interface IContractInitOptions {
  /**
   * event logs decoder. It may know how to decode logs not whose types are not
   * defined in this particular contract's `info`. Typically ContractsRepo would
   * pass in a logDecoder that knows about all the event definitions.
   */
  logDecoder?: ContractLogDecoder

  /**
   * If a contract's use case requires numbers more than 53 bits, use bn.js to
   * represent numbers instead of native JavaScript numbers. (default = false)
   */
  useBigNumber?: boolean
}

const ETH_HALF_ESTIMATED_AVERAGE_BLOCK_TIME = 7500

/**
 * Contract represents a Smart Contract deployed on the blockchain.
 */
export class Contract {
  /**
   * The contract's address as hex160
   */
  public address: string

  private methodMap: MethodMap
  private _logDecoder: ContractLogDecoder
  // private _useBigNumber: boolean

  /**
   * Create a Contract
   *
   * @param rpc - The RPC object used to access the blockchain.
   * @param info - The deployment information about this contract generated by
   *      [solar](https://github.com/qtumproject/solar). It includes the contract
   *      address, owner address, and ABI definition for methods and types.
   * @param opts - init options
   */
  constructor(
    private rpc: EthRPC,
    public info: IContractInfo,
    opts: IContractInitOptions = {}
  ) {
    this.methodMap = new MethodMap(info.abi)
    this.address = add0xPrefix(info.address)

    this._logDecoder = opts.logDecoder || new ContractLogDecoder(this.info.abi)

    // this._useBigNumber = false
  }

  public encodeParams(method: string, args: any[] = []): string {
    const methodABI = this.methodMap.findMethod(method, args)
    if (!methodABI) {
      throw new Error(`Unknown method to call: ${method}`)
    }

    return encodeInputs(methodABI, args)
  }

  /**
   * Call a contract method using ABI encoding, and return the RPC result as is.
   * This does not create a transaction. It is useful for gas estimation or
   * getting results from read-only methods.
   *
   * @param method name of contract method to call
   * @param args arguments
   */
  public async rawCall(
    method: string,
    args: any[] = [],
    opts: IContractCallRequestOptions = {}
  ): Promise<string> {
    const calldata = this.encodeParams(method, args)

    const req = {
      ...opts,
      to: this.address,
      data: calldata
    }

    return this.rpc.call(req)
  }

  /**
   * Executes contract method on your own local ethereum node as a "simulation"
   * using `callcontract`. It is free, and does not actually modify the
   * blockchain.
   *
   * @param method Name of the contract method
   * @param args Arguments for calling the method
   * @param opts call options
   */
  public async call(
    method: string,
    args: any[] = [],
    opts: IContractCallRequestOptions = {}
  ): Promise<any[]> {
    const output = await this.rawCall(method, args, opts)

    let decodedOutputs = []
    if (output !== "") {
      const methodABI = this.methodMap.findMethod(method, args)!
      decodedOutputs = decodeOutputs(methodABI, output)
    }

    return decodedOutputs
  }

  /**
   * Call a method, and return only the first return value of the method. This
   * is a convenient syntatic sugar to get the return value when there is only
   * one.
   *
   * @param method Name of the contract method
   * @param args Arguments for calling the method
   * @param opts call options
   */
  public async return(
    method: string,
    args: any[] = [],
    opts: IContractCallRequestOptions = {}
  ): Promise<any> {
    const result = await this.call(method, args, opts)
    return result[0]
  }

  public async returnNumber(
    method: string,
    args: any[] = [],
    opts: IContractCallRequestOptions = {}
  ): Promise<number> {
    const result = await this.call(method, args, opts)
    const val = result[0]

    // Convert big number to JavaScript number
    if (typeof val.toNumber !== "function") {
      throw new Error("Cannot convert result to a number")
    }

    return val.toNumber()
  }

  /**
   * Call a method, and return the first return value as Date. It is assumed
   * that the returned value is unix second.
   *
   * @param method
   * @param args
   * @param opts
   */
  public async returnDate(
    method: string,
    args: any[] = [],
    opts: IContractCallRequestOptions = {}
  ): Promise<Date> {
    const result = await this.return(method, args, opts)
    if (typeof result !== "number") {
      throw Error(
        "Cannot convert return value to Date. Expect return value to be a number."
      )
    }

    return new Date(result * 1000)
  }

  /**
   * Call a method, and return the first return value (a uint). Convert the value to
   * the desired currency unit.
   *
   * @param targetBase The currency unit to convert to. If a number, it is
   * treated as the power of 10.
   * In Ethereum, 0 is wei, 9 is gwei, 18 is ether, etc.
   * @param method
   * @param args
   * @param opts
   */
  public async returnCurrency(
    targetBase:
      | number
      | "ether"
      | "milliether"
      | "finney"
      | "microether"
      | "szabo"
      | "gwei"
      | "shannon"
      | "mwei"
      | "lovelace"
      | "kwei"
      | "babbage"
      | "wei",
    method: string,
    args: any[] = [],
    opts: IContractCallRequestOptions = {}
  ): Promise<number> {
    let value = await this.return(method, args, opts)

    if (typeof value === "object" && typeof value.toNumber === "function") {
      value = value.toNumber()
    }

    if (typeof value !== "number") {
      throw Error(
        "Cannot convert return value to currency unit. Expect return value to be a number."
      )
    }

    let base: number = 0

    if (typeof targetBase === "number") {
      base = targetBase
    } else {
      switch (targetBase) {
        // ethereum units
        case "ether":
          base = 18
          break
        case "milliether":
        case "finney":
          base = 15
          break
        case "microether":
        case "szabo":
          base = 12
          break
        case "gwei":
        case "shannon":
          base = 9
          break
        case "mwei":
        case "lovelace":
          base = 6
          break
        case "kwei":
        case "babbage":
          base = 3
          break
        case "wei":
          base = 0
          break
        default:
          throw Error(`Unknown base currency unit: ${targetBase}`)
      }
    }

    return value * 10 ** base
  }

  public async returnAs<Type>(
    converter: (val: any) => Type | Promise<Type>,
    method: string,
    args: any[] = [],
    opts: IContractCallRequestOptions = {}
  ): Promise<Type> {
    const value = await this.return(method, args, opts)
    return await converter(value)
  }

  /**
   * Create a transaction that calls a method using ABI encoding, and return the
   * RPC result as is. A transaction will require network consensus to confirm,
   * and costs you gas.
   *
   * @param method name of contract method to call
   * @param args arguments
   */
  public async rawSend(
    method: string,
    args: any[],
    opts: IContractSendRequestOptions = {}
  ): Promise<ISendTransactionResult> {
    // TODO opts: gas limit, gas price, sender address
    const methodABI = this.methodMap.findMethod(method, args)
    if (methodABI == null) {
      throw new Error(`Unknown method to send: ${method}`)
    }

    if (methodABI.constant) {
      throw new Error(`Cannot send to a constant method: ${method}`)
    }

    const calldata = encodeInputs(methodABI, args)

    const req = {
      ...opts,
      to: this.address,
      data: calldata
    }

    return this.rpc.sendTransaction(req)
  }

  /**
   * Confirms an in-wallet transaction, and return the receipt.
   *
   * @param txid transaction id. Must be an in-wallet transaction
   * @param confirm how many confirmations to ensure
   * @param onConfirm callback that receives the receipt for each additional confirmation
   */
  public async confirm(
    txid: string,
    confirm?: number,
    onConfirm?: IContractSendConfirmationHandler
  ): Promise<ITransactionReceipt> {
    const txrp = new TxReceiptPromise(this.rpc, txid)
    if (onConfirm) {
      txrp.onConfirm((tx2, receipt2) => {
        const sendTxReceipt = this._makeSendTxReceipt(receipt2)
        onConfirm(tx2, sendTxReceipt)
      })
    }

    const receipt = await txrp.confirm(confirm)

    return this._makeSendTxReceipt(receipt)
  }

  /**
   * Returns the receipt for a transaction, with decoded event logs.
   *
   * @param txid transaction id. Must be an in-wallet transaction
   * @returns The receipt, or null if transaction is not yet confirmed.
   */
  public async receipt(txid: string): Promise<ITransactionReceipt | null> {
    const receipt = await this.rpc.getTransactionReceipt(txid)
    if (!receipt) {
      return null
    }

    return this._makeSendTxReceipt(receipt)
  }

  public async send(
    method: string,
    args: any[] = [],
    opts: IContractSendRequestOptions = {}
  ): Promise<IContractSendResult> {
    const methodABI = this.methodMap.findMethod(method, args)
    if (methodABI == null) {
      throw new Error(`Unknown method to send: ${method}`)
    }

    if (methodABI.constant) {
      throw new Error(`cannot send to a constant method: ${method}`)
    }

    const calldata = encodeInputs(methodABI, args)

    const sentResult = await this.rpc.sendTransaction({
      ...opts,
      data: calldata,
      to: this.address
    })

    const txid = sentResult.txid
    const transaction = (await this.rpc.getTransaction(txid))!

    const confirm = (n?: number, handler?: any) =>
      this.confirm(txid, n, handler)

    const sendTx = {
      ...transaction,
      txid,
      method,
      confirm
    }

    return sendTx
  }

  /**
   * Get contract event logs, up to the latest block. By default, it starts looking
   * for logs from the beginning of the blockchain.
   * @param req
   */
  public async logs(req: IGetLogsRequest = {}): Promise<IContractEventLog[]> {
    return this.getLogs({
      fromBlock: 0,
      toBlock: "latest",
      ...req
    })
  }

  /**
   * Get contract event logs. Long-poll wait if no log is found.
   * @param req (optional) IRPCWaitForLogsRequest
   */
  public async getLogs(
    req: IGetLogsRequest = {}
  ): Promise<IContractEventLog[]> {
    const result = await this.rpc.getLogs({
      ...req,
      address: this.address
    })

    const entries: IContractEventLog[] = result.map((entry) => {
      const parsedLog = this.logDecoder.decode(entry)
      return {
        ...entry,
        event: parsedLog
      }
    })

    return entries
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

    let canceled = false
    let latestBlockNum: number
    let isFirstFetch = true
    const fetchToLatest = typeof fromBlock !== "number"

    const loop = async () => {
      while (!canceled) {
        latestBlockNum = await this.rpc.getBlockNumber()

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

        const result = await this.getLogs({
          ...opts,
          fromBlock,
          toBlock
        })

        for (const entry of result) {
          fn(entry)
        }

        fromBlock = latestBlockNum + 1
      }
    }

    loop()

    // return a cancel function
    return () => {
      canceled = true
    }
  }

  /**
   * Subscribe to contract's events, use EventsEmitter interface.
   */
  public logEmitter(opts: IGetLogsRequest = {}): ICancellableEventEmitter {
    const emitter = new EventEmitter()

    const cancel = this.onLog((entry) => {
      const key = (entry.event && entry.event._eventName) || "?"
      emitter.emit(key, entry)
    }, opts)

    return Object.assign(emitter, {
      cancel
    })
  }

  private get logDecoder(): ContractLogDecoder {
    return this._logDecoder
  }

  private _makeSendTxReceipt(
    receipt: IGetTransactionReceiptResult
  ): ITransactionReceipt {
    const { logs: rawlogs, ...receiptNoLog } = receipt

    const logs = rawlogs.map((rawLog) => this.logDecoder.decode(rawLog)!)

    return {
      ...receiptNoLog,
      logs,
      rawlogs
    }
  }
}
