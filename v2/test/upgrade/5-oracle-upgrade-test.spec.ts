import { upgradePair } from "../../../utils/upgrade.utils";
import {
  convertBigNumberValuesToStrings,
  convertToFixedPoint128,
} from "../../../utils/math.utils";

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
import { createDexPair, deployToken } from "../../../utils/wrappers";

const TOKENS = [
  { name: "Token ABC", symbol: "ABC" },
  { name: "Token XYZ", symbol: "XYZ" },
];

describe("Oracle Upgrade", function () {
  let owner: Account;
  let pair:
    | Contract<DexPairAbi>
    | Contract<DexStablePairAbi>
    | Contract<TestOracleDexPairAbi>
    | Contract<TestNewDexPairAbi>;
  let dexRoot: Contract<DexRootAbi>;
  let tokens: Record<string, Address>;
  let leftTokenAddress: Address;
  let rightTokenAddress: Address;

  before("Deploy and load DEX", async () => {
    await locklift.deployments.fixture({ include: ["dex-root"] });

    owner = locklift.deployments.getAccount("DexOwner").account;
    dexRoot = locklift.deployments.getContract("DexRoot");

    const testOraclePairCode =
      locklift.factory.getContractArtifacts("TestOracleDexPair").code;

    const tokenRoots = [
      await deployToken(TOKENS[0].name, TOKENS[0].symbol),
      await deployToken(TOKENS[1].name, TOKENS[1].symbol),
    ];

    await dexRoot.methods
      .installOrUpdatePairCode({ code: testOraclePairCode, pool_type: 1 })
      .send({
        from: owner.address,
        amount: toNano(2),
      });

    pair = await locklift.factory.getDeployedContract(
      "TestOracleDexPair",
      await createDexPair(tokenRoots[0], tokenRoots[1]),
    );

    console.log(
      `DexPair_${TOKENS[0].symbol}_${
        TOKENS[1].symbol
      } deployed, address: ${pair.address.toString()}`,
    );

    const roots = await pair.methods.getTokenRoots({ answerId: 0 }).call();
    leftTokenAddress = roots.left;
    rightTokenAddress = roots.right;
  });

  describe("check oracle pair data", () => {
    it("should check pair code in root", async () => {
      const oraclePairCode =
        locklift.factory.getContractArtifacts("TestOracleDexPair").code;
      const code = await dexRoot.methods
        .getPairCode({ answerId: 0, pool_type: 1 })
        .call()
        .then(a => a.value0);

      expect(code).to.be.equal(oraclePairCode);
    });
  });

  describe("upgrade and check current pair", () => {
    it("should check oracle options", async () => {
      const options = await (pair as Contract<TestOracleDexPairAbi>).methods
        .getOracleOptions({ answerId: 0 })
        .call()
        .then(a => convertBigNumberValuesToStrings(a.value0));

      expect(options).to.deep.equal({
        cardinality: "1000",
        minInterval: "15",
        minRateDeltaNumerator: "1",
        minRateDeltaDenominator: "100",
      });
    });
  });

  describe("upgrade root and change oracle params", () => {
    it("should update cardinality", async () => {
      await dexRoot.methods
        .setOracleOptions({
          _leftRoot: leftTokenAddress,
          _rightRoot: rightTokenAddress,
          _options: {
            cardinality: "1100",
            minInterval: "15",
            minRateDeltaNumerator: "1",
            minRateDeltaDenominator: "100",
          },
          _remainingGasTo: owner.address,
        })
        .send({
          from: owner.address,
          amount: toNano(2),
        });

      const options = await (pair as Contract<TestOracleDexPairAbi>).methods
        .getOracleOptions({
          answerId: 0,
        })
        .call()
        .then(val => convertBigNumberValuesToStrings(val.value0));

      expect(options).to.deep.equal({
        cardinality: "1100",
        minInterval: "15",
        minRateDeltaNumerator: "1",
        minRateDeltaDenominator: "100",
      });
    });

    it("should update minimum interval", async () => {
      await dexRoot.methods
        .setOracleOptions({
          _leftRoot: leftTokenAddress,
          _rightRoot: rightTokenAddress,
          _options: {
            cardinality: "1100",
            minInterval: "5",
            minRateDeltaNumerator: "1",
            minRateDeltaDenominator: "100",
          },
          _remainingGasTo: owner.address,
        })
        .send({
          from: owner.address,
          amount: toNano(2),
        });

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
      await dexRoot.methods
        .setOracleOptions({
          _leftRoot: leftTokenAddress,
          _rightRoot: rightTokenAddress,
          _options: {
            cardinality: "1100",
            minInterval: "5",
            minRateDeltaNumerator: "5",
            minRateDeltaDenominator: "100",
          },
          _remainingGasTo: owner.address,
        })
        .send({
          from: owner.address,
          amount: toNano(2),
        });

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
          from: owner.address,
          amount: toNano(20),
        });
    });
  });

  describe("upgrade and check next pair", () => {
    it("should upgrade and check pair code in root", async () => {
      const NewDexPair =
        locklift.factory.getContractArtifacts("TestNewDexPair");
      await upgradePair(leftTokenAddress, rightTokenAddress, NewDexPair);
      pair = locklift.factory.getDeployedContract(
        "TestNewDexPair",
        pair.address,
      );
      const code = await dexRoot.methods
        .getPairCode({ answerId: 0, pool_type: 1 })
        .call()
        .then(a => a.value0);

      expect(code).to.be.equal(NewDexPair.code);
    });

    it("should check cardinality", async () => {
      const cardinality = await (pair as Contract<TestNewDexPairAbi>).methods
        .getCardinality({ answerId: 0 })
        .call()
        .then(a => a.value0);
      expect(cardinality).to.be.equal("1100");
    });

    it("should check minimum interval", async () => {
      const minInterval = await (pair as Contract<TestNewDexPairAbi>).methods
        .getMinInterval({ answerId: 0 })
        .call()
        .then(a => a.value0);
      expect(minInterval).to.be.equal("5");
    });

    it("should check length", async () => {
      const length = await (pair as Contract<TestNewDexPairAbi>).methods
        .getLength({ answerId: 0 })
        .call()
        .then(a => a.value0);
      expect(length).to.be.equal("1000");
    });

    it("should check minimum rate delta", async () => {
      const minRateDelta = await (pair as Contract<TestNewDexPairAbi>).methods
        .getMinRateDelta({ answerId: 0 })
        .call()
        .then(a => a.value0);
      expect(minRateDelta).to.deep.equal(
        convertToFixedPoint128("5").dividedToIntegerBy("100").toString(),
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
        .call()
        .then(a => a.value0);
      expect(str).to.be.equal("New Pair");
    });
  });

  describe("upgrade and check stable pair", () => {
    it("should upgrade and check pair code in root", async () => {
      const NewDexPair = locklift.factory.getContractArtifacts("DexStablePair");
      await upgradePair(leftTokenAddress, rightTokenAddress, NewDexPair, 2);
      pair = locklift.factory.getDeployedContract(
        "DexStablePair",
        pair.address,
      );
      const code = await dexRoot.methods
        .getPairCode({ answerId: 0, pool_type: 2 })
        .call()
        .then(a => a.value0);

      expect(code).to.be.equal(NewDexPair.code);
    });
  });
});
