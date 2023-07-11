import {ViewTracingTree} from "locklift/internal/tracing/viewTraceTree/viewTracingTree";
import {ViewTraceTree} from "locklift/src/internal/tracing/types";
import {TraceType} from "locklift";

export function calculateMaxCWi(traceTree: ViewTracingTree) {

    function calculateCwi(viewTraceTree: ViewTraceTree, currentCWi: number) {
        const CW_arr: number[] = [];
        const traces = viewTraceTree.outTraces.filter((trace: ViewTraceTree) =>
            trace.type !== TraceType.FUNCTION_RETURN &&
            trace.type !== TraceType.EVENT &&
            trace.type !== TraceType.EVENT_OR_FUNCTION_RETURN
        );

        for (let trace of traces) {
            CW_arr.push(calculateCwi(trace, traces.length * currentCWi));
        }

        return Math.max(currentCWi, ...CW_arr);
    }

    return calculateCwi(traceTree.viewTraceTree, 1);
}