const { expect } = require('chai');
const { accountMigration, createDex } = require('../../utils/migration.utils');
const { upgradePair, upgradeRoot } = require('../../utils/upgrade.utils');
const { convertBigNumberValuesToStrings, convertToFixedPoint128 } = require('../../utils/math.utils');
const { POINTS_MOCK, FIRST_POINT_TIMESTAMP, LAST_POINT_TIMESTAMP } = require('../mocks/oracle-points.mock');

const TOKENS = [
  { name: 'Token ABC', symbol: 'ABC' },
  { name: 'Token XYZ', symbol: 'XYZ' },
];

const PAIRS = [
  { left: 'ABC', right: 'XYZ' },
];

describe('Oracle Upgrade', function () {
  this.timeout(1_000_000);

  let account;
  let pair;
  let root;
  let tokens;
  let leftTokenAddress;
  let rightTokenAddress;

  before('deploy and load prev DEX', async () => {
    account = await accountMigration('100000');

    const dex = await createDex(
      account,
      TOKENS,
      PAIRS,
      true,
    );

    // Unpack DEX contracts
    root = dex[0];
    tokens = dex[1];
    pair = dex[2]['ABCXYZ'];

    const roots = await pair.call({ method: 'getTokenRoots' });
    leftTokenAddress = roots.left;
    rightTokenAddress = roots.right;
  });

  describe('check previous pair data', () => {
    it('should check pair code in root', async () => {
      const DexPairPrev = await locklift.factory.getContract('DexPairPrev');
      const code = await root.call({ method: 'getPairCode', params: { pool_type: 1 } });

      expect(code).to.be.equal(DexPairPrev.code);
    });

    it('should throw for oracle function', async () => {
      const cardinality = await pair
        .call({ method: 'getCardinality' })
        .catch(() => 0);

      expect(cardinality).to.be.equal(0);
    });

    it('should check tokens roots', async () => {
      const roots = await pair.call({ method: 'getTokenRoots' });

      expect(roots).to.include({
        left: leftTokenAddress,
        right: rightTokenAddress,
      });
    });
  });

  describe('upgrade and check current pair', () => {
    it('should upgrade and check pair code in root', async () => {
      const DexPair = await locklift.factory.getContract('TestOracleDexPair');
      await upgradePair(account, root, tokens['ABC'].address, tokens['XYZ'].address, DexPair);
      DexPair.setAddress(pair.address);
      pair = DexPair;
      const code = await root.call({ method: 'getPairCode', params: { pool_type: 1 } });

      expect(code).to.be.equal(DexPair.code);
    });

    it('should check tokens roots', async () => {
      const roots = await pair.call({ method: 'getTokenRoots' });

      expect(roots).to.include({
        left: leftTokenAddress,
        right: rightTokenAddress,
      });
    });

    it('should check oracle options', async () => {
      const options = await pair
        .call({ method: 'getOracleOptions' })
        .then(convertBigNumberValuesToStrings);

      expect(options).to.deep.equal({
        cardinality: '1000',
        minInterval: '15',
        minRateDeltaNumerator: '1',
        minRateDeltaDenominator: '100'
      });
    });
  });

  describe('upgrade root and change oracle params', () => {
    it('should upgrade root', async () => {
      const DexRoot = await locklift.factory.getContract('DexRoot');
      await upgradeRoot(account, root, DexRoot);
      DexRoot.setAddress(root.address);
      root = DexRoot;
    });

    it('should update cardinality', async () => {
      await account.runTarget({
        contract: root,
        method: 'setOracleOptions',
        params: {
          _leftRoot: tokens['ABC'].address,
          _rightRoot: tokens['XYZ'].address,
          _options: {
            cardinality: '1100',
            minInterval: '15',
            minRateDeltaNumerator: '1',
            minRateDeltaDenominator: '100'
          },
          _remainingGasTo: account.address,
        },
        value: locklift.utils.convertCrystal('2', 'nano'),
        keyPair: account.keyPair,
      });

      const options = await pair
        .call({ method: 'getOracleOptions' })
        .then(convertBigNumberValuesToStrings);

      expect(options).to.deep.equal({
        cardinality: '1100',
        minInterval: '15',
        minRateDeltaNumerator: '1',
        minRateDeltaDenominator: '100'
      });
    });

    it('should update minimum interval', async () => {
      await account.runTarget({
        contract: root,
        method: 'setOracleOptions',
        params: {
          _leftRoot: tokens['ABC'].address,
          _rightRoot: tokens['XYZ'].address,
          _options: {
            cardinality: '1100',
            minInterval: '5',
            minRateDeltaNumerator: '1',
            minRateDeltaDenominator: '100'
          },
          _remainingGasTo: account.address,
        },
        value: locklift.utils.convertCrystal('2', 'nano'),
        keyPair: account.keyPair,
      });

      const options = await pair
        .call({ method: 'getOracleOptions' })
        .then(convertBigNumberValuesToStrings);

      expect(options).to.deep.equal({
        cardinality: '1100',
        minInterval: '5',
        minRateDeltaNumerator: '1',
        minRateDeltaDenominator: '100'
      });
    });

    it('should update minimum rate delta', async () => {
      await account.runTarget({
        contract: root,
        method: 'setOracleOptions',
        params: {
          _leftRoot: tokens['ABC'].address,
          _rightRoot: tokens['XYZ'].address,
          _options: {
            cardinality: '1100',
            minInterval: '5',
            minRateDeltaNumerator: '5',
            minRateDeltaDenominator: '100'
          },
          _remainingGasTo: account.address,
        },
        value: locklift.utils.convertCrystal('2', 'nano'),
        keyPair: account.keyPair,
      });

      const options = await pair
        .call({ method: 'getOracleOptions' })
        .then(convertBigNumberValuesToStrings);

      expect(options).to.deep.equal({
        cardinality: '1100',
        minInterval: '5',
        minRateDeltaNumerator: '5',
        minRateDeltaDenominator: '100'
      });
    });

    it('should update points', async () => {
      await account.runTarget({
        contract: pair,
        method: 'setPoints',
        params: { _newPoints: POINTS_MOCK, _newLength: 1000 },
        value: locklift.utils.convertCrystal('20', 'nano'),
        keyPair: account.keyPair,
      });
    });
  });

  describe('upgrade and check next pair', () => {
    it('should upgrade and check pair code in root', async () => {
      const NewDexPair = await locklift.factory.getContract('TestNewDexPair');
      await upgradePair(account, root, tokens['ABC'].address, tokens['XYZ'].address, NewDexPair);
      NewDexPair.setAddress(pair.address);
      pair = NewDexPair;
      const code = await root.call({ method: 'getPairCode', params: { pool_type: 1 } });

      expect(code).to.be.equal(NewDexPair.code);
    });

    it('should check cardinality', async () => {
      const cardinality = await pair.call({ method: 'getCardinality' });
      expect(cardinality.toNumber()).to.be.equal(1100);
    });

    it('should check minimum interval', async () => {
      const minInterval = await pair.call({ method: 'getMinInterval' });
      expect(minInterval.toNumber()).to.be.equal(5);
    });

    it('should check length', async () => {
      const length = await pair.call({ method: 'getLength' });
      expect(length.toNumber()).to.be.equal(1000);
    });

    it('should check minimum rate delta', async () => {
      const minRateDelta = await pair.call({ method: 'getMinRateDelta' });
      expect(minRateDelta).to.deep.equal(
        convertToFixedPoint128('5').dividedToIntegerBy('100'),
      );
    });

    it('should check first point', async () => {
      const point = await pair
        .call({ method: 'getPoint', params: { _timestamp: FIRST_POINT_TIMESTAMP } })
        .then(convertBigNumberValuesToStrings);

      expect(point).to.deep.equal({
        price0To1Cumulative: '5635803769009073487653102960136121952275194116749',
        price1To0Cumulative: '56320153911376705340182265326387169282409664343',
      });
    });

    it('should check last point', async () => {
      const point = await pair
        .call({ method: 'getPoint', params: { _timestamp: LAST_POINT_TIMESTAMP } })
        .then(convertBigNumberValuesToStrings);

      expect(point).to.deep.equal({
        price0To1Cumulative: '5635824801572495438493209387081344731009903402607',
        price1To0Cumulative: '56329084719548573182795447126288831166043707346',
      });
    });

    it('should check new func', async () => {
      const str = await pair.call({ method: 'newFunc' });
      expect(str).to.be.equal('New Pair');
    });
  });
});
