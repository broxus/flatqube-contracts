pragma ton-solidity >= 0.57.0;

import "../structures/IExchangeStepStructure.sol";
import "../structures/ITokenOperationStructure.sol";
import "../structures/INextExchangeData.sol";

import "./DexOperationTypes.sol";

/**
 * @title DEX Pair Payloads Utility
 * @notice Utility for building pair's payloads
 */
library PairPayload {
    /**
     * @notice Build payload for TIP-3 token transfer with exchange operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @param _expectedAmount Minimum token amount after swap
     * @return TvmCell Encoded payload for transfer
     */
    function buildExchangePayload(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.EXCHANGE);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_expectedAmount);

        return builder.toCell();
    }

    /// @notice Build payload for exchange call
    /// @param _id ID of the call
    /// @param _deployWalletGrams Amount for new wallet deploy
    /// @param _expectedAmount Expected receive amount
    /// @param _recipient Address of the receiver
    /// @param _outcoming Received token root
    /// @return TvmCell Encoded payload
    function buildExchangePayloadV2(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        address _recipient,
        address _outcoming
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.EXCHANGE_V2);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_expectedAmount);
        builder.store(_recipient);
        builder.store(_outcoming);

        return builder.toCell();
    }

    /**
     * @notice Build payload for TIP-3 token transfer with liquidity deposit operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @return TvmCell Encoded payload for transfer
     */
    function buildDepositLiquidityPayload(
        uint64 _id,
        uint128 _deployWalletGrams
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.DEPOSIT_LIQUIDITY);
        builder.store(_id);
        builder.store(_deployWalletGrams);

        return builder.toCell();
    }

    /**
     * @notice Build payload for TIP-3 token transfer with liquidity deposit operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @param _expectedAmount Minimum LP token amount after deposit
     * @param _recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildDepositLiquidityPayloadV2(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        address _recipient
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.DEPOSIT_LIQUIDITY_V2);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_expectedAmount);
        builder.store(_recipient);

        return builder.toCell();
    }

    /**
     * @notice Build payload for TIP-3 token transfer with liquidity withdrawal operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @return TvmCell Encoded payload for transfer
     */
    function buildWithdrawLiquidityPayload(
        uint64 _id,
        uint128 _deployWalletGrams
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.WITHDRAW_LIQUIDITY);
        builder.store(_id);
        builder.store(_deployWalletGrams);

        return builder.toCell();
    }

    /**
     * @notice Build payload for TIP-3 token transfer with liquidity withdrawal operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @param _expectedAmounts Minimum pair's token amounts after withdrawal
     * @param _recipient Address of the receiver
     * @return TvmCell Encoded payload for transfer
     */
    function buildWithdrawLiquidityPayloadV2(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128[] _expectedAmounts,
        address _recipient
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.WITHDRAW_LIQUIDITY_V2);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(abi.encode(_expectedAmounts));

        return builder.toCell();
    }

    /// @notice Build payload for single coin withdrawal call
    /// @param _id ID of the call
    /// @param _deployWalletGrams Amount for new wallet deploy
    /// @param _expectedAmount Expected receive amount
    /// @return TvmCell Encoded payload
    function buildWithdrawLiquidityOneCoinPayload(
        uint64 _id,
        uint128 _deployWalletGrams,
        address _recipient,
        uint128 _expectedAmount,
        address _outcoming
    ) public returns (TvmCell) {
        TvmBuilder builder;

        builder.store(DexOperationTypes.WITHDRAW_LIQUIDITY_ONE_COIN);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_expectedAmount);
        builder.store(_recipient);
        builder.store(_outcoming);

        return builder.toCell();
    }

    /**
     * @notice Build payload for TIP-3 token transfer with cross-pair exchange operation
     * @param _id ID of the call
     * @param _deployWalletGrams Amount of EVER for a new TIP-3 wallet deploy
     * @param _expectedAmount Minimum token amount after the first swap
     * @param _steps Next pairs' root and expected amount
     * @return TvmCell Encoded payload for transfer
     */
    function buildCrossPairExchangePayload(
        uint64 _id,
        uint128 _deployWalletGrams,
        uint128 _expectedAmount,
        ITokenOperationStructure.TokenOperation[] _steps
    ) public returns (TvmCell) {
        // Check that at least 1 next pair is exists
        require(_steps.length > 0);

        // Pack data for the first pair
        TvmBuilder builder;

        builder.store(DexOperationTypes.CROSS_PAIR_EXCHANGE);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_expectedAmount);
        builder.store(_steps[0].root);

        // Pack data for next pairs
        TvmBuilder nextStepBuilder;

        nextStepBuilder.store(_steps[_steps.length - 1].amount);

        for (uint i = _steps.length - 1; i > 0; i--) {
            TvmBuilder currentStepBuilder;

            currentStepBuilder.store(_steps[i - 1].amount, _steps[i].root);
            currentStepBuilder.store(nextStepBuilder.toCell());

            nextStepBuilder = currentStepBuilder;
        }

        builder.store(nextStepBuilder.toCell());

        return builder.toCell();
    }

    /// @notice Build payload for cross-exchange call
    /// @param _id ID of the call
    /// @param _deployWalletGrams Amount for new wallet deploy
    /// @param _recipient Address of the receiver
    /// @param _expectedAmount Expected receive amount
    /// @param _steps Steps for exchanging
    /// @param _pools Pairs' addresses for exchanging
    /// @return TvmCell Encoded payload
    function buildCrossPairExchangePayloadV2(
        uint64 _id,
        uint128 _deployWalletGrams,
        address _recipient,
        uint128 _expectedAmount,
        address _outcoming,
        uint32[] _nextStepIndices,
        IExchangeStepStructure.ExchangeStep[] _steps,
        address[] _pools
    ) public returns (TvmCell) {
        require(_steps.length > 0);

        TvmBuilder builder;

        builder.store(DexOperationTypes.CROSS_PAIR_EXCHANGE_V2);
        builder.store(_id);
        builder.store(_deployWalletGrams);

        builder.store(_expectedAmount);
        builder.store(_recipient);
        builder.store(_outcoming);

        INextExchangeData.NextExchangeData[] nextSteps;
        for (uint32 idx : _nextStepIndices) {
            (TvmCell nextPayload, uint32 nestedNodes, uint32 leaves) = _encodeCrossPairExchangeData(_steps, _pools, idx);
            nextSteps.push(INextExchangeData.NextExchangeData(
                _steps[idx].numerator,
                _pools[idx],
                nextPayload,
                nestedNodes,
                leaves
            ));
        }

        TvmCell nextStepsCell = abi.encode(nextSteps);
        builder.store(nextStepsCell);

        return builder.toCell();
    }

    function _encodeCrossPairExchangeData(
        IExchangeStepStructure.ExchangeStep[] _steps,
        address[] _pools,
        uint32 _currentIdx
    ) private returns (TvmCell, uint32, uint32) {
        INextExchangeData.NextExchangeData[] nextSteps;
        uint32 nextLevelNodes = 0;
        uint32 nextLevelLeaves = 0;
        for (uint32 idx : _steps[_currentIdx].nextStepIndices) {
            (TvmCell nextPayload, uint32 nestedNodes, uint32 leaves) = _encodeCrossPairExchangeData(_steps, _pools, idx);
            nextLevelNodes += nestedNodes;
            nextLevelLeaves += leaves;
            nextSteps.push(INextExchangeData.NextExchangeData(
                _steps[idx].numerator,
                _pools[idx],
                nextPayload,
                nestedNodes,
                leaves
            ));
        }

        return (
            abi.encode(_steps[_currentIdx].amount, _steps[_currentIdx].outcoming, nextSteps),
            nextLevelNodes + uint32(nextSteps.length),
            nextSteps.length > 0 ? nextLevelLeaves : 1
        );
    }

    /**
     * @notice Decode user's params from onAcceptTokensTransfer callback
     * @param _payload Payload from transfer callback
     * @return bool Whether or not payload is valid
     * @return uint8 ID of the call
     * @return uint64 Type of the operation
     * @return uint128 Amount of EVER for a new TIP-3 wallet deploy
     * @return address Address of the receiver
     * @return uint128 Expected amount or expected left amount for liquidity withdrawal
     * @return uint128 Expected right amount for liquidity withdrawal
     * @return address Next TokenRoot address for cross-pair exchange
     */
    function decodeOnAcceptTokensTransferData(TvmCell _payload) public returns (
        bool,
        uint8,
        uint64,
        uint128,
        address,
        uint128[],
        address,
        INextExchangeData.NextExchangeData[]
    ) {
        TvmSlice slice = _payload.toSlice();

        // Check size
        bool isValid = slice.bits() >= 200;

        // Default empty params
        uint8 op;
        uint64 id;
        uint128 deployWalletGrams;
        optional(uint128) expectedAmount;
        address recipient;
        address nextTokenRoot;
        address outcoming;
        uint128[] expectedAmounts;
        INextExchangeData.NextExchangeData[] nextSteps;

        if (isValid) {
            (
                op,
                id,
                deployWalletGrams
            ) = slice.decode(
                uint8,
                uint64,
                uint128
            );

            if (slice.bits() >= 128 && op != DexOperationTypes.WITHDRAW_LIQUIDITY_V2) {
                expectedAmount = slice.decode(uint128);
            }

            if (slice.bits() >= 267 && op == DexOperationTypes.CROSS_PAIR_EXCHANGE) {
                nextTokenRoot = slice.decode(address);
            }

            if (slice.bits() >= 267) {
                recipient = slice.decode(address);
            }

            if (slice.bits() >= 267) {
                outcoming = slice.decode(address);
            }

            if (slice.refs() >= 1) {
                TvmCell dataCell = slice.loadRef();
                if (op == DexOperationTypes.WITHDRAW_LIQUIDITY_V2) {
                    expectedAmounts = abi.decode(dataCell, uint128[]);
                }
                if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE_V2) {
                    nextSteps = abi.decode(dataCell, INextExchangeData.NextExchangeData[]);
                }
                if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE && nextTokenRoot.value != 0) {
                    nextSteps.push(INextExchangeData.NextExchangeData(
                            1,
                            nextTokenRoot,
                            dataCell,
                            1,
                            1
                        ));
                }
            }
        }

        return (
            isValid,
            op,
            id,
            deployWalletGrams,
            recipient,
            expectedAmount.hasValue() ? [expectedAmount.get()] : expectedAmounts,
            outcoming,
            nextSteps
        );
    }

    /**
     * @notice Decode user's payloads from onAcceptTokensTransfer callback
     * @param _payload Payload from transfer callback
     * @return bool Whether or not success payload exists
     * @return TvmCell Payload for success
     * @return bool Whether or not cancel payload exists
     * @return TvmCell Payload for cancel
     * @return bool Whether or not other data exists
     * @return TvmCell Other data
     */
    function decodeOnAcceptTokensTransferPayloads(TvmCell _payload, uint8 op) public returns (
        bool,
        TvmCell,
        bool,
        TvmCell,
        bool,
        TvmCell
    ) {
        TvmSlice slice = _payload.toSlice();
        uint8 refs = slice.refs();

        // Check size
        bool notifySuccess;
        bool notifyCancel;
        bool hasRef3;

        TvmCell successPayload;
        TvmCell cancelPayload;
        TvmCell ref3;

        if (op == DexOperationTypes.WITHDRAW_LIQUIDITY_V2 ||
            op == DexOperationTypes.CROSS_PAIR_EXCHANGE ||
            op == DexOperationTypes.CROSS_PAIR_EXCHANGE_V2) {

            notifySuccess = refs >= 2;
            notifyCancel = refs >= 3;
            hasRef3 = refs == 4;

            slice.loadRef();
        } else {
            notifySuccess = refs >= 1;
            notifyCancel = refs >= 2;
            hasRef3 = refs >= 3;
        }

        if (notifySuccess) { successPayload = slice.loadRef(); }

        if (notifyCancel) { cancelPayload = slice.loadRef(); }

        if (hasRef3) { ref3 = slice.loadRef(); }

        return (
            notifySuccess,
            successPayload,
            notifyCancel,
            cancelPayload,
            hasRef3,
            ref3
        );
    }

    /**
     * @notice Decode payload from the previous pair
     * @param _payload Payload from the previous pair
     * @param _op Operation type
     * @return uint128 Minimum token amount after swap
     * @return address Received token's root address
     * @return INextExchangeData.NextExchangeData[] List of the next pools
     */
    function decodeCrossPoolExchangePayload(TvmCell _payload, uint8 _op) public returns (
        uint128,
        address,
        INextExchangeData.NextExchangeData[]
    ) {
        uint128 expectedAmount;
        address outcoming;
        INextExchangeData.NextExchangeData[] nextSteps;

        if (_op == DexOperationTypes.CROSS_PAIR_EXCHANGE) {
            TvmSlice slice = _payload.toSlice();

            expectedAmount = slice.decode(uint128);
            bool hasNextPayload = slice.refs() >= 1;

            if (hasNextPayload) {
                address tokenRoot = slice.bits() >= 267 ? slice.decode(address) : address(0);
                nextSteps.push(INextExchangeData.NextExchangeData(
                    1,
                    tokenRoot,
                    slice.loadRef(),
                    1,
                    1
                ));
            }
        } else if (_op == DexOperationTypes.CROSS_PAIR_EXCHANGE_V2) {
            (expectedAmount, outcoming, nextSteps) = abi.decode(_payload, (uint128, address, INextExchangeData.NextExchangeData[]));
        }

        return (
            expectedAmount,
            outcoming,
            nextSteps
        );
    }
}
