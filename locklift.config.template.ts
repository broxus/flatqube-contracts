import { LockliftConfig } from 'locklift';
import {GiverWallet, TestnetGiver, SimpleGiver} from "./giverSettings";

declare global {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const locklift: import('locklift').Locklift<FactorySource>;
}

const LOCAL_NETWORK_ENDPOINT = 'http://0.0.0.0/graphql';

const config: LockliftConfig = {
  compiler: {
    version: "0.62.0",
    externalContracts: {
      'precompiled': [
          'DexPlatform',
          'TokenWalletPlatform'
      ],
      'node_modules/tip3/build': [
        'TokenRootUpgradeable',
        'TokenWalletUpgradeable',
        'TokenWalletPlatform',
      ],
      'node_modules/ever-wever/everscale/build' : []
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
        giverFactory: (ever, keyPair, address) =>
          new GiverWallet(ever, keyPair, address),
        address: '0:ece57bcc6c530283becbbd8a3b24d3c5987cdddc3c8b7b33be6e4a6312490415',
        key: '172af540e43a524763dd53b26a066d472a97c4de37d5498170564510608250c3',
      },
      tracing: { endpoint: LOCAL_NETWORK_ENDPOINT },
      keys: {
        phrase:
          'action inject penalty envelope rabbit element slim tornado dinner pizza off blood',
        amount: 20,
      },
    },
    dev: {
      connection: {
        group: "testnet",
        // @ts-ignore
        type: "graphql",
        data: {
          // @ts-ignore
          // for endpoints, example from evercloud.dev, format: https://devnet.evercloud.dev/${key}/graphql
          endpoints: [""],
          latencyDetectionInterval: 1000,
          local: false,
        },
      },
      giver: {
        giverFactory: (ever, keyPair, address) => new TestnetGiver(ever, keyPair, address),
        address: "",
        key: "",
      },
      keys: {
        phrase:"action inject penalty envelope rabbit element slim tornado dinner pizza off blood",
        amount: 20
      }
    },
    mainnet: {
      connection: {
        group: 'mainnet',
        // @ts-ignore
        type: 'graphql',
        data: {
          // @ts-ignore
          // for endpoints, example from evercloud.dev, format: https://mainnet.evercloud.dev/${key}/graphql
          endpoints: [''],
          latencyDetectionInterval: 1000,
          local: false,
        },
      },
      giver: {
        giverFactory: (ever, keyPair, address) => new GiverWallet(ever, keyPair, address),
        address: '',
        phrase: '',
        accountId: 0
      },
      keys: {
        phrase: "action inject penalty envelope rabbit element slim tornado dinner pizza off blood",
        amount: 20,
      },
    }
  },
  mocha: { timeout: 2000000 },
};

export default config;
