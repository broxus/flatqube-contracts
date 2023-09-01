import { expect } from "chai";

import { Address, Contract, toNano, zeroAddress } from "locklift";
import {
  DexAccountAbi,
  DexPairAbi,
  DexRootAbi,
  DexStablePairAbi,
  DexStablePoolAbi,
} from "build/factorySource";
import { Account } from "everscale-standalone-client";
import { upgradePair, upgradePool } from "../../../utils/upgrade.utils";
import { depositLiquidity } from "../../../utils/wrappers";
import BigNumber from "bignumber.js";

interface IPoolData {
  root: string;
  vault: string;
  current_version: number;
  platform_code: string;
  lp_root: string;
  roots: string[];
  active: boolean;
  lp_wallet: string;
  token_wallets: string[];
  lp_supply: string;
  balances: string[];
  fee_params: any;
  pool_type: string;
}

const loadPoolData = async (
  pair:
    | Contract<DexPairAbi>
    | Contract<DexStablePairAbi>
    | Contract<DexStablePoolAbi>,
) => {
  const data = {} as IPoolData;

  data.pool_type = await pair.methods
    .getPoolType({ answerId: 0 })
    .call()
    .then(a => a.value0);

  data.root = await pair.methods
    .getRoot({ answerId: 0 })
    .call()
    .then(a => a.dex_root.toString());
  data.vault = await pair.methods
    .getVault({ answerId: 0 })
    .call()
    .then(a => a.value0.toString());

  data.current_version = await pair.methods
    .getVersion({ answerId: 0 })
    .call()
    .then(a => Number(a.version));
  data.platform_code = await pair.methods
    .platform_code()
    .call()
    .then(a => a.platform_code);

  data.active = await pair.methods
    .isActive({ answerId: 0 })
    .call()
    .then(a => a.value0);

  data.fee_params = await pair.methods
    .getFeeParams({ answerId: 0 })
    .call()
    .then(a => a.value0);

  const token_roots = await pair.methods.getTokenRoots({ answerId: 0 }).call();
  const token_wallets = await pair.methods
    .getTokenWallets({ answerId: 0 })
    .call();
  const balances = await pair.methods
    .getBalances({ answerId: 0 })
    .call()
    .then(a => a.value0);

  data.lp_root = token_roots.lp.toString();
  data.lp_wallet = token_wallets.lp.toString();
  data.lp_supply = balances.lp_supply.toString();

  if (data.pool_type === "3") {
    data.roots = token_roots.roots.map((root: Address) => root.toString());
    data.token_wallets = token_wallets.token_wallets.map((wallet: Address) =>
      wallet.toString(),
    );
    data.balances = balances.balances;
  } else {
    data.roots = [token_roots.left.toString(), token_roots.right.toString()];
    data.token_wallets = [
      token_wallets.left.toString(),
      token_wallets.right.toString(),
    ];
    data.balances = [
      balances.left_balance.toString(),
      balances.right_balance.toString(),
    ];
  }

  return data;
};

function poolDataCheck(
  oldPoolData: IPoolData,
  oldPoolType: string,
  newPoolData: IPoolData,
  newPoolType: string,
) {
  expect(newPoolData.root).to.equal(
    oldPoolData.root,
    "New root value incorrect",
  );
  expect(newPoolData.vault).to.equal(
    oldPoolData.vault,
    "New vault value incorrect",
  );
  expect(newPoolData.platform_code).to.equal(
    oldPoolData.platform_code,
    "New platform_code value incorrect",
  );
  expect(oldPoolData.pool_type).to.equal(
    oldPoolType,
    "Old pool_type value incorrect",
  );
  expect(newPoolData.pool_type).to.equal(
    newPoolType,
    "New pool_type value incorrect",
  );
  if (oldPoolType === newPoolType) {
    expect(oldPoolData.current_version + 1).to.equal(
      newPoolData.current_version,
      "New current_version value incorrect",
    );
  }
  expect(newPoolData.lp_root).to.equal(
    oldPoolData.lp_root,
    "New lp_root value incorrect",
  );
  newPoolData.roots.forEach((newRoot, i) =>
    expect(newRoot).to.equal(
      oldPoolData.roots[i],
      `New ${i}-d root value incorrect`,
    ),
  );
  expect(newPoolData.active).to.equal(
    oldPoolData.active,
    "New active value incorrect",
  );
  expect(newPoolData.lp_wallet).to.equal(
    oldPoolData.lp_wallet,
    "New lp_wallet value incorrect",
  );
  newPoolData.token_wallets.forEach((newWallet, i) =>
    expect(newWallet).to.equal(
      oldPoolData.token_wallets[i],
      `New ${i}-d token wallet value incorrect`,
    ),
  );
  expect(newPoolData.lp_supply).to.equal(
    oldPoolData.lp_supply,
    "New lp_supply value incorrect",
  );
  newPoolData.balances.forEach((newBalance, i) =>
    expect(newBalance).to.equal(
      oldPoolData.balances[i],
      `New ${i}-d balance value incorrect`,
    ),
  );
  expect(JSON.stringify(newPoolData.fee_params)).to.equal(
    JSON.stringify(oldPoolData.fee_params),
    "New fee_params value incorrect",
  );
}

