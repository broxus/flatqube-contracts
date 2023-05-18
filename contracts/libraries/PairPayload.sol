pragma ton-solidity >= 0.62.0;

import "../structures/IExchangeStepStructure.sol";
import "../structures/ITokenOperationStructure.sol";
import "../structures/INextExchangeData.sol";

import "./DexOperationStatusV2.sol";
import "./DexOperationTypes.sol";
import "./DexErrors.sol";

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
        address _outcoming,
        address _referrer,
        optional(TvmCell) _successPayload,
        optional(TvmCell) _cancelPayload
    ) public returns (TvmCell) {
        require(!_cancelPayload.hasValue() || _successPayload.hasValue(), DexErrors.INVALID_SUCCESS_PAYLOAD);

        TvmBuilder builder;

        builder.store(DexOperationTypes.EXCHANGE_V2);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(_referrer);

        TvmBuilder otherDataBuilder;
        builder.store(otherDataBuilder.toCell()); // ref1

        builder.store(abi.encode(_expectedAmount, _outcoming)); // ref2

        if (_successPayload.hasValue()) {
            builder.store(_successPayload.get());
        }
        if (_cancelPayload.hasValue()) {
            builder.store(_cancelPayload.get());
        }

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
        address _recipient,
        address _referrer,
        optional(TvmCell) _successPayload,
        optional(TvmCell) _cancelPayload
    ) public returns (TvmCell) {
        require(!_cancelPayload.hasValue() || _successPayload.hasValue(), DexErrors.INVALID_SUCCESS_PAYLOAD);

        TvmBuilder builder;

        builder.store(DexOperationTypes.DEPOSIT_LIQUIDITY_V2);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(_referrer);

        TvmBuilder otherDataBuilder;
        builder.store(otherDataBuilder.toCell()); // ref1

        builder.store(abi.encode(_expectedAmount)); // ref2

        if (_successPayload.hasValue()) {
            builder.store(_successPayload.get());
        }
        if (_cancelPayload.hasValue()) {
            builder.store(_cancelPayload.get());
        }

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
        address _recipient,
        address _referrer,
        optional(TvmCell) _successPayload,
        optional(TvmCell) _cancelPayload
    ) public returns (TvmCell) {
        require(!_cancelPayload.hasValue() || _successPayload.hasValue(), DexErrors.INVALID_SUCCESS_PAYLOAD);

        TvmBuilder builder;

        builder.store(DexOperationTypes.WITHDRAW_LIQUIDITY_V2);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(_referrer);

        TvmBuilder otherDataBuilder;
        builder.store(otherDataBuilder.toCell()); // ref1

        builder.store(abi.encode(_expectedAmounts)); // ref2

        if (_successPayload.hasValue()) {
            builder.store(_successPayload.get());
        }
        if (_cancelPayload.hasValue()) {
            builder.store(_cancelPayload.get());
        }

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
        address _outcoming,
        address _referrer,
        optional(TvmCell) _successPayload,
        optional(TvmCell) _cancelPayload
    ) public returns (TvmCell) {
        require(!_cancelPayload.hasValue() || _successPayload.hasValue(), DexErrors.INVALID_SUCCESS_PAYLOAD);

        TvmBuilder builder;

        builder.store(DexOperationTypes.WITHDRAW_LIQUIDITY_ONE_COIN);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(_referrer);

        TvmBuilder otherDataBuilder;
        builder.store(otherDataBuilder.toCell()); // ref1

        builder.store(abi.encode(_expectedAmount, _outcoming)); // ref2

        if (_successPayload.hasValue()) {
            builder.store(_successPayload.get());
        }
        if (_cancelPayload.hasValue()) {
            builder.store(_cancelPayload.get());
        }

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
        require(_steps.length > 0, DexErrors.INVALID_NEXT_STEPS);

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
        address[] _pools,
        address _referrer,
        optional(TvmCell) _successPayload,
        optional(TvmCell) _cancelPayload
    ) public returns (TvmCell) {
        require(_steps.length > 0, DexErrors.INVALID_NEXT_STEPS);
        require(!_cancelPayload.hasValue() || _successPayload.hasValue(), DexErrors.INVALID_SUCCESS_PAYLOAD);

        TvmBuilder builder;

        builder.store(DexOperationTypes.CROSS_PAIR_EXCHANGE_V2);
        builder.store(_id);
        builder.store(_deployWalletGrams);
        builder.store(_recipient);
        builder.store(_referrer);

        INextExchangeData.NextExchangeData[] nextSteps;
        for (uint32 idx : _nextStepIndices) {
            require(idx < _steps.length);

            (TvmCell nextPayload, uint32 nestedNodes, uint32 leaves) = _encodeCrossPairExchangeData(_steps, _pools, idx);
            nextSteps.push(INextExchangeData.NextExchangeData(
                _steps[idx].numerator,
                _pools[idx],
                nextPayload,
                nestedNodes,
                leaves
            ));
        }

        TvmBuilder otherDataBuilder;
        builder.store(otherDataBuilder.toCell()); // ref1

        TvmCell nextStepsCell = abi.encode(_expectedAmount, _outcoming, nextSteps);
        builder.store(nextStepsCell); // ref2

        if (_successPayload.hasValue()) {
            builder.store(_successPayload.get());
        }
        if (_cancelPayload.hasValue()) {
            builder.store(_cancelPayload.get());
        }

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
            require(idx < _steps.length);

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
        INextExchangeData.NextExchangeData[],
        address
    ) {
        TvmSlice slice = _payload.toSlice();

        uint8 op;

        if (slice.bits() >= 8) {
            op = slice.decode(uint8);
        }

        if (
            op == DexOperationTypes.EXCHANGE
            || op == DexOperationTypes.DEPOSIT_LIQUIDITY
            || op == DexOperationTypes.WITHDRAW_LIQUIDITY
            || op == DexOperationTypes.CROSS_PAIR_EXCHANGE
        ) {
            return _decodeOnAcceptTokensTransferDataV1(_payload);
        } else {
            return _decodeOnAcceptTokensTransferDataV2(_payload);
        }
    }

    function _decodeOnAcceptTokensTransferDataV1(TvmCell _payload) private returns (
        bool,
        uint8,
        uint64,
        uint128,
        address,
        uint128[],
        address,
        INextExchangeData.NextExchangeData[],
        address
    ) {
        TvmSlice slice = _payload.toSlice();

        // Check size
        bool isValid = slice.bits() >= 200;

        // Default empty params
        uint8 op;
        uint64 id;
        uint128 deployWalletGrams;
        uint128[] expectedAmounts;
        address nextTokenRoot;
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

            if (slice.bits() >= 128) {
                uint128 expectedAmount = slice.decode(uint128);
                expectedAmounts.push(expectedAmount);
            }

            if (slice.bits() >= 267 && op == DexOperationTypes.CROSS_PAIR_EXCHANGE) {
                nextTokenRoot = slice.decode(address);
            }

            if (slice.refs() >= 1 && op == DexOperationTypes.CROSS_PAIR_EXCHANGE && nextTokenRoot.value != 0) {
                TvmCell nextStepsData = slice.loadRef();
                nextSteps.push(INextExchangeData.NextExchangeData(
                    1,
                    nextTokenRoot,
                    nextStepsData,
                    0,
                    1
                ));
            }
        }

        return (
            isValid,
            op,
            id,
            deployWalletGrams,
            address(0), // recipient
            expectedAmounts,
            address(0), //outcoming
            nextSteps,
            address(0) // referrer
        );
    }

    function _decodeOnAcceptTokensTransferDataV2(TvmCell _payload) private returns (
        bool,
        uint8,
        uint64,
        uint128,
        address,
        uint128[],
        address,
        INextExchangeData.NextExchangeData[],
        address
    ) {
        TvmSlice slice = _payload.toSlice();

        // Check size
        bool isValid = slice.bits() >= 734;

        // Default empty params
        uint8 op;
        uint64 id;
        uint128 deployWalletGrams;
        optional(uint128) expectedAmount;
        address recipient;
        address outcoming;
        uint128[] expectedAmounts;
        INextExchangeData.NextExchangeData[] nextSteps;
        address referrer;

        if (isValid) {
            (
                op,
                id,
                deployWalletGrams,
                recipient,
                referrer
            ) = slice.decode(
                uint8,
                uint64,
                uint128,
                address,
                address
            );

            if (slice.refs() >= 1) {
                slice.loadRef(); // ref1
            }

            if (slice.refs() >= 1) {
                TvmCell dataCell = slice.loadRef(); // ref2
                if (op == DexOperationTypes.EXCHANGE_V2) {
                    (expectedAmount, outcoming) = abi.decode(dataCell, (uint128, address));
                }
                if (op == DexOperationTypes.DEPOSIT_LIQUIDITY_V2) {
                    expectedAmount = abi.decode(dataCell, uint128);
                }
                if (op == DexOperationTypes.WITHDRAW_LIQUIDITY_V2) {
                    expectedAmounts = abi.decode(dataCell, uint128[]);
                }
                if (op == DexOperationTypes.WITHDRAW_LIQUIDITY_ONE_COIN) {
                    (expectedAmount, outcoming) = abi.decode(dataCell, (uint128, address));
                }
                if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE_V2) {
                    (expectedAmount, outcoming, nextSteps) = abi.decode(dataCell, (uint128, address, INextExchangeData.NextExchangeData[]));
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
            nextSteps,
            referrer
        );
    }

    /**
     * @notice Decode user's payloads from onAcceptTokensTransfer callback
     * @param _payload Payload from transfer callback
     * @return bool Whether or not success payload exists
     * @return TvmCell Payload for success
     * @return bool Whether or not cancel payload exists
     * @return TvmCell Payload for cancel
     */
    function decodeOnAcceptTokensTransferPayloads(TvmCell _payload, uint8 op) public returns (
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

        TvmCell successPayload;
        TvmCell cancelPayload;

        if (refs == 0) {
            return (notifySuccess, successPayload, notifyCancel, cancelPayload);
        }

        if (
            op == DexOperationTypes.EXCHANGE ||
            op == DexOperationTypes.DEPOSIT_LIQUIDITY ||
            op == DexOperationTypes.WITHDRAW_LIQUIDITY
        ) {
            notifySuccess = refs >= 1;
            notifyCancel = refs >= 2;
        } else if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE) {
            notifySuccess = refs >= 2;
            notifyCancel = refs >= 3;

            slice.loadRef();
        } else {
            notifySuccess = refs >= 3;
            notifyCancel = refs == 4;

            slice.loadRef();
            slice.loadRef();
        }

        if (notifySuccess) { successPayload = slice.loadRef(); }

        if (notifyCancel) { cancelPayload = slice.loadRef(); }

        return (
            notifySuccess,
            successPayload,
            notifyCancel,
            cancelPayload
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

    function buildCancelPayload(
        uint8 op,
        uint16 errorCode,
        TvmCell origPayload,
        INextExchangeData.NextExchangeData[] nextSteps
    ) public returns (TvmCell) {
        if (op == DexOperationTypes.EXCHANGE
            || op == DexOperationTypes.DEPOSIT_LIQUIDITY
            || op == DexOperationTypes.WITHDRAW_LIQUIDITY
            || op == DexOperationTypes.CROSS_PAIR_EXCHANGE) {

            return origPayload;
        }

        TvmBuilder builder;

        builder.store(DexOperationStatusV2.CANCEL);
        builder.store(op);
        builder.store(errorCode);
        builder.store(origPayload);

        if (op == DexOperationTypes.CROSS_PAIR_EXCHANGE_V2) {
            TvmBuilder data;

            // if there are no next steps leaves = 1
            uint32 leaves = nextSteps.length == 0 ? 1 : 0;
            for (INextExchangeData.NextExchangeData step: nextSteps) {
                leaves += step.leaves;
            }

            data.store(leaves);

            builder.store(data.toCell());
            builder.store(abi.encode(nextSteps));
        }

        return builder.toCell();
    }

    function buildSuccessPayload(
        uint8 op,
        TvmCell origPayload,
        address senderAddress
    ) public returns (TvmCell) {
        if (op == DexOperationTypes.EXCHANGE
            || op == DexOperationTypes.DEPOSIT_LIQUIDITY
            || op == DexOperationTypes.WITHDRAW_LIQUIDITY
            || op == DexOperationTypes.CROSS_PAIR_EXCHANGE) {

            return origPayload;
        }

        TvmBuilder builder;

        builder.store(DexOperationStatusV2.SUCCESS);
        builder.store(op);
        builder.store(origPayload);

        TvmBuilder data;
        data.store(senderAddress);

        builder.store(data.toCell());

        return builder.toCell();
    }
}
