pragma ton-solidity >= 0.57.0;

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
}
