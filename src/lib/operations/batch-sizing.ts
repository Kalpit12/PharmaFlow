export type BatchSizingResult = {
  validatedBatchSize: number | null;
  wholeBatchCount: number | null;
  partialBatchRemainder: number;
  isPartialBatch: boolean;
  /** Quantity recorded on ProductionBatch (may include partial run). */
  plannedBatchQuantity: number;
};

export function computeBatchSizing(quantity: number, validatedBatchSize: number | null | undefined): BatchSizingResult {
  if (!validatedBatchSize || validatedBatchSize <= 0) {
    return {
      validatedBatchSize: null,
      wholeBatchCount: null,
      partialBatchRemainder: 0,
      isPartialBatch: false,
      plannedBatchQuantity: quantity,
    };
  }

  const whole = Math.floor(quantity / validatedBatchSize);
  const remainder = quantity % validatedBatchSize;
  const isPartialBatch = remainder > 0;

  return {
    validatedBatchSize,
    wholeBatchCount: whole + (isPartialBatch ? 1 : 0),
    partialBatchRemainder: remainder,
    isPartialBatch,
    plannedBatchQuantity: isPartialBatch ? remainder : validatedBatchSize * Math.max(1, whole),
  };
}