describe("Test Dex Pools contracts upgrade", async function () {
  let owner: Account;
  let dexRoot: Contract<DexRootAbi>;

  let dexPair_6_9: Contract<any>;
  let dexPair_9_18: Contract<any>;

  before("Load contracts", async function () {
    await locklift.deployments.fixture({
      include: ["dex-accounts", "dex-pairs", "dex-gas-values"],
    });

    owner = locklift.deployments.getAccount("DexOwner").account;
    dexRoot = locklift.deployments.getContract<DexRootAbi>("DexRoot");
    dexPair_6_9 = locklift.deployments.getContract<DexPairAbi>(
      "DexPair_token-6-1_token-9-1",
    );
    dexPair_9_18 = locklift.deployments.getContract<DexStablePairAbi>(
      "DexStablePair_token-9-0_token-18-0",
    );

    const dexAccount =
      locklift.deployments.getContract<DexAccountAbi>("OwnerDexAccount");

    for (let pool of [dexPair_6_9, dexPair_9_18]) {
      const poolData = await loadPoolData(pool);
      const decimals = await Promise.all(
        poolData.roots.map(root =>
          locklift.factory
            .getDeployedContract("TokenRootUpgradeable", new Address(root))
            .methods.decimals({ answerId: 0 })
            .call()
            .then(a => Number(a.value0)),
        ),
      );
      await depositLiquidity(
        owner.address,
        dexAccount,
        pool,
        poolData.roots.map((root, i) => {
          return {
            root: new Address(root),
            amount: new BigNumber(1).shiftedBy(decimals[i]).toString(),
          };
        }),
      );
    }
  });

  describe("Check Pair/Pool upgrade", async function () {
    it("DexPair -> DexStablePair upgrade", async function () {
      const oldData = await loadPoolData(dexPair_6_9);
      await upgradePair(
        new Address(oldData.roots[0]),
        new Address(oldData.roots[1]),
        locklift.factory.getContractArtifacts("DexStablePair"),
        2,
      );
      const newData = await loadPoolData(dexPair_6_9);

      poolDataCheck(oldData, "1", newData, "2");
    });

    it("DexStablePair -> DexStablePool upgrade", async function () {
      const oldData = await loadPoolData(dexPair_6_9);
      await upgradePool(
        oldData.roots.map(r => new Address(r)),
        locklift.factory.getContractArtifacts("DexStablePool"),
        3,
      );
      dexPair_6_9 = locklift.factory.getDeployedContract(
        "DexStablePool",
        dexPair_6_9.address,
      );
      const newData = await loadPoolData(dexPair_6_9);

      poolDataCheck(oldData, "2", newData, "3");
    });

    it("DexStablePool -> DexPair upgrade", async function () {
      const oldData = await loadPoolData(dexPair_6_9);
      await upgradePair(
        new Address(oldData.roots[0]),
        new Address(oldData.roots[1]),
        locklift.factory.getContractArtifacts("DexPair"),
        1,
      );
      dexPair_6_9 = locklift.factory.getDeployedContract(
        "DexPair",
        dexPair_6_9.address,
      );
      const newData = await loadPoolData(dexPair_6_9);

      poolDataCheck(oldData, "3", newData, "1");
    });

    it("DexPair -> TestNewDexPair upgrade", async function () {
      const oldData = await loadPoolData(dexPair_6_9);
      await upgradePair(
        new Address(oldData.roots[0]),
        new Address(oldData.roots[1]),
        locklift.factory.getContractArtifacts("TestNewDexPair"),
        1,
      );
      const newData = await loadPoolData(dexPair_6_9);

      poolDataCheck(oldData, "1", newData, "1");
    });

    it("DexStablePair -> DexPair upgrade", async function () {
      const oldData = await loadPoolData(dexPair_9_18);
      await upgradePair(
        new Address(oldData.roots[0]),
        new Address(oldData.roots[1]),
        locklift.factory.getContractArtifacts("DexPair"),
        1,
      );
      const newData = await loadPoolData(dexPair_9_18);

      poolDataCheck(oldData, "2", newData, "1");
    });

    it("DexPair -> DexStablePool upgrade", async function () {
      const oldData = await loadPoolData(dexPair_9_18);
      await upgradePool(
        oldData.roots.map(r => new Address(r)),
        locklift.factory.getContractArtifacts("DexStablePool"),
        3,
      );
      dexPair_9_18 = locklift.factory.getDeployedContract(
        "DexStablePool",
        dexPair_9_18.address,
      );
      const newData = await loadPoolData(dexPair_9_18);

      poolDataCheck(oldData, "1", newData, "3");
    });

    it("DexStablePool -> DexStablePool upgrade", async function () {
      const oldData = await loadPoolData(dexPair_9_18);
      await upgradePool(
        oldData.roots.map(r => new Address(r)),
        locklift.factory.getContractArtifacts("DexStablePool"),
        3,
      );
      const newData = await loadPoolData(dexPair_9_18);

      poolDataCheck(oldData, "3", newData, "3");
    });

    it("DexStablePool -> DexStablePair upgrade", async function () {
      const oldData = await loadPoolData(dexPair_9_18);
      await upgradePair(
        new Address(oldData.roots[0]),
        new Address(oldData.roots[1]),
        locklift.factory.getContractArtifacts("DexStablePair"),
        2,
      );
      dexPair_9_18 = locklift.factory.getDeployedContract(
        "DexStablePair",
        dexPair_9_18.address,
      );
      const newData = await loadPoolData(dexPair_9_18);

      poolDataCheck(oldData, "3", newData, "2");
    });

    it("DexStablePair -> TestNewDexStablePair upgrade", async function () {
      const oldData = await loadPoolData(dexPair_9_18);
      await upgradePair(
        new Address(oldData.roots[0]),
        new Address(oldData.roots[1]),
        locklift.factory.getContractArtifacts("TestNewDexStablePair"),
        2,
      );
      const newData = await loadPoolData(dexPair_9_18);

      poolDataCheck(oldData, "2", newData, "2");
    });
  });
});
