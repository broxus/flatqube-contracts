// wallets consts
export const ACCOUNTS_N = 3;
export const ACCOUNT_WALLET_AMOUNT = 100;
export const EVER_WALLET_AMOUNT = 2000;
export const WEVER_WALLET_AMOUNT = 1500;
export const WEVER_DEXPAIR_AMOUNT = 200;

// tokens consts
export const TOKENS_N = 2;
export const TOKENS_DECIMALS = [6, 9, 18];

export interface ITokenItem {
  name: string;
  symbol: string;
  decimals: number;
  upgradeable: boolean;
}

export interface ITokenConst {
  tokens: Record<string, ITokenItem>;
  LP_DECIMALS: number;
  TESTS_TIMEOUT: number;
}

export const Constants: ITokenConst = {
  tokens: {
    foo: {
      name: "Foo",
      symbol: "Foo",
      decimals: 6,
      upgradeable: true,
    },
    bar: {
      name: "Bar",
      symbol: "Bar",
      decimals: 6,
      upgradeable: true,
    },
    qwe: {
      name: "Qwe",
      symbol: "Qwe",
      decimals: 18,
      upgradeable: true,
    },
    tst: {
      name: "Tst",
      symbol: "Tst",
      decimals: 18,
      upgradeable: true,
    },
    coin: {
      name: "Coin",
      symbol: "Coin",
      decimals: 9,
      upgradeable: true,
    },
  },
  LP_DECIMALS: 9,
  TESTS_TIMEOUT: 120000,
};

for (let i = 0; i < 40; i++) {
  Constants.tokens["gen" + i] = {
    name: "Gen" + i,
    symbol: "GEN" + i,
    decimals: 9,
    upgradeable: true,
  };
}

export const EMPTY_TVM_CELL = "te6ccgEBAQEAAgAAAA==";
