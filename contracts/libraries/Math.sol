pragma ton-solidity >= 0.57.0;

import "../structures/IDepositLiquidityResult.sol";
import "../structures/IFeeParams.sol";

/// @title Pair's Math Utility
library Math {
    /// @notice Solve x^2 + _p * x - _q * x = 0
    /// @param _p First coefficient
    /// @param _q Second coefficient
    /// @return uint128 Equation's positive root
    function solveQuadraticEquationPQ(
        uint256 _p,
        uint256 _q
    ) public returns (uint128) {
        // Find discriminant
        uint256 D = math.muldiv(_p, _p, 4) + _q;

        // Calculate discriminant's square root
        uint256 Dsqrt = sqrt(D);

        // Calculate positive equation's root
        if (Dsqrt > (_p /2)) {
            return uint128(Dsqrt - (_p /2));
        } else {
            return uint128((_p /2) - Dsqrt);
        }
    }

    /// @notice Babylonian method for finding sqrt
    /// @param _x Number to calculate square root
    /// @return uint256 Positive root
    function sqrt(uint256 _x) public returns (uint256) {
        if (_x == 0) return 0;

        uint256 xx = _x;
        uint256 r = 1;

        if (xx >= 0x100000000000000000000000000000000) {
            xx >>= 128;
            r <<= 64;
        }

        if (xx >= 0x10000000000000000) {
            xx >>= 64;
            r <<= 32;
        }

        if (xx >= 0x100000000) {
            xx >>= 32;
            r <<= 16;
        }

        if (xx >= 0x10000) {
            xx >>= 16;
            r <<= 8;
        }

        if (xx >= 0x100) {
            xx >>= 8;
            r <<= 4;
        }

        if (xx >= 0x10) {
            xx >>= 4;
            r <<= 2;
        }

        if (xx >= 0x8) {
            r <<= 1;
        }

        r = (r + _x / r) >> 1;
        r = (r + _x / r) >> 1;
        r = (r + _x / r) >> 1;
        r = (r + _x / r) >> 1;
        r = (r + _x / r) >> 1;
        r = (r + _x / r) >> 1;
        r = (r + _x / r) >> 1;

        uint256 r1 = _x / r;

        return (r < r1 ? r : r1);
    }

    /// @notice Calculate input amount and fee for exchange
    /// @param _bAmount Output amount
    /// @param _aPool Input token reserve
    /// @param _bPool Output token reserve
    /// @param _fee Pair's fee params
    /// @return uint256 Positive root
    function calculateExpectedSpendAmount(
        uint128 _bAmount,
        uint128 _aPool,
        uint128 _bPool,
        IFeeParams.FeeParams _fee
    ) public returns (
        uint128,
        uint128
    ) {
        uint128 feeDMinusN = uint128(_fee.denominator - _fee.pool_numerator - _fee.beneficiary_numerator);

        uint128 newBPool = _bPool - _bAmount;
        uint128 newAPool = math.muldivc(_aPool, _bPool, newBPool);

        uint128 expectedAAmount = math.muldivc(
            newAPool - _aPool,
            _fee.denominator,
            feeDMinusN
        );

        uint128 aFee = math.muldivc(
            expectedAAmount,
            _fee.pool_numerator + _fee.beneficiary_numerator,
            _fee.denominator
        );

        return (
            expectedAAmount,
            aFee
        );
    }

    /// @notice Calculate liquidity deposit result and fees
    /// @param _leftAmount Left token amount
    /// @param _rightAmount Right token amount
    /// @param _autoChange Whether or not keep ratio
    /// @param _leftReserve Left token reserve
    /// @param _rightReserve Right token reserve
    /// @param _lpReserve LP token reserve
    /// @param _fee Pair's fee params
    /// @return uint256 Deposit result and fees
    function calculateExpectedDepositLiquidity(
        uint128 _leftAmount,
        uint128 _rightAmount,
        bool _autoChange,
        uint128 _leftReserve,
        uint128 _rightReserve,
        uint128 _lpReserve,
        IFeeParams.FeeParams _fee
    ) public returns (
        IDepositLiquidityResult.DepositLiquidityResult,
        uint128,
        uint128
    ) {
        if (_lpReserve == 0) {
            return (
                IDepositLiquidityResult.DepositLiquidityResult(
                    _leftAmount,
                    _rightAmount,
                    math.max(_leftAmount, _rightAmount),
                    false, false, 0, 0, 0, 0, 0, 0
                ),
                0,
                0
            );
        }

        // step 1 (first deposit)
        uint128 step1LeftDeposit;
        uint128 step1RightDeposit;
        uint128 step1LpReward;

        if (_leftAmount > 0 && _rightAmount > 0) {
            step1LeftDeposit = math.min(
                _leftAmount,
                math.muldiv(_leftReserve, _rightAmount, _rightReserve)
            );

            step1RightDeposit = math.min(
                _rightAmount,
                math.muldiv(_rightReserve, _leftAmount, _leftReserve)
            );

            step1LpReward = math.max(
                math.muldiv(step1RightDeposit, _lpReserve, _rightReserve),
                math.muldiv(step1LeftDeposit, _lpReserve, _leftReserve)
            );
        }

        uint128 currentLeftAmount = _leftAmount - step1LeftDeposit;
        uint128 currentRightAmount = _rightAmount - step1RightDeposit;
        uint128 currentLeftBalance = _leftReserve + step1LeftDeposit;
        uint128 currentRightBalance = _rightReserve + step1RightDeposit;
        uint128 currentLpSupply = _lpReserve + step1LpReward;

        bool step2LeftToRight = false;
        bool step2RightToLeft = false;
        uint128 step2Spent = 0;
        uint128 step2PoolFee = 0;
        uint128 step2BeneficiaryFee = 0;
        uint128 step2Received = 0;

        uint128 step3LeftDeposit = 0;
        uint128 step3RightDeposit = 0;
        uint128 step3LpReward = 0;

        uint256 feeD = uint256(_fee.denominator);
        uint256 feeDMinusN = feeD - uint256(_fee.pool_numerator + _fee.beneficiary_numerator);
        uint256 denominator = feeDMinusN * (feeD - uint256(_fee.beneficiary_numerator));

        if (_autoChange && currentRightAmount > 0) {
            // step 2 (surplus RIGHT exchange)
            step2RightToLeft = true;

            uint256 p = math.muldiv(
                uint256(currentRightBalance),
                feeD * (feeDMinusN + feeD),
                denominator
            );

            uint256 q = math.muldiv(
                uint256(currentRightBalance),
                feeD * feeD * uint256(currentRightAmount),
                denominator
            );

            step2Spent = solveQuadraticEquationPQ(p, q);

            (
                step2Received,
                step2PoolFee,
                step2BeneficiaryFee
            ) = calculateExpectedExchange(
                step2Spent,
                currentRightBalance,
                currentLeftBalance,
                _fee
            );

            currentRightAmount = currentRightAmount - step2Spent;
            currentRightBalance = currentRightBalance + step2Spent - step2BeneficiaryFee;

            if (currentRightAmount > 0 && step2Received > 0) {
                // step 3 (deposit exchanged amounts)
                step3RightDeposit = currentRightAmount;
                step3LeftDeposit = step2Received;

                step3LpReward = math.muldiv(currentRightAmount, currentLpSupply, currentRightBalance);
            } else {
                step2RightToLeft = false;
                step1RightDeposit = _rightAmount;
            }
        } else if (_autoChange && currentLeftAmount > 0) {
            // step 2 (surplus LEFT exchange)
            step2LeftToRight = true;

            uint256 p = math.muldiv(
                uint256(currentLeftBalance),
                feeD * (feeDMinusN + feeD),
                denominator
            );

            uint256 q = math.muldiv(
                uint256(currentLeftBalance),
                feeD * feeD * uint256(currentLeftAmount),
                denominator
            );

            step2Spent = solveQuadraticEquationPQ(p, q);

            (
                step2Received,
                step2PoolFee,
                step2BeneficiaryFee
            ) = calculateExpectedExchange(
                step2Spent,
                currentLeftBalance,
                currentRightBalance,
                _fee
            );

            currentLeftAmount = currentLeftAmount - step2Spent;
            currentLeftBalance = currentLeftBalance + step2Spent - step2BeneficiaryFee;

            if (currentLeftAmount > 0 && step2Received > 0) {
                // step 3 (deposit exchanged amounts)
                step3LeftDeposit = currentLeftAmount;
                step3RightDeposit = step2Received;

                step3LpReward = math.muldiv(currentLeftAmount, currentLpSupply, currentLeftBalance);
            } else {
                step2LeftToRight = false;
                step1LeftDeposit = _leftAmount;
            }
        }

        return (
            IDepositLiquidityResult.DepositLiquidityResult(
                step1LeftDeposit,
                step1RightDeposit,
                step1LpReward,

                step2LeftToRight,
                step2RightToLeft,
                step2Spent,
                step2PoolFee + step2BeneficiaryFee,
                step2Received,

                step3LeftDeposit,
                step3RightDeposit,
                step3LpReward
            ),
            step2PoolFee,
            step2BeneficiaryFee
        );
    }

    /// @notice Calculate output amount and fee for exchange
    /// @param _aAmount Input amount
    /// @param _aPool Input token reserve
    /// @param _bPool Output token reserve
    /// @param _fee Pair's fee params
    /// @return uint256 Expected output amount and fees
    function calculateExpectedExchange(
        uint128 _aAmount,
        uint128 _aPool,
        uint128 _bPool,
        IFeeParams.FeeParams _fee
    ) public returns (
        uint128,
        uint128,
        uint128
    ) {
        uint128 aFee = math.muldivc(
            _aAmount,
            _fee.pool_numerator + _fee.beneficiary_numerator,
            _fee.denominator
        );

        uint128 aBeneficiaryFee = math.muldiv(
            aFee,
            _fee.beneficiary_numerator,
            _fee.pool_numerator + _fee.beneficiary_numerator
        );

        uint128 aPoolFee = aFee - aBeneficiaryFee;

        uint128 newAPool = _aPool + _aAmount;
        uint128 newBPool = math.muldivc(_aPool, _bPool, newAPool - aFee);
        uint128 expectedBAmount = _bPool - newBPool;

        return (
            expectedBAmount,
            aPoolFee,
            aBeneficiaryFee
        );
    }
}
