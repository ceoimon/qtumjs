import {
  IABIMethod,
  IETHABI,
  ILogItem,
  LogDecoder,
  IParsedLog
} from "./ethjs-abi"

const {
  decodeParams,
  encodeMethod,
  logDecoder
} = require("ethjs-abi") as IETHABI

export function encodeInputs(method: IABIMethod, args: any[] = []): string {
  const calldata = encodeMethod(method, args)
  return calldata
}

export function decodeOutputs(method: IABIMethod, outputData: string): any[] {
  const types = method.outputs.map((output) => output.type)

  const result: { length: number; [index: number]: any } = {
    length: types.length,
    ...decodeParams([], types, outputData)
  }

  return Array.from(result)
}

export class ContractLogDecoder {
  private _decoder: LogDecoder

  constructor(public abi: IABIMethod[]) {
    this._decoder = logDecoder(abi, true)
  }

  public decode(rawlog: ILogItem): IParsedLog | null {
    const result = this._decoder([rawlog])

    if (result.length === 0) {
      return null
    }

    const log = result[0]

    return log
  }
}
