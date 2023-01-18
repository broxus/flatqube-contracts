const { expect } = require('chai');
const { Migration } = require(process.cwd() + '/scripts/utils');
const { Command } = require('commander');
const BigNumber = require('bignumber.js');
const { convertBigNumberValuesToStrings } = require('../utils/math.utils');
const { POINTS_MOCK, FIRST_POINT_TIMESTAMP, LAST_POINT_TIMESTAMP } = require('./mocks/oracle-points.mock');

BigNumber.config({ EXPONENTIAL_AT: 257 });

const migration = new Migration();
const program = new Command();

program
  .allowUnknownOption()
  .option('-l, --left <left>', 'left token')
  .option('-r, --right <right>', 'right token')

program.parse(process.argv);

const options = program.opts();

describe('DexPair set points', function () {
  this.timeout(1_000_000);

  let account;
  let pair;

  before('load pair and account', async () => {
    const keyPairs = await locklift.keys.getKeyPairs();

    pair = await locklift.factory.getContract('TestOracleDexPair');
    account = await locklift.factory.getAccount('Wallet');

    migration.load(pair, `DexPool${options.left}${options.right}`);
    migration.load(account, 'Account2');

    account.setKeyPair(keyPairs[1]);
  });

  describe('set 1000 points', () => {
    it('should update points', async () => {
      await account.runTarget({
        contract: pair,
        method: 'setPoints',
        params: { _newPoints: POINTS_MOCK, _newLength: 1000 },
        value: locklift.utils.convertCrystal('10', 'nano'),
        keyPair: account.keyPair,
      });
    });
  });

  describe('check updated points', () => {
    it('should check first point', async () => {
      const point = await pair
        .call({ method: 'getObservation', params: { _timestamp: FIRST_POINT_TIMESTAMP } })
        .then(convertBigNumberValuesToStrings);

      expect(point).to.deep.equal({
        price0To1Cumulative: '5635803769009073487653102960136121952275194116749',
        price1To0Cumulative: '56320153911376705340182265326387169282409664343',
        timestamp: '1655653132'
      });
    });

    it('should check last point', async () => {
      const point = await pair
        .call({ method: 'getObservation', params: { _timestamp: LAST_POINT_TIMESTAMP } })
        .then(convertBigNumberValuesToStrings);

      expect(point).to.deep.equal({
        price0To1Cumulative: '5635824801572495438493209387081344731009903402607',
        price1To0Cumulative: '56329084719548573182795447126288831166043707346',
        timestamp: '1655691614'
      });
    });
  });
});
