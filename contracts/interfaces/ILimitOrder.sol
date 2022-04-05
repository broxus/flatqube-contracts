pragma ton-solidity >= 0.57.0;

interface ILimitOrder {
    
    enum LimitOrderStatus {
        Initialize,
        AwaitTokens,
        Active,
        Filled,
        SwapInProgress,
        Cancelled
    }

    // Создать events-ы
}