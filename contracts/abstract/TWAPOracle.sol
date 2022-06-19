pragma ton-solidity >= 0.57.1;

import "@broxus/contracts/contracts/libraries/MsgFlag.sol";

import "../interfaces/ITWAPOracle.sol";
import "../interfaces/IOnObservationCallback.sol";
import "../interfaces/IOnRateCallback.sol";
import "../libraries/FixedPoint128.sol";
import "../libraries/DexErrors.sol";
import "../libraries/DexGas.sol";

/// @title TWAP-Oracle
/// @notice Stores, calculates, and provides prices for DEX pair
/// @dev A contract is abstract - to be sure that it will be inherited by another contract
abstract contract TWAPOracle is ITWAPOracle {
    /// @dev Historical data on prices
    mapping(uint32 => Point) private _points;

    /// @dev Maximum count of points up to 65535
    uint16 private _cardinality = 1000;

    /// @dev A current count of points
    uint16 private _length;

    /// @dev Minimum interval in seconds between points up to 255 seconds(4.25 minutes)
    uint8 private _minInterval = 15;

    /// @dev Minimum rate percent delta in FP128 representation to write the next point
    uint private _minRateDelta = FixedPoint128.div(FixedPoint128.FIXED_POINT_128_MULTIPLIER, 100);

    /// @dev Only the pair's root can call a function with this modifier
    modifier onlyRoot() virtual {
        _;
    }

    /// @dev Needs to be implemented by pair
    /// @return uint128[] Current pair's tokens reserves
    function _reserves() internal view virtual returns (uint128[]);

    function isInitialized() external view responsible override returns (bool) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } !_points.empty();
    }

    function setMinInterval(uint8 _interval) external onlyRoot override {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        // Update minimum interval
        _minInterval = _interval;
        emit OracleMinIntervalUpdated(_interval);
    }

    function getMinInterval() external view responsible override returns (uint8) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _minInterval;
    }

    function setCardinality(uint16 _newCardinality) external onlyRoot override {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        // Check input params
        require(_newCardinality > _cardinality, DexErrors.LOWER_OR_EQUAL_CARDINALITY);

        // Update cardinality
        _cardinality = _newCardinality;
        emit OracleCardinalityUpdated(_newCardinality);
    }

    function getCardinality() external view responsible override returns (uint16) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _cardinality;
    }

    function setMinRateDelta(uint _delta) external onlyRoot override {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        // Update minimum rate percent delta
        _minRateDelta = _delta;
        emit OracleMinRateDeltaUpdated(_delta);
    }

    function getMinRateDelta() external view responsible override returns (uint) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _minRateDelta;
    }

    function getObservation(uint32 _timestamp) external view responsible override returns (optional(Observation)) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _tryGetObservationByTimestamp(_timestamp);
    }

    function observation(
        uint32 _timestamp,
        TvmCell _payload
    ) external view override {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        IOnObservationCallback(msg.sender)
            .onObservationCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_tryGetObservationByTimestamp(_timestamp), _payload);
    }

    function getRate(
        uint32 _fromTimestamp,
        uint32 _toTimestamp
    ) external view responsible override returns (optional(Rate)) {
        return {
            value: 0,
            bounce: false,
            flag: MsgFlag.REMAINING_GAS
        } _calculateRate(
            _fromTimestamp,
            _toTimestamp
        );
    }

    function rate(
        uint32 _fromTimestamp,
        uint32 _toTimestamp,
        TvmCell _payload
    ) external view override {
        tvm.rawReserve(DexGas.PAIR_INITIAL_BALANCE, 0);

        IOnRateCallback(msg.sender)
            .onRateCallback{ value: 0, flag: MsgFlag.ALL_NOT_RESERVED }
            (_calculateRate(_fromTimestamp, _toTimestamp), _payload);
    }

    /// @dev Initializes oracle with the first point
    /// @param _timestamp UNIX timestamp in seconds of observations start
    /// @return bool Whether or not oracle was initialized
    function _initialize(uint32 _timestamp) internal returns (bool) {
        // Check input params and initialization status of the oracle
        require(_points.empty(), DexErrors.ALREADY_INITIALIZED);
        require(_timestamp > 0, DexErrors.NON_POSITIVE_TIMESTAMP);

        Point first = Point(0, 0);

        // Update _points and increase _length
        _points[_timestamp] = first;
        _length += 1;

        emit OracleInitialized(
            Observation(
                _timestamp,
                first.price0To1Cumulative,
                first.price1To0Cumulative
            )
        );

        return true;
    }

    /// @dev Try to write a new point in the historical array
    /// @param _token0ReserveOld Previous token 0 reserve
    /// @param _token1ReserveOld Previous token 1 reserve
    /// @param _timestamp UNIX timestamp in seconds of the observation
    /// @return Observation An observation that was written or an empty observation if it wasn't processed
    function _write(
        uint128 _token0ReserveOld,
        uint128 _token1ReserveOld,
        uint32 _timestamp
    ) internal returns (Observation) {
        // Check that oracle is initialized or return an empty observation
        if (_points.empty()) {
            return Observation(0, 0, 0);
        }

        // Get the last point
        // Safe operation, because we checked _points.empty() previously
        (uint32 lastTimestamp, Point lastPoint) = _points.max().get();

        // Should never occur
        if (_timestamp < lastTimestamp) {
            return Observation(0, 0, 0);
        }

        // Calculate the interval between points and get current reserves
        uint32 timeElapsed = _timestamp - lastTimestamp;
        uint128[] reserves = _reserves();

        // Checking can oracle write this point or return an empty point
        if (timeElapsed < _minInterval) {
            uint rateDelta = _calculateRateDelta(
                reserves[0],
                reserves[1],
                _token0ReserveOld,
                _token1ReserveOld
            );

            if (rateDelta < _minRateDelta) {
                return Observation(0, 0, 0);
            }
        }

        Point next = _createNextPoint(
            lastPoint,
            timeElapsed,
            reserves[0],
            reserves[1]
        );

        // Write a new point
        _points[_timestamp] = next;

        // Increase length or delete the oldest point
        if (_length < _cardinality) {
            _length += 1;
        } else {
            _points.delMin();
        }

        Observation newObservation = Observation(
            _timestamp,
            next.price0To1Cumulative,
            next.price1To0Cumulative
        );

        emit OracleUpdated(newObservation);

        return newObservation;
    }

    /// @notice Calculates TWAP for the given interval
    /// @dev If there is no point with a timestamp equal to _fromTimestamp or _toTimestamp
    /// will take the point with the nearest timestamp
    /// @param _fromTimestamp Start of interval for TWAP
    /// @param _toTimestamp End of interval for TWAP
    /// @return optional(Rate) Packed rate info in the time range between _fromTimestamp and _toTimestamp
    /// or null if impossible to calculate
    function _calculateRate(
        uint32 _fromTimestamp,
        uint32 _toTimestamp
    ) private view returns (optional(Rate)) {
        // Check input params
        require(!_points.empty(), DexErrors.NOT_INITIALIZED);
        require(_fromTimestamp < _toTimestamp, DexErrors.FROM_IS_BIGGER_THAN_TO);
        require(_fromTimestamp > 0, DexErrors.NON_POSITIVE_TIMESTAMP);

        optional(Rate) rateOpt;

        // Find the nearest observations
        Observation fromObservation = _calculateObservation(_fromTimestamp);
        Observation toObservation = _calculateObservation(_toTimestamp);

        // Check if they are the same
        if (fromObservation.timestamp == toObservation.timestamp) {
            // Safe operation, because we checked _points.empty() previously
            (uint32 lastTimestamp,) = _points.max().get();

            // If they equal to the last point then just return reserves ratio
            if (fromObservation.timestamp == lastTimestamp) {
                uint128[] reserves = _reserves();

                rateOpt.set(
                    Rate(
                        FixedPoint128.div(FixedPoint128.encode(reserves[0]), reserves[1]),
                        FixedPoint128.div(FixedPoint128.encode(reserves[1]), reserves[0]),
                        fromObservation.timestamp,
                        toObservation.timestamp
                    )
                );
            }
        } else {
            uint32 timeElapsed = toObservation.timestamp - fromObservation.timestamp;

            rateOpt.set(
                Rate(
                    (toObservation.price0To1Cumulative - fromObservation.price0To1Cumulative) / timeElapsed,
                    (toObservation.price1To0Cumulative - fromObservation.price1To0Cumulative) / timeElapsed,
                    fromObservation.timestamp,
                    toObservation.timestamp
                )
            );
        }

        return rateOpt;
    }

    /// @dev Creates Point structure from given values
    /// @param _previous Last point in _points
    /// @param _timeElapsed Time passed after the last point write
    /// @param _token0Reserve Current reserve of token 0
    /// @param _token1Reserve Current reserve of token 1
    /// @return Point Point created by input params
    function _createNextPoint(
        Point _previous,
        uint32 _timeElapsed,
        uint128 _token0Reserve,
        uint128 _token1Reserve
    ) private pure returns (Point) {
        // Encode reserves to FP128
        uint token0ReserveX128 = FixedPoint128.encode(_token0Reserve);
        uint token1ReserveX128 = FixedPoint128.encode(_token1Reserve);

        // Calculate cumulatives' delta
        uint price0To1CumulativeDelta = FixedPoint128.div(token0ReserveX128 * _timeElapsed, _token1Reserve);
        uint price1To0CumulativeDelta = FixedPoint128.div(token1ReserveX128 * _timeElapsed, _token0Reserve);

        return Point(
            _previous.price0To1Cumulative + price0To1CumulativeDelta,
            _previous.price1To0Cumulative + price1To0CumulativeDelta
        );
    }

    /// @dev Calculates rate delta from given values
    /// @param _token0ReserveNew Current token 0 reserve
    /// @param _token1ReserveNew Current token 1 reserve
    /// @param _token0ReserveOld Previous token 0 reserve
    /// @param _token1ReserveOld Previous token 1 reserve
    /// @return uint Rate's percent delta in FP128 representation
    function _calculateRateDelta(
        uint128 _token0ReserveNew,
        uint128 _token1ReserveNew,
        uint128 _token0ReserveOld,
        uint128 _token1ReserveOld
    ) private pure returns (uint) {
        // Check input params
        if (
            _token0ReserveNew == 0 ||
            _token1ReserveNew == 0 ||
            _token0ReserveOld == 0 ||
            _token1ReserveOld == 0
        ) {
            return 0;
        }

        uint128 numerator = _token0ReserveNew * _token1ReserveOld;
        uint128 denominator = _token0ReserveOld * _token1ReserveNew;

        uint resultX128 = FixedPoint128.div(FixedPoint128.encode(numerator), denominator);
        uint hundredPercentsX128 = FixedPoint128.FIXED_POINT_128_MULTIPLIER;

        // Percent delta can be negative
        return hundredPercentsX128 > resultX128 ? hundredPercentsX128 - resultX128 : resultX128 - hundredPercentsX128;
    }

    /// @dev Calculates observation by timestamp
    /// @param _timestamp Target UNIX timestamp in seconds
    /// @return Observation Observation that equal to target or the nearest
    function _calculateObservation(uint32 _timestamp) private view returns (Observation) {
        uint32 timestamp;
        Point point;

        optional(uint32, Point) opt = _points.nextOrEq(_timestamp);

        // Save equal or next if it exists
        if (opt.hasValue()) {
            (timestamp, point) = opt.get();
        }

        // If we didn't find the exact point then find the closest
        if (timestamp != _timestamp) {
            optional(uint32, Point) prev = _points.prev(_timestamp);

            // Update with the previous point if it's closer
            if (prev.hasValue()) {
                (uint32 prevTimestamp, Point prevPoint) = prev.get();
                bool isPrevCloser = timestamp < 1 || (_timestamp - prevTimestamp < timestamp - _timestamp);

                if (isPrevCloser) {
                    timestamp = prevTimestamp;
                    point = prevPoint;
                }
            }
        }

        return Observation(
            timestamp,
            point.price0To1Cumulative,
            point.price1To0Cumulative
        );
    }

    /// @dev Try to find observation with the target timestamp
    /// @param _timestamp Target UNIX timestamp in seconds
    /// @return optional(Observation) Observation with target timestamp or null if it doesn't exist
    function _tryGetObservationByTimestamp(uint32 _timestamp) private view returns (optional(Observation)) {
        optional(Point) pointOpt = _points.fetch(_timestamp);
        optional(Observation) observationOpt;

        // Set if exists
        if (pointOpt.hasValue()) {
            Point point = pointOpt.get();

            observationOpt.set(
                Observation(
                    _timestamp,
                    point.price0To1Cumulative,
                    point.price1To0Cumulative
                )
            );
        }

        return observationOpt;
    }

    /// @dev Pack all oracle's data for a contract upgrade
    /// @return TvmCell Packed data to unpack after code upgrade
    function _packAllOracleData() internal view returns (TvmCell) {
        TvmBuilder builder;

        builder.store(_points);
        builder.store(_cardinality);
        builder.store(_length);
        builder.store(_minInterval);
        builder.store(_minRateDelta);

        return builder.toCell();
    }
}
