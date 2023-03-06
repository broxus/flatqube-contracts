pragma ton-solidity >= 0.62.0;

import "../libraries/DexGas.sol";

import "../structures/IGasValueStructure.sol";

library GasValues {
    function _getDeployWalletGas() private returns(IGasValueStructure.GasValue) {
        return IGasValueStructure.GasValue(
            DexGas.DEPLOY_EMPTY_WALLET_GRAMS + DexGas.TOKEN_ROOT_COMPENSATION,
            DexGas.DEPLOY_WALLET_EXTRA_GAS
        );
    }

    // GENERAL

    function getMintTokensGas() private returns(IGasValueStructure.GasValue) {
        return IGasValueStructure.GasValue(
            DexGas.TOKEN_ROOT_COMPENSATION,
            DexGas.MINT_TOKENS_EXTRA_GAS
        );
    }

    function getTokenDataGas() private returns(IGasValueStructure.GasValue) {
        return IGasValueStructure.GasValue(
            DexGas.TOKEN_ROOT_COMPENSATION,
            DexGas.GET_TOKEN_DATA_EXTRA_GAS
        );
    }

    function getCreateTokenGas() private returns(IGasValueStructure.GasValue) {
        return IGasValueStructure.GasValue(
            DexGas.TOKEN_ROOT_INITIAL_BALANCE,
            DexGas.DEPLOY_TOKEN_ROOT_EXTRA_GAS + DexGas.TRANSFER_ROOT_OWNERSHIP_VALUE + DexGas.CREATE_TOKEN_EXTRA_GAS
        );
    }

    function getReferralProgramGas() private returns(IGasValueStructure.GasValue) {
        return IGasValueStructure.GasValue(
            DexGas.REFERRAL_DEPLOY_EMPTY_WALLET_GRAMS,
            DexGas.REFERRAL_PROGRAM_CALLBACK + DexGas.REFERRER_FEE_EXTRA_GAS
        );
    }

    // ROOT

    function getSetFeeParamsGas() internal pure returns(IGasValueStructure.GasValue) {
        return GasValue(
            DexGas.DEX_POOL_COMPENSATION + DexGas.DEX_ROOT_COMPENSATION,
            DexGas.SET_FEE_PARAMS_EXTRA_GAS
        );
    }

    function getDeployTokenVaultGas() internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue deployWallet = _getDeployWalletGas();
        return GasValue(
            DexGas.VAULT_INITIAL_VALUE + DexGas.DEX_ROOT_COMPENSATION + 2 * deployWallet.fixedValue,
            DexGas.DEPLOY_TOKEN_VAULT_EXTRA_GAS + 2 * deployWallet.dynamicGas
        );
    }

    function getDeployTokenVaultGas() internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue deployWallet = _getDeployWalletGas();
        return GasValue(
            DexGas.VAULT_INITIAL_VALUE + DexGas.DEX_ROOT_COMPENSATION + 2 * deployWallet.fixedValue,
            DexGas.DEPLOY_TOKEN_VAULT_EXTRA_GAS + 2 * deployWallet.dynamicGas
        );
    }

    function getDeployPoolGas(uint8 N) internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue deployWallet = _getDeployWalletGas();
        IGasValueStructure.GasValue createToken = getCreateTokenGas();
        IGasValueStructure.GasValue tokenData = getTokenDataGas();
        IGasValueStructure.GasValue deployDexTokenVault = getDeployTokenVaultGas();

        return GasValue(
            DexGas.PAIR_INITIAL_BALANCE +
            DexGas.DEX_ROOT_COMPENSATION +
            createToken.fixedValue +
            2 * N * tokenData.fixedValue + // token_symbols + token_decimals
            (N + 1) * deployDexTokenVault.fixedValue +
            (N + 1) * deployWallet.fixedValue,

            DexGas.DEPLOY_LP_TOKEN_EXTRA_GAS +
            DexGas.DEPLOY_POOL_EXTRA_GAS +
            createToken.dynamicGas +
            2 * N * tokenData.dynamicGas + // token_symbols + token_decimals
            (N + 1) * deployDexTokenVault.dynamicGas +
            (N + 1) * deployWallet.dynamicGas
        );
    }

    function getDeployAccountGas() internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue deployWallet = _getDeployWalletGas();
        return GasValue(
            DexGas.ACCOUNT_INITIAL_BALANCE + DexGas.DEX_ROOT_COMPENSATION,
            DexGas.DEPLOY_ACCOUNT_EXTRA_GAS
        );
    }

    // ACCOUNT

    function getAddPoolGas(uint8 N) internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue deployWallet = _getDeployWalletGas();
        return GasValue(
            DexGas.DEX_ACCOUNT_COMPENSATION + N * deployWallet.fixedValue,
            DexGas.ADD_POOL_EXTRA_GAS + N * deployWallet.dynamicGas
        );
    }

    function getAccountWithdrawGas(uint128 _deployWalletValue) internal pure returns(IGasValueStructure.GasValue) {
        return GasValue(
            DexGas.DEX_ACCOUNT_COMPENSATION + DexGas.DEX_TOKEN_VAULT_COMPENSATION + _deployWalletValue,
            DexGas.TRANSFER_TOKENS_VALUE + DexGas.ACCOUNT_WITHDRAW_EXTRA_GAS
        );
    }

    function getAccountTransferGas() internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue deployWallet = _getDeployWalletGas();
        return GasValue(
            2 * DexGas.DEX_ACCOUNT_COMPENSATION + DexGas.OPERATION_CALLBACK + deployWallet.fixedValue,
            DexGas.ACCOUNT_TRANSFER_EXTRA_GAS + deployWallet.dynamicGas
        );
    }

    function getAccountExchangeGas() internal pure returns(IGasValueStructure.GasValue) {
        return GasValue(
            DexGas.DEX_ACCOUNT_COMPENSATION + DexGas.OPERATION_CALLBACK + DexGas.DEX_POOL_COMPENSATION,
            2 * DexGas.INTERNAL_PAIR_TRANSFER_VALUE + // receive_token transfer + beneficiary_fee transfer
            DexGas.ACCOUNT_EXCHANGE_EXTRA_GAS
        );
    }

    function getAccountDepositGas(uint8 N, address referrer) internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue mintToken = getMintTokensGas();
        IGasValueStructure.GasValue referralProgram = getReferralProgramGas();

        return GasValue(
            DexGas.DEX_ACCOUNT_COMPENSATION +
            DexGas.DEX_POOL_COMPENSATION +
            DexGas.OPERATION_CALLBACK +
            DexGas.DEPLOY_EMPTY_WALLET_GRAMS +
            mintToken.fixedValue +
            referrer.value != 0 ? N * referralProgram.fixedValue : 0,

            DexGas.ACCOUNT_DEPOSIT_EXTRA_GAS +
            mintToken.dynamicGas +
            referrer.value != 0 ? N * referralProgram.dynamicGas : 0
        );
    }

    function getAccountWithdrawLiquidityGas(uint8 N) internal pure returns(IGasValueStructure.GasValue) {
        return GasValue(
            DexGas.DEX_ACCOUNT_COMPENSATION + DexGas.OPERATION_CALLBACK + DexGas.DEX_POOL_COMPENSATION,
            N * DexGas.INTERNAL_PAIR_TRANSFER_VALUE + DexGas.BURN_VALUE + DexGas.ACCOUNT_WITHDRAW_LP_EXTRA_GAS
        );
    }

    // POOL

    function getPoolDirectExchangeGas(uint128 _deployWalletValue, address referrer) internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue referralProgram = getReferralProgramGas();
        return GasValue(
            2 * DexGas.OPERATION_CALLBACK +
            DexGas.DEX_POOL_COMPENSATION +
            _deployWalletValue +
            referrer.value != 0 ? referralProgram.fixedValue : 0,

            DexGas.INTERNAL_PAIR_TRANSFER_VALUE + // beneficiary_fee transfer
            DexGas.TRANSFER_TOKENS_VALUE +
            DexGas.DIRECT_EXCHANGE_EXTRA_GAS +
            referrer.value != 0 ? referralProgram.dynamicGas : 0
        );
    }

    function getPoolDirectDepositGas(uint128 _deployWalletValue, address referrer) internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue referralProgram = getReferralProgramGas();
        return GasValue(
            2 * DexGas.OPERATION_CALLBACK +
            DexGas.DEX_POOL_COMPENSATION +
            _deployWalletValue +
            referrer.value != 0 ? referralProgram.fixedValue : 0,

            DexGas.TRANSFER_TOKENS_VALUE +
            DexGas.DIRECT_DEPOSIT_EXTRA_GAS +
            referrer.value != 0 ? referralProgram.dynamicGas : 0
        );
    }

    function getPoolDirectWithdrawGas(uint8 N, uint128 _deployWalletValue, address referrer) internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue referralProgram = getReferralProgramGas();
        return GasValue(
            2 * DexGas.OPERATION_CALLBACK +
            DexGas.DEX_POOL_COMPENSATION +
            N * _deployWalletValue +
            referrer.value != 0 ? N * referralProgram.fixedValue : 0,

            N * DexGas.TOKEN_VAULT_TRANSFER +
            DexGas.DIRECT_WITHDRAW_EXTRA_GAS +
            referrer.value != 0 ? N * referralProgram.dynamicGas : 0
        );
    }

    function getPoolDirectWithdrawOneCoinGas(uint128 _deployWalletValue, address referrer) internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue referralProgram = getReferralProgramGas();
        return GasValue(
            2 * DexGas.OPERATION_CALLBACK +
            DexGas.DEX_POOL_COMPENSATION +
            _deployWalletValue +
            referrer.value != 0 ? referralProgram.fixedValue : 0,

            DexGas.TOKEN_VAULT_TRANSFER +
            DexGas.DIRECT_WITHDRAW_EXTRA_GAS +
            referrer.value != 0 ? referralProgram.dynamicGas : 0
        );
    }

    function getPoolCrossExchangeStepGas(uint128 _deployWalletValue, address referrer) internal pure returns(IGasValueStructure.GasValue) {
        IGasValueStructure.GasValue referralProgram = getReferralProgramGas();
        return GasValue(
            2 * DexGas.OPERATION_CALLBACK +
            DexGas.DEX_POOL_COMPENSATION +
            _deployWalletValue +
            referrer.value != 0 ? referralProgram.fixedValue : 0,

            DexGas.CROSS_EXCHANGE_STEP_EXTRA_GAS +
            referrer.value != 0 ? referralProgram.dynamicGas : 0
        );
    }
}
