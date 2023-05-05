import { defaultAbiCoder } from "@ethersproject/abi";
import { ethers } from "ethers";
import { arrayify, keccak256 } from "ethers/lib/utils";
import * as typ from "./SolidityTypes";

export interface UserOperation {
  sender: typ.address;
  nonce: typ.uint256;
  initCode: typ.bytes;
  callData: typ.bytes;
  callGasLimit: typ.uint256;
  verificationGasLimit: typ.uint256;
  preVerificationGas: typ.uint256;
  maxFeePerGas: typ.uint256;
  maxPriorityFeePerGas: typ.uint256;
  paymasterAndData: typ.bytes;
  signature: typ.bytes;
}

export function signatureMessage(message: string): string {
  const msg = Buffer.concat([
    Buffer.from("\x19Ethereum Signed Message:\n32", "ascii"),
    Buffer.from(arrayify(message)),
  ]);
  return keccak256(msg);
}
export function getUserOpHash(
  op: UserOperation,
  entryPoint: string,
  chainId: number
): string {
  const userOpHash = keccak256(packUserOp(op));
  const enc = defaultAbiCoder.encode(
    ["bytes32", "address", "uint256"],
    [userOpHash, entryPoint, chainId]
  );
  return keccak256(enc);
}

export function packUserOp(op: UserOperation): string {
  return defaultAbiCoder.encode(
    [
      "address",
      "uint256",
      "bytes32",
      "bytes32",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "bytes32",
    ],
    [
      op.sender,
      op.nonce,
      keccak256(op.initCode),
      keccak256(op.callData),
      op.callGasLimit,
      op.verificationGasLimit,
      op.preVerificationGas,
      op.maxFeePerGas,
      op.maxPriorityFeePerGas,
      keccak256(op.paymasterAndData),
    ]
  );
}
export const DefaultsForUserOp: UserOperation = {
  sender: ethers.constants.AddressZero,
  nonce: 0,
  initCode: "0x",
  callData: "0x",
  callGasLimit: 0,
  verificationGasLimit: 150000, // default verification gas. will add create2 cost (3200+200*length) if initCode exists
  preVerificationGas: 21000, // should also cover calldata cost.
  maxFeePerGas: 1,
  maxPriorityFeePerGas: 1e9,
  paymasterAndData: "0x",
  signature: "0x",
};

export function fillUserOpDefaults(
  op: Partial<UserOperation>,
  defaults = DefaultsForUserOp
): UserOperation {
  const partial: any = { ...op };
  for (const key in partial) {
    if (partial[key] == null) {
      delete partial[key];
    }
  }
  const filled = { ...defaults, ...partial };
  return filled;
}
