import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumberish, Contract, Signer, Wallet } from "ethers";
import hre, { ethers } from "hardhat";
import { fillUserOpDefaults, getUserOpHash } from "../src/UserOperation";

describe("MultisigAccount", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deploy() {
    // Contracts are deployed using the first signer/account by default
    const [bundler] = await ethers.getSigners();
    const EntryPoint = await ethers.getContractFactory("EntryPoint");
    const ep = await EntryPoint.deploy();
    await ep.deployed();
    console.log("==entrypoint addr=", ep.address);

    const Factory = await ethers.getContractFactory("MultisigAccountFactory");
    const factory = await Factory.deploy(ep.address);
    await factory.deployed();
    console.log("==factory addr=", factory.address);

    console.log(`==owner balance=`, await getEtherBalance(bundler.address));

    const users = await Promise.all(
      [1, 2, 3, 4, 5].map(async (salt) => {
        const user = await createUser(factory, salt, bundler);

        // initial balance = 2.0ETH
        await bundler.sendTransaction({
          from: bundler.address,
          to: user.walletContract.address,
          value: ethers.utils.parseEther("2"),
        });
        console.log(
          `==account${salt} balance=`,
          user.walletContract.address,
          await getEtherBalance(user.walletContract.address)
        );
        return user;
      })
    );
    console.log(`==owner balance=`, await getEtherBalance(bundler.address));
    return {
      ep,
      factory,
      users,
      bundler,
    };
  }

  // describe("Wallet Test", function () {
  //   it("owner", async function () {
  //     const { ep, factory, users, bundler } = await loadFixture(deploy);
  //     users.forEach(async (user) => {
  //       expect(user.account1.address).to.be.equals(
  //         await user.walletContract.owner()
  //       );
  //       expect(ep.address).to.be.equals(await user.walletContract.entryPoint());
  //     });
  //   });
  // });

  describe("Ether Transfer", function () {
    it("user1 -> user2", async function () {
      const { ep, factory, users, bundler } = await loadFixture(deploy);

      const userOp = await genSignedUserOperation(
        users[0],
        users[1].walletContract.address,
        ethers.utils.parseEther("0.1"),
        ethers.utils.parseEther("0.0000000000001"),
        ep
      );
      const userOpsTx = await ep.handleOps(
        [userOp],
        await bundler.getAddress()
      );
      const result = await userOpsTx.wait();
      console.log("==result=", result.events[1].args);
      console.log(result);
      users.map(async (user) => {
        console.log(
          user.walletContract.address,
          await getEtherBalance(user.walletContract.address)
        );
      });
      // expect(
      //   await ethers.provider.getBalance(users[0].walletContract.address)
      // ).to.be.equals(ethers.utils.parseEther("1.9").sub(result.gasUsed));
      // TODO: TXのガス消費以上に徴収されている？ロジックを確認

      expect(
        await ethers.provider.getBalance(users[1].walletContract.address)
      ).to.be.equals(ethers.utils.parseEther("2.1"));
    });
  });
});

async function genSignedUserOperation(
  user: { signer1: Wallet; signer2: Wallet; walletContract: Contract },
  to: string,
  value: BigNumberish,
  callGasLimit: BigNumberish,
  ep: Contract,
  option?: { nance: BigNumberish | undefined; initCode: string | undefined }
) {
  const userOp = fillUserOpDefaults({
    sender: user.walletContract.address,
    nonce: option?.nance,
    initCode: option?.initCode,
    callData: user.walletContract.interface.encodeFunctionData(
      "execute(address,uint,bytes)",
      [to, value, "0x"]
    ),
    callGasLimit: callGasLimit,
  });

  const network = await ethers.provider.getNetwork();
  const opHash = getUserOpHash(
    userOp,
    ep.address.toLowerCase(),
    network.chainId
  );
  const signature1 = await user.signer1.signMessage(
    ethers.utils.arrayify(opHash)
  );
  const signature2 = await user.signer2.signMessage(
    ethers.utils.arrayify(opHash)
  );
  console.log("==signature1,signature2=", signature1, signature2);
  const mergedSig = Buffer.concat([
    Buffer.from(signature1.substring(2), "hex"),
    Buffer.from(signature2.substring(2), "hex"),
  ]);
  userOp.signature = "0x" + mergedSig.toString("hex");
  console.log("==userOp.signature=", userOp.signature);
  return userOp;
}

async function createUser(
  factory: Contract,
  salt: number,
  bundlerSigner: Signer
) {
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

async function existsAddress(address: string) {
  const code = await ethers.provider.getCode(address);
  return code !== "0x";
}

function getAccount() {
  return ethers.Wallet.createRandom();
}

async function getEtherBalance(address: string) {
  const balance = await ethers.provider.getBalance(address);
  return ethers.utils.formatEther(balance);
}
