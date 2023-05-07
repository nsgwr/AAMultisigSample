import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createWallet } from "../src/Util";

const deployMultisigAccountFactory: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const signer = ethers.provider.getSigner();
  const signerAddress = await signer.getAddress();

  const entrypoint = await hre.deployments.get("EntryPoint");
  const ret = await hre.deployments.deploy("MultisigAccountFactory", {
    from: signerAddress,
    args: [entrypoint.address],
    gasLimit: 6e6,
    log: true,
    deterministicDeployment: true,
  });
  console.log("==MultisigAccountFactory addr=", ret.address);

  const factory = new ethers.Contract(ret.address, ret.abi, signer);

  const wallet = await createWallet(factory, 1, signer);
  console.log("==wallet contract=", wallet.walletContract.address);
};

export default deployMultisigAccountFactory;
