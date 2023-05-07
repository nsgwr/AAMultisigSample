import { Contract, Signer } from "ethers";
import { ethers } from "hardhat";
import { ABI, DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const deployMultisigAccountFactory: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const signer = ethers.provider.getSigner();
  const signerAddress = await signer.getAddress();
  // await signer.sendTransaction({
  //   to: "0xaa2211F518865F9c86D68BF731F0FBD882fBCa3c",
  //   value: ethers.utils.parseEther("0.37"),
  // });

  const entrypoint = await hre.deployments.get("EntryPoint");
  const ret = await hre.deployments.deploy("MultisigAccountFactory", {
    from: signerAddress,
    args: [entrypoint.address],
    gasLimit: 6e6,
    log: true,
    deterministicDeployment: true,
  });
  console.log("==MultisigAccountFactory addr=", ret.address);
  const MultisigAccountArtifact = await hre.deployments.getArtifact(
    "MultisigAccount"
  );
  // console.log("==MultisigAccountContract=", MultisigAccountContract.abi);

  const factory = new ethers.Contract(ret.address, ret.abi, signer);

  const { user, walletContract } = await createUser(
    factory,
    MultisigAccountArtifact.abi,
    signer,
    1
  );
  // const tx: TransactionRequest = {
  //   value: ethers.utils.parseEther("0.00001"),
  //   to: walletContract.address,
  //   from: await signer.getAddress(),
  // };
  // const sendtx = await signer.sendTransaction(tx);
  // console.log("==sendtx=", sendtx.hash);

  // console.log(
  //   "==walletContract balance=",
  //   ethers.utils.formatEther(
  //     await ethers.provider.getBalance(walletContract.address)
  //   )
  // );
  // const executeTx = await walletContract.execute(signerAddress, 10000, "0x");
  // console.log("==executeTx=", executeTx.hash);

  const userOp = [
    {
      sender: user.address,
      nonce: 1,
      initCode: "0x",
      callData: walletContract.interface.encodeFunctionData(
        "execute(address,uint,bytes)",
        [signerAddress, 10000, "0x"]
      ),
      callGasLimit: 20000,
      verificationGasLimit: 20000,
      preVerificationGas: 20000,
      maxFeePerGas: 20000,
      maxPriorityFeePerGas: 100,
      paymasterAndData: "0x",
      signature: "0x",
    },
  ];
  const ep = new ethers.Contract(entrypoint.address, entrypoint.abi, signer);
  console.log("==userOp=", userOp);
  const userOpsTx = await ep.handleOps(userOp, await signer.getAddress(), {
    gasLimit: 100000,
  });
  console.log("==userOpsTx=", userOpsTx);
  await userOpsTx.waitForTx();
  // const client = await Client.init(config.rpcUrl, config.entryPoint);
  // const builder = await MultisigAccount.init(
  //   config.signingKey,
  //   config.rpcUrl,
  //   config.entryPoint,
  //   config.simpleAccountFactory,
  //   undefined
  // );
  // const res = await client.sendUserOperation(
  //   builder.execute(signerAddress, 10000, "0x"),
  //   {
  //     onBuild: (op) => console.log("Signed UserOperation:", op),
  //   }
  // );
  // console.log(`UserOpHash: ${res.userOpHash}`);
  // console.log("Waiting for transaction...");
  // const ev = await res.wait();
  // console.log(`Transaction hash: ${ev?.transactionHash ?? null}`);
};

async function createUser(
  factory: Contract,
  abi: ABI,
  signer: Signer,
  userId: number
) {
  const user = getUser(userId);
  const walletAddress = await factory.getAddress(user.address, 1);
  const walletContract = new ethers.Contract(walletAddress, abi, signer);

  if (!(await existsAddress(factory, walletAddress))) {
    const res = await factory.createAccount(await signer.getAddress(), 3);
    console.log("==account created!! tx=", res.hash);
  }
  const events = await factory.queryFilter("MultisigAccountCreated");
  const addressess = events.map(
    (event) => factory.interface.parseLog(event).args[0]
  );
  console.log("==MultisigAccountFactory MultisigAccountCreated=", addressess);
  return { user, walletContract };
}

async function existsAddress(factory: Contract, address: string) {
  const code = await factory.provider.getCode(address);
  return code !== "0x";
}

function getUser(path: number) {
  return ethers.Wallet.fromMnemonic(
    process.env.MNEMONIC || "",
    `m/44'/60'/0'/0/${path}`
  );
}

export default deployMultisigAccountFactory;
