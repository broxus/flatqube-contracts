pragma ton-solidity >= 0.57.0;

import "../structures/IDepositLiquidityResult.sol";

library Math {
    ///////////////////////////////////////////////////////////////////////////////////////////////////////
    // Math
    /*
        Solve x*x + p*x - q*x = 0;
    */
    function solveQuadraticEquationPQ(
        uint256 _p,
        uint256 _q
    ) public returns (uint128) {
        uint256 D = math.muldiv(_p, _p, 4) + _q;
        uint256 Dsqrt = sqrt(D);

        if (Dsqrt > (_p /2)) {
            return uint128(Dsqrt - (_p /2));
        } else {
            return uint128((_p /2) - Dsqrt);
        }
    }

    // Babylonian method for finding sqrt
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

    function calculateExpectedSpendAmount(
        uint128 _bAmount,
        uint128 _aPool,
        uint128 _bPool,
        uint128 _feePoolNumerator,
        uint128 _feeBeneficiaryNumerator,
        uint128 _feeDenominator
    ) public returns (
        uint128,
        uint128
    ) {
        uint128 feeDMinusN = uint128(_feeDenominator - _feePoolNumerator - _feeBeneficiaryNumerator);

        uint128 newBPool = _bPool - _bAmount;
        uint128 newAPool = math.muldivc(_aPool, _bPool, newBPool);

        uint128 expectedAAmount = math.muldivc(
            newAPool - _aPool,
            _feeDenominator,
            feeDMinusN
        );

        uint128 aFee = math.muldivc(
            expectedAAmount,
            _feePoolNumerator + _feeBeneficiaryNumerator,
            _feeDenominator
        );

        return (
            expectedAAmount,
            aFee
        );
    }

    function calculateExpectedDepositLiquidity(
        uint128 _leftAmount,
        uint128 _rightAmount,
        bool _autoChange,
        uint128 _fromReserve,
        uint128 _toReserve,
        uint128 _lpReserve,
        uint128 _feePoolNumerator,
        uint128 _feeBeneficiaryNumerator,
        uint128 _feeDenominator
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
                math.muldiv(_fromReserve, _rightAmount, _toReserve)
            );

            step1RightDeposit = math.min(
                _rightAmount,
                math.muldiv(_toReserve, _leftAmount, _fromReserve)
            );

            step1LpReward = math.max(
                math.muldiv(step1RightDeposit, _lpReserve, _toReserve),
                math.muldiv(step1LeftDeposit, _lpReserve, _fromReserve)
            );
        }

        uint128 currentLeftAmount = _leftAmount - step1LeftDeposit;
        uint128 currentRightAmount = _rightAmount - step1RightDeposit;
        uint128 currentLeftBalance = _fromReserve + step1LeftDeposit;
        uint128 currentRightBalance = _toReserve + step1RightDeposit;
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

        uint256 feeD = uint256(_feeDenominator);
        uint256 feeDMinusN = feeD - uint256(_feePoolNumerator + _feeBeneficiaryNumerator);
        uint256 denominator = feeDMinusN * (feeD - uint256(_feeBeneficiaryNumerator));

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
                _feePoolNumerator,
                _feeBeneficiaryNumerator,
                _feeDenominator
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
                _feePoolNumerator,
                _feeBeneficiaryNumerator,
                _feeDenominator
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

    function calculateExpectedExchange(
        uint128 _aAmount,
        uint128 _aPool,
        uint128 _bPool,
        uint128 _feePoolNumerator,
        uint128 _feeBeneficiaryNumerator,
        uint128 _feeDenominator
    ) public returns (
        uint128,
        uint128,
        uint128
    ) {
        uint128 aFee = math.muldivc(
            _aAmount,
            _feePoolNumerator + _feeBeneficiaryNumerator,
            _feeDenominator
        );

        uint128 aBeneficiaryFee = math.muldiv(
            aFee,
            _feeBeneficiaryNumerator,
            _feePoolNumerator + _feeBeneficiaryNumerator
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
