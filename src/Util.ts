import { Contract, Signer, Wallet } from "ethers";
import hre, { ethers } from "hardhat";

export type MultisigWallet = {
  signer1: Wallet;
  signer2: Wallet;
  walletContract: Contract;
};

export async function createWallet(
  factory: Contract,
  salt: number,
  bundlerSigner: Signer
): Promise<MultisigWallet> {
  const signer1 = getAccount();
  const signer2 = getAccount();
  const walletAddress = await factory.getAddress(
    signer1.address,
    signer2.address,
    salt
  );

  const artifact = await hre.deployments.getArtifact("MultisigAccount");
  const walletContract = new ethers.Contract(
    walletAddress,
    artifact.abi,
    bundlerSigner
  );

  if (!(await existsAddress(walletAddress))) {
    const res = await factory.createAccount(
      await signer1.getAddress(),
      await signer2.getAddress(),
      salt
    );
    console.debug("==account created!! tx=", res.hash);
  }
  return { signer1, signer2, walletContract };
}

export async function existsAddress(address: string): Promise<boolean> {
  const code = await ethers.provider.getCode(address);
  return code !== "0x";
}

export function getAccount(): Wallet {
  return ethers.Wallet.createRandom();
}

export async function getEtherBalance(address: string): Promise<string> {
  const balance = await ethers.provider.getBalance(address);
  return ethers.utils.formatEther(balance);
}
