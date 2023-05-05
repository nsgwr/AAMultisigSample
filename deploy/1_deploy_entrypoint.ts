import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const deployEntryPoint: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const provider = ethers.provider;
  const from = await provider.getSigner().getAddress();

  console.log("==from address=", from);
  console.log(
    "==from balance=",
    ethers.utils.formatEther(await provider.getBalance(from))
  );
  const ret = await hre.deployments.deploy("EntryPoint", {
    from,
    args: [],
    gasLimit: 6e6,
    deterministicDeployment: true,
  });
  console.log("==entrypoint addr=", ret.address);

  return;
};

export default deployEntryPoint;
