import { upgradePair, upgradeRoot } from "utils/upgrade.utils";
import { accountMigration, createDex } from "utils/wrappers.utils";
import {
  convertBigNumberValuesToStrings,
  convertToFixedPoint128,
} from "utils/math.utils";

import {
  POINTS_MOCK,
  FIRST_POINT_TIMESTAMP,
  LAST_POINT_TIMESTAMP,
} from "../mocks/oracle-points.mock";

import { expect } from "chai";
import { Account } from "everscale-standalone-client";
import { Address, Contract, toNano } from "locklift";
import {
  DexPairAbi,
  DexRootAbi,
  DexStablePairAbi,
  TestNewDexPairAbi,
  TestOracleDexPairAbi,
} from "../../../build/factorySource";

const TOKENS = [
  { name: "Token ABC", symbol: "ABC" },
  { name: "Token XYZ", symbol: "XYZ" },
];

const PAIRS = [{ left: "ABC", right: "XYZ" }];
describe("Oracle Upgrade", function () {
  this.timeout(1_000_000);

  let account: Account;
  let pair:
    | Contract<DexPairAbi>
    | Contract<TestOracleDexPairAbi>
    | Contract<TestNewDexPairAbi>
    | Contract<DexStablePairAbi>;
  let root: Contract<DexRootAbi>;
  let tokens: Record<string, Address>;
  let leftTokenAddress: Address;
  let rightTokenAddress: Address;

  before("deploy and load prev DEX", async () => {
    account = await accountMigration("100000");

    const dex = await createDex(account, TOKENS, PAIRS, true);

    // Unpack DEX contracts
    root = dex[0] as Contract<DexRootAbi>;
    tokens = dex[1] as Record<string, Address>;
    pair = (
      dex[2] as Record<
        string,
        Contract<DexPairAbi> | Contract<TestOracleDexPairAbi>
      >
    )["ABCXYZ"];

    const roots = await pair.methods.getTokenRoots({ answerId: 0 }).call();

    leftTokenAddress = roots.left;
    rightTokenAddress = roots.right;
  });

  describe("check previous pair data", () => {
    it("should check pair code in root", async () => {
      const DexPairPrev =
        locklift.factory.getContractArtifacts("TestNewDexPair");
      const code = await root.methods
        .getPairCode({ answerId: 0, pool_type: 1 })
        .call();

      expect(code).to.be.equal(DexPairPrev.code);
    });

    it("should throw for oracle function", async () => {
      const cardinality = await (pair as Contract<TestOracleDexPairAbi>).methods
        .getCardinality({ answerId: 0 })
        .call()
        .catch(() => 0);

      expect(cardinality).to.be.equal(0);
    });

    it("should check tokens roots", async () => {
      const roots = await pair.methods.getTokenRoots({ answerId: 0 }).call();

      expect(roots).to.include({
        left: leftTokenAddress,
        right: rightTokenAddress,
      });
    });
  });

  describe("upgrade and check current pair", () => {
    it("should upgrade and check pair code in root", async () => {
      const DexPairCode =
        locklift.factory.getContractArtifacts("TestOracleDexPair");
      await upgradePair(
        account,
        root,
        tokens["ABC"],
        tokens["XYZ"],
        DexPairCode,
      );
      const DexPair = locklift.factory.getDeployedContract(
        "DexPair",
        pair.address,
      );

      pair = DexPair;
      const code = await root.methods
        .getPairCode({ answerId: 0, pool_type: 1 })
        .call();

      expect(code).to.be.equal(DexPairCode.code);
    });

    it("should check tokens roots", async () => {
      const roots = await pair.methods.getTokenRoots({ answerId: 0 }).call();

      expect(roots).to.include({
        left: leftTokenAddress,
        right: rightTokenAddress,
      });
    });

    it("should check oracle options", async () => {
      const options = await (pair as Contract<TestOracleDexPairAbi>).methods
        .getOracleOptions({ answerId: 0 })
        .call()
        .then(convertBigNumberValuesToStrings);

      expect(options).to.deep.equal({
        cardinality: "1000",
        minInterval: "15",
        minRateDeltaNumerator: "1",
        minRateDeltaDenominator: "100",
      });
    });
  });

  describe("upgrade root and change oracle params", () => {
    it("should upgrade root", async () => {
      const DexRoot = locklift.factory.getContractArtifacts("DexRoot");
      await upgradeRoot(account, root, DexRoot);
      root = locklift.factory.getDeployedContract("DexRoot", root.address);
    });

    it("should update cardinality", async () => {
      const options = await root.methods
        .setOracleOptions({
          _leftRoot: tokens["ABC"],
          _rightRoot: tokens["XYZ"],
          _options: {
            cardinality: "1100",
            minInterval: "15",
            minRateDeltaNumerator: "1",
            minRateDeltaDenominator: "100",
          },
          _remainingGasTo: account.address,
        })
        .send({
          from: account.address,
          amount: toNano(2),
        })
        .then(convertBigNumberValuesToStrings);

      expect(options).to.deep.equal({
        cardinality: "1100",
        minInterval: "15",
        minRateDeltaNumerator: "1",
        minRateDeltaDenominator: "100",
      });
    });

    it("should update minimum interval", async () => {
      await root.methods
        .setOracleOptions({
          _leftRoot: tokens["ABC"],
          _rightRoot: tokens["XYZ"],
          _options: {
            cardinality: "1100",
            minInterval: "5",
            minRateDeltaNumerator: "1",
            minRateDeltaDenominator: "100",
          },
          _remainingGasTo: account.address,
        })
        .send({
          from: account.address,
          amount: toNano(2),
        })
        .then(convertBigNumberValuesToStrings);

      const options = await (pair as Contract<TestOracleDexPairAbi>).methods
        .getOracleOptions({
          answerId: 0,
        })
        .call()
        .then(val => convertBigNumberValuesToStrings(val.value0));

      expect(options).to.deep.equal({
        cardinality: "1100",
        minInterval: "5",
        minRateDeltaNumerator: "1",
        minRateDeltaDenominator: "100",
      });
    });

    it("should update minimum rate delta", async () => {
      await root.methods
        .setOracleOptions({
          _leftRoot: tokens["ABC"],
          _rightRoot: tokens["XYZ"],
          _options: {
            cardinality: "1100",
            minInterval: "5",
            minRateDeltaNumerator: "5",
            minRateDeltaDenominator: "100",
          },
          _remainingGasTo: account.address,
        })
        .send({
          from: account.address,
          amount: toNano(2),
        })
        .then(val => convertBigNumberValuesToStrings(val));

      const options = await (pair as Contract<TestOracleDexPairAbi>).methods
        .getOracleOptions({
          answerId: 0,
        })
        .call()
        .then(val => convertBigNumberValuesToStrings(val.value0));

      expect(options).to.deep.equal({
        cardinality: "1100",
        minInterval: "5",
        minRateDeltaNumerator: "5",
        minRateDeltaDenominator: "100",
      });
    });

    it("should update points", async () => {
      await (pair as Contract<TestOracleDexPairAbi>).methods
        .setPoints({
          _newPoints: POINTS_MOCK,
          _newLength: 1000,
          answerId: 0,
        })
        .send({
          from: account.address,
          amount: toNano(20),
        });
    });
  });

  describe("upgrade and check next pair", () => {
    it("should upgrade and check pair code in root", async () => {
      const NewDexPair =
        locklift.factory.getContractArtifacts("TestNewDexPair");
      await upgradePair(
        account,
        root,
        tokens["ABC"],
        tokens["XYZ"],
        NewDexPair,
      );
      pair = locklift.factory.getDeployedContract(
        "TestNewDexPair",
        pair.address,
      );
      const code = await root.methods
        .getPairCode({ answerId: 0, pool_type: 1 })
        .call();

      expect(code.value0).to.be.equal(NewDexPair.code);
    });

    it("should check cardinality", async () => {
      const cardinality = await (pair as Contract<TestNewDexPairAbi>).methods
        .getCardinality({ answerId: 0 })
        .call();
      expect(cardinality.value0).to.be.equal("1100");
    });

    it("should check minimum interval", async () => {
      const minInterval = await (pair as Contract<TestNewDexPairAbi>).methods
        .getMinInterval({ answerId: 0 })
        .call();
      expect(minInterval.value0).to.be.equal("5");
    });

    it("should check length", async () => {
      const length = await (pair as Contract<TestNewDexPairAbi>).methods
        .getLength({ answerId: 0 })
        .call();
      expect(length.value0).to.be.equal("1000");
    });

    it("should check minimum rate delta", async () => {
      const minRateDelta = await (pair as Contract<TestNewDexPairAbi>).methods
        .getMinRateDelta({ answerId: 0 })
        .call();
      expect(minRateDelta.value0).to.deep.equal(
        convertToFixedPoint128("5").dividedToIntegerBy("100"),
      );
    });

    it("should check first point", async () => {
      const point = await (pair as Contract<TestNewDexPairAbi>).methods
        .getPoint({
          answerId: 0,
          _timestamp: FIRST_POINT_TIMESTAMP,
        })
        .call()
        .then(val => convertBigNumberValuesToStrings(val.value0));

      expect(point).to.deep.equal({
        price0To1Cumulative:
          "5635803769009073487653102960136121952275194116749",
        price1To0Cumulative: "56320153911376705340182265326387169282409664343",
      });
    });

    it("should check last point", async () => {
      const point = await (pair as Contract<TestNewDexPairAbi>).methods
        .getPoint({
          _timestamp: LAST_POINT_TIMESTAMP,
          answerId: 0,
        })
        .call()
        .then(val => convertBigNumberValuesToStrings(val.value0));

      expect(point).to.deep.equal({
        price0To1Cumulative:
          "5635824801572495438493209387081344731009903402607",
        price1To0Cumulative: "56329084719548573182795447126288831166043707346",
      });
    });

    it("should check new func", async () => {
      const str = await (pair as Contract<TestNewDexPairAbi>).methods
        .newFunc()
        .call();
      expect(str.value0).to.be.equal("New Pair");
    });
  });

  describe("upgrade and check stable pair", () => {
    it("should upgrade and check pair code in root", async () => {
      const NewDexPair = locklift.factory.getContractArtifacts("DexStablePair");
      await upgradePair(
        account,
        root,
        tokens["ABC"],
        tokens["XYZ"],
        NewDexPair,
        2,
      );
      pair = locklift.factory.getDeployedContract(
        "DexStablePair",
        pair.address,
      );
      const code = await root.methods
        .getPairCode({ answerId: 0, pool_type: 2 })
        .call();

      expect(code).to.be.equal(NewDexPair.code);
    });
  });
});
