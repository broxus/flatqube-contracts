pragma ton-solidity >= 0.62.0;

import "./structures/IGasValueStructure.sol";

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";
import "./libraries/GasValues.sol";
import "./libraries/DexErrors.sol";
import "./libraries/DexGas.sol";

contract DexGasValues is IGasValueStructure {

    uint32 private static _nonce;

    address private _owner;
    address private _pendingOwner;

    constructor(address owner_) public {
        tvm.accept();

        _owner = owner_;
    }

    function transferOwner(address new_owner) public {
        require(msg.sender == _owner && msg.sender.value != 0, DexErrors.NOT_MY_OWNER);
        tvm.rawReserve(DexGas.GAS_VALUES_INITIAL_BALANCE, 0);

        _pendingOwner = new_owner;

        _owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS });
    }

    function acceptOwner() public {
        require(msg.sender == _pendingOwner && msg.sender.value != 0, DexErrors.NOT_PENDING_OWNER);

        tvm.rawReserve(DexGas.GAS_VALUES_INITIAL_BALANCE, 0);

        _owner = _pendingOwner;
        _pendingOwner = address(0);

        _owner.transfer({ value: 0, flag: MsgFlag.ALL_NOT_RESERVED + MsgFlag.IGNORE_ERRORS });
    }

    function getSetFeeParamsGas() external pure returns (GasValue) {
        GasValue setFeeParams = GasValues.getSetFeeParamsGas();
        setFeeParams.fixedValue += DexGas.DEX_ROOT_COMPENSATION;

        return setFeeParams;
    }

    function getSetAmplificationCoefficientGas() external pure returns (GasValue) {
        GasValue setAmpCoef = GasValues.getSetAmplificationCoefficientGas();
        setAmpCoef.fixedValue += DexGas.DEX_ROOT_COMPENSATION;

        return setAmpCoef;
    }

    function getDeployTokenVaultGas() external pure returns (GasValue) {
        GasValue deployTokenVault = GasValues.getDeployTokenVaultGas();
        deployTokenVault.fixedValue += DexGas.DEX_ROOT_COMPENSATION;

        return deployTokenVault;
    }

    function getUpgradeTokenVaultGas() external pure returns (GasValue) {
        GasValue upgradeTokenVault = GasValues.getUpgradeTokenVaultGas();
        upgradeTokenVault.fixedValue += DexGas.DEX_ROOT_COMPENSATION;

        return upgradeTokenVault;
    }

    function getDeployPoolGas(uint8 N) external pure returns (GasValue) {
        GasValue deployPool = GasValues.getDeployPoolGas(N);
        deployPool.fixedValue += DexGas.DEX_ROOT_COMPENSATION;

        return deployPool;
    }

    function getUpgradePoolGas() external pure returns (GasValue) {
        GasValue upgradePool = GasValues.getUpgradePoolGas();
        upgradePool.fixedValue += DexGas.DEX_ROOT_COMPENSATION;
        upgradePool.dynamicGas += 100000;

        return upgradePool;
    }

    function getDeployAccountGas() external pure returns (GasValue) {
        GasValue deployAccount = GasValues.getDeployAccountGas();
        deployAccount.fixedValue += DexGas.DEX_ROOT_COMPENSATION;

        return deployAccount;
    }

    function getUpgradeAccountGas() external pure returns (GasValue) {
        GasValue upgradeAccount = GasValues.getUpgradeAccountGas();
        upgradeAccount.fixedValue += DexGas.DEX_ROOT_COMPENSATION;

        return upgradeAccount;
    }

    function getUpgradeRootGas() external pure returns (GasValue) {
        GasValue upgradeRoot = GasValues.getUpgradeRootGas();
        upgradeRoot.fixedValue += DexGas.DEX_ROOT_COMPENSATION;

        return upgradeRoot;
    }

    function getDepositToAccountGas() external pure returns (GasValue) {
        GasValue depositToAccount = GasValues.getDepositToAccountGas();
        depositToAccount.fixedValue += DexGas.DEX_ACCOUNT_COMPENSATION;

        return depositToAccount;
    }

    function getAddPoolGas(uint8 N) external pure returns (GasValue) {
        GasValue addPool = GasValues.getAddPoolGas(N);
        addPool.fixedValue += DexGas.DEX_ACCOUNT_COMPENSATION;

        return addPool;
    }

    function getAccountWithdrawGas(uint128 deployWalletValue) external pure returns (GasValue) {
        GasValue accountWithdraw = GasValues.getAccountWithdrawGas(deployWalletValue);
        accountWithdraw.fixedValue += DexGas.DEX_ACCOUNT_COMPENSATION;

        return accountWithdraw;
    }

    function getAccountTransferGas() external pure returns (GasValue) {
        GasValue accountTransfer = GasValues.getAccountTransferGas();
        accountTransfer.fixedValue += DexGas.DEX_ACCOUNT_COMPENSATION;

        return accountTransfer;
    }

    function getAccountExchangeGas() external pure returns (GasValue) {
        GasValue accountExchange = GasValues.getAccountExchangeGas();
        accountExchange.fixedValue += DexGas.DEX_ACCOUNT_COMPENSATION;

        return accountExchange;
    }

    function getAccountDepositGas(uint8 N, address referrer) external pure returns (GasValue) {
        GasValue accountDeposit = GasValues.getAccountDepositGas(N, referrer);
        accountDeposit.fixedValue += DexGas.DEX_ACCOUNT_COMPENSATION;

        return accountDeposit;
    }

    function getAccountWithdrawLiquidityGas(uint8 N) external pure returns (GasValue) {
        GasValue accountWithdrawLiquidity = GasValues.getAccountWithdrawLiquidityGas(N);
        accountWithdrawLiquidity.fixedValue += DexGas.DEX_ACCOUNT_COMPENSATION;

        return accountWithdrawLiquidity;
    }

    function getPoolDirectExchangeGas(uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue poolDirectExchange = GasValues.getPoolDirectExchangeGas(deployWalletValue, referrer);
        poolDirectExchange.fixedValue += DexGas.DEX_POOL_COMPENSATION;

        return poolDirectExchange;
    }

    function getPoolDirectDepositGas(uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue poolDirectDeposit = GasValues.getPoolDirectDepositGas(deployWalletValue, referrer);
        poolDirectDeposit.fixedValue += DexGas.DEX_POOL_COMPENSATION;

        return poolDirectDeposit;
    }

    function getPoolDirectWithdrawGas(uint8 N, uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue poolDirectWithdraw = GasValues.getPoolDirectWithdrawGas(N, deployWalletValue, referrer);
        poolDirectWithdraw.fixedValue += DexGas.DEX_POOL_COMPENSATION;

        return poolDirectWithdraw;
    }

    function getPoolDirectWithdrawOneCoinGas(uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue poolDirectWithdrawOneCoin = GasValues.getPoolDirectWithdrawOneCoinGas(deployWalletValue, referrer);
        poolDirectWithdrawOneCoin.fixedValue += DexGas.DEX_POOL_COMPENSATION;

        return poolDirectWithdrawOneCoin;
    }

    function getPoolCrossExchangeGas(uint32 steps, uint32 leaves, uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue poolCrossExchangeStep = GasValues.getPoolCrossExchangeStepGas(referrer);
        GasValue transferTokens = GasValues.getTransferTokensGas(0); // spent token transfer

        return GasValue(
            poolCrossExchangeStep.fixedValue * steps +
            deployWalletValue * leaves +
            transferTokens.fixedValue +
            DexGas.DEX_POOL_COMPENSATION,

            poolCrossExchangeStep.dynamicGas * steps +
            transferTokens.dynamicGas
        );
    }

    function getUpgradeVaultGas() external pure returns (GasValue) {
        GasValue upgradeVault = GasValues.getUpgradeVaultGas();
        upgradeVault.fixedValue += DexGas.DEX_VAULT_COMPENSATION;

        return upgradeVault;
    }

    function getEverToTip3ExchangeGas(uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue everToTip3 = GasValues.getEverToTip3ExchangeGas(deployWalletValue);
        GasValue poolDirectExchange = GasValues.getPoolDirectExchangeGas(deployWalletValue, referrer);

        return GasValue(
            everToTip3.fixedValue + poolDirectExchange.fixedValue + EverToTip3Gas.EVER_WEVER_TIP3_COMPENSATION,
            everToTip3.dynamicGas + poolDirectExchange.dynamicGas
        );
    }

    function getEverToTip3CrossExchangeGas(uint32 steps, uint32 leaves, uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue everToTip3 = GasValues.getEverToTip3CrossExchangeGas(deployWalletValue, leaves);
        GasValue poolCrossExchangeStep = GasValues.getPoolCrossExchangeStepGas(referrer);

        return GasValue(
            everToTip3.fixedValue + steps * poolCrossExchangeStep.fixedValue + deployWalletValue * leaves +
            EverToTip3Gas.EVER_WEVER_TIP3_COMPENSATION,

            everToTip3.dynamicGas + steps * poolCrossExchangeStep.dynamicGas
        );
    }

    function getTip3ToEverExchangeGas(uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue tip3ToEver = GasValues.getTip3ToEverExchangeGas(deployWalletValue);
        GasValue poolDirectExchange = GasValues.getPoolDirectExchangeGas(deployWalletValue, referrer);

        return GasValue(
            tip3ToEver.fixedValue + poolDirectExchange.fixedValue + EverToTip3Gas.EVER_WEVER_TIP3_COMPENSATION,
            tip3ToEver.dynamicGas + poolDirectExchange.dynamicGas
        );
    }

    function getTip3ToEverCrossExchangeGas(uint32 steps, uint32 leaves, uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue tip3ToEver = GasValues.getTip3ToEverCrossExchangeGas(deployWalletValue, leaves);
        GasValue poolCrossExchangeStep = GasValues.getPoolCrossExchangeStepGas(referrer);

        return GasValue(
            tip3ToEver.fixedValue + steps * poolCrossExchangeStep.fixedValue + EverToTip3Gas.EVER_WEVER_TIP3_COMPENSATION,
            tip3ToEver.dynamicGas + steps * poolCrossExchangeStep.dynamicGas
        );
    }

    function getEverWeverToTip3ExchangeGas(uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue everWeverToTip3 = GasValues.getEverWeverToTip3ExchangeGas(deployWalletValue);
        GasValue poolDirectExchange = GasValues.getPoolDirectExchangeGas(deployWalletValue, referrer);

        return GasValue(
            everWeverToTip3.fixedValue + poolDirectExchange.fixedValue + EverToTip3Gas.EVER_WEVER_TIP3_COMPENSATION,
            everWeverToTip3.dynamicGas + poolDirectExchange.dynamicGas
        );
    }

    function getEverWeverToTip3CrossExchangeGas(uint32 steps, uint32 leaves, uint128 deployWalletValue, address referrer) external pure returns (GasValue) {
        GasValue everWeverToTip3 = GasValues.getEverWeverToTip3CrossExchangeGas(deployWalletValue, leaves);
        GasValue poolCrossExchangeStep = GasValues.getPoolCrossExchangeStepGas(referrer);

        return GasValue(
            everWeverToTip3.fixedValue + steps * poolCrossExchangeStep.fixedValue + deployWalletValue * leaves +
            EverToTip3Gas.EVER_WEVER_TIP3_COMPENSATION,

            everWeverToTip3.dynamicGas + steps * poolCrossExchangeStep.dynamicGas
        );
    }
}
