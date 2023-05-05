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
      [1, 2, 3, 4, 5].map(async (userId) => {
        const user = await createUser(factory, userId, bundler);

        // initial balance = 2.0ETH
        await bundler.sendTransaction({
          from: bundler.address,
          to: user.walletContract.address,
          value: ethers.utils.parseEther("100"),
        });
        console.log(
          `==account${userId} balance=`,
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

  describe("Wallet Test", function () {
    it("owner", async function () {
      const { ep, factory, users, bundler } = await loadFixture(deploy);
      users.forEach(async (user) => {
        expect(user.account.address).to.be.equals(
          await user.walletContract.owner()
        );
        expect(ep.address).to.be.equals(await user.walletContract.entryPoint());
      });
    });
  });

  describe("Ether Transfer", function () {
    it("user1 -> user2", async function () {
      const { ep, factory, users, bundler } = await loadFixture(deploy);

      const userOp = await genSignedUserOperation(
        users[0],
        users[1].walletContract.address,
        ethers.utils.parseEther("0.12"),
        ep
      );
      const userOpsTx = await ep.handleOps(
        [userOp],
        await bundler.getAddress()
      );
      const result = await userOpsTx.wait();
      console.log("==result=", result.events[1].args);
      users.map(async (user) => {
        console.log(
          user.walletContract.address,
          await getEtherBalance(user.walletContract.address)
        );
      });
      expect(
        await getEtherBalance(users[0].walletContract.address)
      ).to.be.equals("1.88");
    });
  });
});

async function genSignedUserOperation(
  user: { account: Wallet; walletContract: Contract },
  to: string,
  value: BigNumberish,
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
  });

  const network = await ethers.provider.getNetwork();
  const opHash = getUserOpHash(
    userOp,
    ep.address.toLowerCase(),
    network.chainId
  );
  const signature = await user.account.signMessage(
    ethers.utils.arrayify(opHash)
  );
  userOp.signature = signature;
  return userOp;
}

async function createUser(factory: Contract, userId: number, signer: Signer) {
  const account = getAccount(userId);
  const walletAddress = await factory.getAddress(account.address, userId);

  const artifact = await hre.deployments.getArtifact("MultisigAccount");
  const walletContract = new ethers.Contract(
    walletAddress,
    artifact.abi,
    signer
  );

  if (!(await existsAddress(walletAddress))) {
    const res = await factory.createAccount(await account.getAddress(), userId);
    console.debug("==account created!! tx=", res.hash);
  }
  return { account, walletContract };
}

async function existsAddress(address: string) {
  const code = await ethers.provider.getCode(address);
  return code !== "0x";
}

function getAccount(path: number) {
  return ethers.Wallet.fromMnemonic(
    process.env.MNEMONIC || "",
    `m/44'/60'/0'/0/${path}`
  );
}

async function getEtherBalance(address: string) {
  const balance = await ethers.provider.getBalance(address);
  return ethers.utils.formatEther(balance);
}
