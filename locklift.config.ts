import "@broxus/locklift-verifier";
import "@broxus/locklift-deploy";

import { lockliftChai, LockliftConfig } from "locklift";
import { Deployments } from "@broxus/locklift-deploy";
import * as dotenv from "dotenv";

import { FactorySource } from "./build/factorySource";

dotenv.config();

import chai from "chai";

chai.use(lockliftChai);

declare global {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const locklift: import("locklift").Locklift<FactorySource>;
}

declare module "locklift" {
  //@ts-ignore
  export interface Locklift {
    deployments: Deployments<FactorySource>;
  }
}

const config: LockliftConfig = {
  compiler: {
    version: "0.62.0",
    externalContracts: {
      precompiled: [
        "DexPlatform",
        "DexGasValuesPrev",
        "DexRootPrev",
        "DexVaultPrev",
        "DexTokenVaultPrev",
        "DexPairPrev",
        "DexStablePairPrev",
        "DexStablePoolPrev",
        "DexAccountPrev",
      ],
      "node_modules/tip3/build": [
        "TokenRootUpgradeable",
        "TokenWalletUpgradeable",
        "TokenWalletPlatform",
      ],
      "node_modules/ever-wever/everscale/build": [],
      "node_modules/@broxus/wever/build": [
        "VaultTokenRoot_V1",
        "VaultTokenWallet_V1",
      ],
    },
  },
  linker: { version: "0.16.5" },
  verifier: {
    verifierVersion: "latest", // contract verifier binary, see https://github.com/broxus/everscan-verify/releases
    apiKey: process.env.EVERSCAN_API_KEY!,
    secretKey: process.env.EVERSCAN_SECRET_KEY!,
    // license: "AGPL-3.0-or-later", <- this is default value and can be overrided
  },
  networks: {
    local: {
      deploy: ["common/", "local/"],
      connection: {
        id: 1337,
        group: "localnet",
        type: "graphql",
        data: {
          endpoints: [process.env.LOCAL_NETWORK_ENDPOINT!],
          latencyDetectionInterval: 1000,
          local: true,
        },
      },
      giver: {
        address: process.env.LOCAL_GIVER_ADDRESS!,
        key: process.env.LOCAL_GIVER_KEY!,
      },
      keys: {
        phrase: process.env.LOCAL_PHRASE,
        amount: 20,
      },
    },
    test: {
      deploy: ["common/", "testnet/"],
      // Specify connection settings for https://github.com/broxus/everscale-standalone-client/
      connection: {
        id: 0,
        group: "testnet",
        type: "graphql",
        data: {
          endpoints: [process.env.TESTNET_GQL_ENDPOINT!],
          latencyDetectionInterval: 1000,
          local: false,
        },
      },
      // This giver is default local-node giverV2
      giver: {
        address: process.env.TESTNET_GIVER_ADDRESS!,
        phrase: process.env.TESTNET_GIVER_SEED!,
        accountId: 0,
      },
      tracing: {
        endpoint: process.env.TESTNET_GQL_ENDPOINT!,
      },
      keys: {
        phrase: process.env.TESTNET_SEED_PHRASE!,
        amount: 20,
      },
    },
    main: {
      deploy: ["common/", "main/"],
      connection: {
        id: 1,
        type: "jrpc",
        group: "main",
        data: {
          endpoint: process.env.MAINNET_RPC_NETWORK_ENDPOINT!,
        },
      },
      giver: {
        address: process.env.MAINNET_GIVER_ADDRESS!,
        key: process.env.MAINNET_GIVER_KEY!,
      },
      tracing: { endpoint: process.env.MAINNET_GQL_NETWORK_ENDPOINT! },
      keys: {
        phrase: process.env.MAINNET_PHRASE,
        amount: 20,
      },
    },
    venom_testnet: {
      deploy: ["common/", "venom_testnet/"],
      connection: {
        id: 1000,
        type: "jrpc",
        group: "dev",
        data: {
          endpoint: process.env.VENOM_TESTNET_RPC_NETWORK_ENDPOINT!,
        },
      },
      giver: {
        address: process.env.VENOM_TESTNET_GIVER_ADDRESS!,
        phrase: process.env.VENOM_TESTNET_GIVER_PHRASE!,
        accountId: 0,
      },
      tracing: {
        endpoint: process.env.VENOM_TESTNET_GQL_NETWORK_ENDPOINT!,
      },
      keys: {
        phrase: process.env.VENOM_TESTNET_PHRASE,
        amount: 100,
      },
    },
    locklift: {
      deploy: ["common/", "local/"],
      giver: {
        address: process.env.LOCAL_GIVER_ADDRESS!,
        key: process.env.LOCAL_GIVER_KEY!,
      },
      connection: {
        id: 1001,
        type: "proxy",
        // @ts-ignore
        data: {}
      },
      keys: {
        phrase: process.env.LOCAL_PHRASE,
        amount: 20,
      },
    }
  },
  mocha: { timeout: 2000000 },
};

export default config;
