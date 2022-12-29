import {
  Address,
  Contract,
  Giver,
  ProviderRpcClient,
  Transaction,
} from 'locklift';
import { Ed25519KeyPair } from 'everscale-standalone-client';

const abi = {
  'ABI version': 2,
  header: ['time', 'expire'],
  functions: [
    {
      name: 'upgrade',
      inputs: [{ name: 'newcode', type: 'cell' }],
      outputs: [],
    },
    {
      name: 'sendTransaction',
      inputs: [
        { name: 'dest', type: 'address' },
        { name: 'value', type: 'uint128' },
        { name: 'bounce', type: 'bool' },
      ],
      outputs: [],
    },
    {
      name: 'getMessages',
      inputs: [],
      outputs: [
        {
          components: [
            { name: 'hash', type: 'uint256' },
            { name: 'expireAt', type: 'uint64' },
          ],
          name: 'messages',
          type: 'tuple[]',
        },
      ],
    },
    {
      name: 'constructor',
      inputs: [],
      outputs: [],
    },
  ],
  events: [],
} as const;

const mainnetAbi = {
  'ABI version': 2,
  version: '2.2',
  header: ['pubkey', 'time', 'expire'],
  functions: [
    {
      name: 'constructor',
      inputs: [],
      outputs: [],
    },
    {
      name: 'sendTransaction',
      inputs: [
        { name: '_dest', type: 'address' },
        { name: '_value', type: 'uint128' },
        { name: '_bounce', type: 'bool' },
      ],
      outputs: [],
    },
    {
      name: 'getMessages',
      inputs: [],
      outputs: [
        {
          components: [
            { name: 'hash', type: 'uint256' },
            { name: 'expireAt', type: 'uint32' },
          ],
          name: 'value0',
          type: 'tuple[]',
        },
      ],
    },
  ],
  data: [],
  events: [],
  fields: [
    { name: '_pubkey', type: 'uint256' },
    { name: '_constructorFlag', type: 'bool' },
    { name: '_messages', type: 'map(uint256,uint32)' },
  ],
} as const;

export class SimpleGiver implements Giver {
  public contract: Contract<typeof abi>;

  constructor(
    client: ProviderRpcClient,
    private readonly keyPair: Ed25519KeyPair,
    address: string,
  ) {
    this.contract = new client.Contract(abi, new Address(address));
  }

  public async sendTo(
    sendTo: Address,
    value: string,
  ): Promise<{ transaction: Transaction; output?: Record<string, unknown> }> {
    return this.contract.methods
      .sendTransaction({
        value: value,
        dest: sendTo,
        bounce: false,
      })
      .sendExternal({ publicKey: this.keyPair.publicKey });
  }
}

export class MainnetGiver implements Giver {
  public contract: Contract<typeof mainnetAbi>;

  constructor(
    client: ProviderRpcClient,
    private readonly keyPair: Ed25519KeyPair,
    address: string,
  ) {
    this.contract = new client.Contract(mainnetAbi, new Address(address));
  }

  public async sendTo(
    sendTo: Address,
    value: string,
  ): Promise<{ transaction: Transaction; output?: Record<string, unknown> }> {
    return this.contract.methods
      .sendTransaction({
        _value: value,
        _dest: sendTo,
        _bounce: false,
      })
      .sendExternal({ publicKey: this.keyPair.publicKey });
  }
}
