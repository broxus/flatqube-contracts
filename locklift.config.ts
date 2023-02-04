import { LockliftConfig } from 'locklift';
import { GiverWallet, SimpleGiver, TestnetGiver } from "./giverSettings";
import { FactorySource } from './build/factorySource';

declare global {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const locklift: import('locklift').Locklift<FactorySource>;
}

const LOCAL_NETWORK_ENDPOINT = 'http://localhost:80/graphql';

// const LOCAL_NETWORK_ENDPOINT =
//   'https://evernode-no-limits.fairyfromalfeya.com/graphql';

const config: LockliftConfig = {
  compiler: {
    version: "0.62.0",
    externalContracts: {
      'precompiled': [
          'DexPlatform'
      ],
      'node_modules/tip3/build': [
        'TokenRootUpgradeable',
        'TokenWalletUpgradeable',
        'TokenWalletPlatform',
      ],
      'node_modules/ton-wton/everscale/build' : []
    },
  },
  linker: { version: '0.15.48' },
  networks: {
    local: {
      connection: {
        id: 1337,
        group: 'localnet',
        type: 'graphql',
        data: {
          endpoints: [LOCAL_NETWORK_ENDPOINT],
          latencyDetectionInterval: 1000,
          local: true,
        },
      },
      giver: {
        giverFactory: (ever, keyPair, address) => new SimpleGiver(ever, keyPair, address),
        address: '0:ece57bcc6c530283becbbd8a3b24d3c5987cdddc3c8b7b33be6e4a6312490415',
        key: '172af540e43a524763dd53b26a066d472a97c4de37d5498170564510608250c3',
      },
      tracing: { endpoint: LOCAL_NETWORK_ENDPOINT },
      keys: {
        phrase: 'action inject penalty envelope rabbit element slim tornado dinner pizza off blood',
        amount: 20,
      },
    },
    test: {
      // Specify connection settings for https://github.com/broxus/everscale-standalone-client/
      connection: {
        group: "testnet",
        // @ts-ignore
        type: "graphql",
        data: {
          // @ts-ignore
          endpoints: [process.env.TESTNET_GQL_ENDPOINT],
          latencyDetectionInterval: 1000,
          local: false,
        },
      },
      // This giver is default local-node giverV2
      giver: {
        // Check if you need provide custom giver
        giverFactory: process.env.TESTNET_GIVER_TYPE == "Wallet" ?
            (ever, keyPair, address) => new GiverWallet(ever, keyPair, address) :
            (ever, keyPair, address) => new TestnetGiver(ever, keyPair, address),
        address: process.env.TESTNET_GIVER_ADDRESS ?? "",
        phrase: process.env.TESTNET_GIVER_SEED ?? "",
        accountId: 0
      },
      tracing: {
        endpoint: process.env.TESTNET_GQL_ENDPOINT ?? ""
      },

      keys: {
        phrase: process.env.TESTNET_SEED_PHRASE ?? "",
        amount: 20
      },
    },
    main: {
      connection: "mainnetJrpc",
      giver: {
        // Mainnet giver has the same abi as testnet one
        giverFactory: process.env.MAIN_GIVER_TYPE == "Wallet" ?
            (ever, keyPair, address) => new GiverWallet(ever, keyPair, address) :
            (ever, keyPair, address) => new TestnetGiver(ever, keyPair, address),
        address: process.env.MAIN_GIVER_ADDRESS ?? "",
        phrase: process.env.MAIN_GIVER_SEED ?? "",
        accountId: 0
      },
      tracing: {
        endpoint: process.env.MAIN_GQL_ENDPOINT ?? ""
      },
      keys: {
        phrase: process.env.MAIN_SEED_PHRASE ?? "",
        amount: 20
      }
    },
    prod: {
      connection: "mainnetJrpc",
      giver: {
        // Mainnet giver has the same abi as testnet one
        giverFactory: (ever, keyPair, address) => new TestnetGiver(ever, keyPair, address),
        address: "0:3bcef54ea5fe3e68ac31b17799cdea8b7cffd4da75b0b1a70b93a18b5c87f723",
        key: process.env.MAIN_GIVER_KEY ?? ""
      },
      tracing: {
        endpoint: process.env.MAIN_GQL_ENDPOINT ?? ""
      },
      keys: {
        phrase: process.env.MAIN_SEED_PHRASE ?? "",
        amount: 500
      }
    }
  },
  mocha: { timeout: 2000000 },
};

export default config;
