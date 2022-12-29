import { LockliftConfig } from 'locklift';
import { FactorySource } from './build/factorySource';
import { MainnetGiver, SimpleGiver } from './giver';

declare global {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const locklift: import('locklift').Locklift<FactorySource>;
}

const LOCAL_NETWORK_ENDPOINT = 'http://localhost/graphql';

const MAINNET_NETWORK_ENDPOINT =
  'https://mainnet.evercloud.dev/9de6d46bd6454e6cac0b43aa7c7eaed6/graphql';

const DEVNET_NETWORK_ENDPOINT =
  'https://devnet.evercloud.dev/9de6d46bd6454e6cac0b43aa7c7eaed6/graphql';

const config: LockliftConfig = {
  compiler: {
    version: '0.62.0',
    externalContracts: {
      precompiled: ['DexPlatform'],
      'node_modules/tip3/build': [
        'TokenRootUpgradeable',
        'TokenWalletUpgradeable',
        'TokenWalletPlatform',
      ],
      'node_modules/ever-wever/everscale/build': [],
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
          new SimpleGiver(ever, keyPair, address),
        address:
          '0:ece57bcc6c530283becbbd8a3b24d3c5987cdddc3c8b7b33be6e4a6312490415',
        key: '172af540e43a524763dd53b26a066d472a97c4de37d5498170564510608250c3',
      },
      tracing: { endpoint: LOCAL_NETWORK_ENDPOINT },
      keys: {
        phrase:
          'action inject penalty envelope rabbit element slim tornado dinner pizza off blood',
        amount: 20,
      },
    },
    mainnet: {
      connection: {
        id: 1,
        group: 'mainnet',
        type: 'graphql',
        data: {
          endpoints: [MAINNET_NETWORK_ENDPOINT],
          latencyDetectionInterval: 60000,
          local: false,
        },
      },
      giver: {
        giverFactory: (ever, keyPair, address) =>
          new MainnetGiver(ever, keyPair, address),
        address:
          '0:45aec00fe709bacbba429b54124e25b6e431781446faa6ee17f11d0541fd4dd8',
        key: '131c31cff6f12e6730fb7c0631460fe0955ed05820a723cc76b7dd1399e0f514',
      },
      tracing: { endpoint: MAINNET_NETWORK_ENDPOINT },
      keys: {
        phrase:
          'ancient head noise skate price battle inch cause sugar bridge junior umbrella',
        amount: 20,
      },
    },
    devnet: {
      connection: {
        id: 3,
        group: 'devnet',
        type: 'graphql',
        data: {
          endpoints: [DEVNET_NETWORK_ENDPOINT],
          latencyDetectionInterval: 60000,
          local: false,
        },
      },
      giver: {
        giverFactory: (ever, keyPair, address) =>
          new MainnetGiver(ever, keyPair, address),
        address:
          '0:45aec00fe709bacbba429b54124e25b6e431781446faa6ee17f11d0541fd4dd8',
        key: '131c31cff6f12e6730fb7c0631460fe0955ed05820a723cc76b7dd1399e0f514',
      },
      tracing: { endpoint: DEVNET_NETWORK_ENDPOINT },
      keys: {
        phrase:
          'ancient head noise skate price battle inch cause sugar bridge junior umbrella',
        amount: 20,
      },
    },
  },
  mocha: { timeout: 2000000 },
};

export default config;
