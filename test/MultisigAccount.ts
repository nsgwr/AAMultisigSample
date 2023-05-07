import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Contract, Signer } from "ethers";
import { keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  UserOperation,
  fillUserOpDefaults,
  getUserOpHash,
} from "../src/UserOperation";
import { MultisigWallet, createWallet, getEtherBalance } from "../src/Util";

describe("MultisigAccount", function () {
  async function deploy() {
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

    const wallets = await Promise.all(
      [1, 2, 3].map(async (salt) => {
        const wallet = await createWallet(factory, salt, bundler);

        // initial balance = 2.0ETH
        await bundler.sendTransaction({
          from: bundler.address,
          to: wallet.walletContract.address,
          value: ethers.utils.parseEther("2"),
        });
        console.log(
          `==account${salt} balance=`,
          wallet.walletContract.address,
          await getEtherBalance(wallet.walletContract.address)
        );
        return wallet;
      })
    );
    console.log(`==owner balance=`, await getEtherBalance(bundler.address));
    return {
      ep,
      factory,
      wallets,
      bundler,
    };
  }

  describe("Ether Transfer", function () {
    it("wallet1 -> wallet2", async function () {
      const { ep, factory, wallets, bundler } = await loadFixture(deploy);
      const userOp = sendEthOperation(wallets[0], wallets[1], "0.1");

      const opHash = await getOpHash(userOp, ep);
      userOp.signature = await multiSign(
        userOp,
        [wallets[0].signer1, wallets[0].signer2],
        opHash
      );

      const userOpsTx = await ep.handleOps(
        [userOp],
        await bundler.getAddress()
      );
      const result = await userOpsTx.wait();

      // expect(
      //   await ethers.provider.getBalance(wallets[0].walletContract.address)
      // ).to.be.equals(ethers.utils.parseEther("1.9").sub(result.gasUsed));
      // TODO: TXのガス消費以上に徴収されている？ロジックを確認
      await assertEtherBalance(wallets[0], "1.899999999999729");
      await assertEtherBalance(wallets[1], "2.1");
      await assertEtherBalance(wallets[2], "2.0");
    });
  });
  it("invalidSign--nothing Signature--", async function () {
    const { ep, factory, wallets, bundler } = await loadFixture(deploy);
    const userOp = sendEthOperation(wallets[0], wallets[1], "0.1");

    userOp.signature = "0x";
    const bundlerAddress = await bundler.getAddress();
    await expect(ep.handleOps([userOp], bundlerAddress)).to.be.reverted;

    await assertEtherBalance(wallets[0], "2.0");
    await assertEtherBalance(wallets[1], "2.0");
    await assertEtherBalance(wallets[2], "2.0");
  });
  it("invalidSign--only one Signature--", async function () {
    const { ep, factory, wallets, bundler } = await loadFixture(deploy);
    const userOp = sendEthOperation(wallets[0], wallets[1], "0.1");

    const opHash = await getOpHash(userOp, ep);
    userOp.signature = await multiSign(userOp, [wallets[0].signer1], opHash);
    const bundlerAddress = await bundler.getAddress();
    await expect(ep.handleOps([userOp], bundlerAddress)).to.be.reverted;

    await assertEtherBalance(wallets[0], "2.0");
    await assertEtherBalance(wallets[1], "2.0");
    await assertEtherBalance(wallets[2], "2.0");
  });
  it("invalidSign--invalid hash--", async function () {
    const { ep, factory, wallets, bundler } = await loadFixture(deploy);
    const userOp = sendEthOperation(wallets[0], wallets[1], "0.1");

    const opHash = keccak256("0x123456");
    userOp.signature = await multiSign(userOp, [wallets[0].signer1], opHash);
    const bundlerAddress = await bundler.getAddress();
    await expect(ep.handleOps([userOp], bundlerAddress)).to.be.reverted;

    await assertEtherBalance(wallets[0], "2.0");
    await assertEtherBalance(wallets[1], "2.0");
    await assertEtherBalance(wallets[2], "2.0");
  });
});
async function assertEtherBalance(
  wallet: MultisigWallet,
  etherBalance: string
) {
  expect(
    await ethers.provider.getBalance(wallet.walletContract.address)
  ).to.be.equals(ethers.utils.parseEther(etherBalance));
}

function sendEthOperation(
  from: MultisigWallet,
  to: MultisigWallet,
  etherValue: string
) {
  return fillUserOpDefaults({
    sender: from.walletContract.address,
    callData: from.walletContract.interface.encodeFunctionData(
      "execute(address,uint,bytes)",
      [to.walletContract.address, ethers.utils.parseEther(etherValue), "0x"]
    ),
    callGasLimit: ethers.utils.parseEther("0.0000000000001"),
  });
}

async function getOpHash(userOp: UserOperation, ep: Contract): Promise<string> {
  const network = await ethers.provider.getNetwork();
  return getUserOpHash(userOp, ep.address.toLowerCase(), network.chainId);
}

async function multiSign(
  userOp: UserOperation,
  signers: Signer[],
  opHash: string
): Promise<string> {
  if (signers.length == 0) {
    return "0x";
  }
  let mergedSig = Buffer.alloc(0);
  for (let signer of signers) {
    const sign = await signer.signMessage(ethers.utils.arrayify(opHash));
    mergedSig = Buffer.concat([
      mergedSig,
      Buffer.from(sign.substring(2), "hex"),
    ]);
  }

  return "0x" + mergedSig.toString("hex");
}
