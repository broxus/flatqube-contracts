const {Migration, TOKEN_CONTRACTS_PATH, Constants, EMPTY_TVM_CELL, afterRun} = require(process.cwd()+'/scripts/utils');
const { Command } = require('commander');
const program = new Command();
const BigNumber = require('bignumber.js');
BigNumber.config({EXPONENTIAL_AT: 257});

async function main() {
  const migration = new Migration();
  const [keyPair] = await locklift.keys.getKeyPairs();

  const rootOwner = migration.load(await locklift.factory.getAccount('Wallet'), 'Account1');
  rootOwner.afterRun = afterRun;

  program
      .allowUnknownOption()
      .option('-m, --mints <mints>', 'mint params')
      .option('-t, --to <to>', 'mint params');

  program.parse(process.argv);

  const options = program.opts();

  const mints = options.mints ? JSON.parse(options.mints) : [
    {
      amount: 20000,
      token: 'foo'
    }
  ];

  const to = options.to || '0:0000000000000000000000000000000000000000000000000000000000000000';

  for (const mint of mints) {

    const token = Constants.tokens[mint.token];
    const amount = new BigNumber(mint.amount).shiftedBy(token.decimals).toFixed();

    const tokenRoot = migration.load(
        await locklift.factory.getContract(
            token.upgradeable ? 'TokenRootUpgradeable' : 'TokenRoot',
            TOKEN_CONTRACTS_PATH
        ), token.symbol + 'Root'
    );

    await rootOwner.runTarget({
      contract: tokenRoot,
      method: 'mint',
      params: {
        amount: amount,
        recipient: to,
        deployWalletValue: locklift.utils.convertCrystal(0.2, 'nano'),
        remainingGasTo: rootOwner.address,
        notify: false,
        payload: EMPTY_TVM_CELL
      },
      value: locklift.utils.convertCrystal(0.5, 'nano'),
      keyPair
    });
  }

}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.log(e);
    process.exit(1);
  });
