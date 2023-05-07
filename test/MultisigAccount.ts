import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumberish, Contract, Wallet } from "ethers";
import { ethers } from "hardhat";
import { fillUserOpDefaults, getUserOpHash } from "../src/UserOperation";
import { createUser, getEtherBalance } from "../src/Util";

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
      users.forEach(async (user, index) => {
        console.log(
          `==account${index + 1} balance=`,
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
  const mergedSig = Buffer.concat([
    Buffer.from(signature1.substring(2), "hex"),
    Buffer.from(signature2.substring(2), "hex"),
  ]);
  userOp.signature = "0x" + mergedSig.toString("hex");
  return userOp;
}
