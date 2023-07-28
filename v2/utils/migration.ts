import fs, { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Address, WalletTypes, Transaction, Contract } from 'locklift';
import { FactorySource } from '../../build/factorySource';

export class Migration {
  migrationLog: Record<string, string>;
  private readonly logPath: string;

  constructor(logPath = 'locklift.migration.json') {
    this.logPath = join(process.cwd(), logPath);
    this.migrationLog = {};
    this._loadMigrationLog();
  }

  reset() {
    this.migrationLog = {};
    this._saveMigrationLog();
  }

  private _loadMigrationLog = () => {
    if (existsSync(this.logPath)) {
      const data = readFileSync(this.logPath, 'utf8');
      if (data) this.migrationLog = JSON.parse(data);
    }
  };

  private _saveMigrationLog = () => {
    writeFileSync(this.logPath, JSON.stringify(this.migrationLog, null, 2));
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public loadAccount = async (name: string, account: string) => {
    this._loadMigrationLog();

    if (this.migrationLog[name] !== undefined) {
      return locklift.factory.accounts.addExistingAccount({
        address: new Address(this.migrationLog[name]),
        type: WalletTypes.EverWallet,
      });
    } else {
      throw new Error(`Contract ${name} not found in the migration`);
    }
  };

  public exists = (name: string) => {
    return this.migrationLog[name] !== undefined;
  };

  public loadContract = <ContractName extends keyof FactorySource>(
    contract: ContractName,
    name: string,
  ): Contract<FactorySource[ContractName]> => {
    this._loadMigrationLog();

    if (this.migrationLog[name] !== undefined) {
      return locklift.factory.getDeployedContract(
        contract,
        new Address(this.migrationLog[name]),
      );
    } else {
      throw new Error(`Contract ${name} not found in the migration`);
    }
  };

  public store = <T extends { address: Address }>(
    contract: T,
    name: string,
  ): void => {
    this.migrationLog = {
      ...this.migrationLog,
      [name]: contract.address.toString(),
    };

    this._saveMigrationLog();
  };

  backup() {
    fs.writeFileSync(
      'migration-log-' + new Date().toISOString() + '.json',
      JSON.stringify(this.migrationLog, null, 2),
    );
  }
}

export const displayTx = (_tx: Transaction) => {
  console.log(`txId: ${_tx.id.hash ? _tx.id.hash : _tx.id}`);
};

export const Constants: {
  tokens: Record<string, any>;
  LP_DECIMALS: number;
  TESTS_TIMEOUT: number;
} = {
  tokens: {
    foo: {
      name: 'Foo',
      symbol: 'Foo',
      decimals: 6,
      upgradeable: true,
    },
    bar: {
      name: 'Bar',
      symbol: 'Bar',
      decimals: 6,
      upgradeable: true,
    },
    qwe: {
      name: 'QWE',
      symbol: 'Qwe',
      decimals: 18,
      upgradeable: true,
    },
    tst: {
      name: 'Tst',
      symbol: 'Tst',
      decimals: 18,
      upgradeable: true,
    },
    coin: {
      name: 'Coin',
      symbol: 'Coin',
      decimals: 9,
      upgradeable: true,
    },
    wever: {
      name: 'Wrapped EVER',
      symbol: 'WEVER',
      decimals: 9,
      upgradeable: true,
    },
  },
  LP_DECIMALS: 9,

  TESTS_TIMEOUT: 120000,
};

for (let i = 0; i < 40; i++) {
  Constants.tokens['gen' + i] = {
    name: 'Gen' + i,
    symbol: 'GEN' + i,
    decimals: 9,
    upgradeable: true,
  };
}

export const EMPTY_TVM_CELL = 'te6ccgEBAQEAAgAAAA==';
