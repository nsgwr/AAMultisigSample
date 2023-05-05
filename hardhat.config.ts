import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-deploy";
import { HardhatUserConfig } from "hardhat/config";

import "solidity-coverage";

import dotenv from "dotenv";
import * as fs from "fs";
dotenv.config();

const mnemonicFileName =
  process.env.MNEMONIC_FILE ??
  `${process.env.HOME}/.secret/testnet-mnemonic.txt`;
let mnemonic =
  process.env.MNEMONIC ||
  "hoge hoge hoge hoge hoge hoge hoge hoge hoge hoge hoge hoge";
if (fs.existsSync(mnemonicFileName)) {
  mnemonic = fs.readFileSync(mnemonicFileName, "ascii");
}

function getNetwork1(url: string): {
  url: string;
  accounts: { mnemonic: string };
} {
  return {
    url,
    accounts: { mnemonic },
  };
}

function getNetwork(name: string): {
  url: string;
  accounts: { mnemonic: string };
} {
  return getNetwork1(
    `https://${name}.g.alchemy.com/v2/${process.env.ALCHEMY_APIKEY}`
  );
  // return https://polygon-mumbai.g.alchemy.com/v2/SbQkCjN2CwBogDgyPzHWNGUNFyIE8ELc
}

const optimizedComilerSettings = {
  version: "0.8.17",
  settings: {
    optimizer: { enabled: true, runs: 1000000 },
    viaIR: true,
  },
};
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.18",
        settings: {
          optimizer: { enabled: true, runs: 1000000 },
        },
      },
    ],
  },
  networks: {
    dev: { url: "http://localhost:8545" },
    // github action starts localgeth service, for gas calculations
    localgeth: { url: "http://localgeth:8545" },
    goerli: getNetwork("goerli"),
    sepolia: getNetwork("sepolia"),
    proxy: getNetwork1("http://localhost:8545"),
    munbai: getNetwork("polygon-mumbai"),
  },
  mocha: {
    timeout: 10000,
  },
  etherscan: {
    apiKey: { polygonMumbai: "MNZ1S3J19F3RYUH4HT7T9W3SSFQTGFN5EV" },
    customChains: [
      {
        network: "polygonMumbai",
        chainId: 8001,
        urls: {
          apiURL: "https://api-testnet.polygonscan.com/",
          browserURL: "https://polygonscan.com/",
        },
      },
    ],
  },
};

export default config;
