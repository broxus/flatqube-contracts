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
  header: ['pubkey', 'time', 'expire'],
  functions: [
    {
      name: 'constructor',
      inputs: [],
      outputs: [],
    },
    {
      name: 'sendGrams',
      inputs: [
        { name: 'dest', type: 'address' },
        { name: 'amount', type: 'uint64' },
      ],
      outputs: [],
    },
    {
      name: 'owner',
      inputs: [],
      outputs: [{ name: 'owner', type: 'uint256' }],
    },
  ],
  data: [{ key: 1, name: 'owner', type: 'uint256' }],
  events: [],
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
      .sendGrams({
        amount: value,
        dest: sendTo,
      })
      .sendExternal({ publicKey: this.keyPair.publicKey });
  }
}
