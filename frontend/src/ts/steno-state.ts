export function isEnabled(): boolean {
  return document.body.classList.contains("stenoPractice");
}

let categoryStarts = new Map<number, string>();
let entryCount = 0;
let hints = new Map<number, string>();
let strokeAttempts = new Map<number, number>();

export function setCategoryStarts(starts: Map<number, string>): void {
  categoryStarts = starts;
}

export function getCategoryStartLabel(index: number): string | undefined {
  return categoryStarts.get(index);
}

export function setEntryCount(count: number): void {
  entryCount = count;
}

export function getEntryCount(): number {
  return entryCount;
}

export function setHints(nextHints: Map<number, string>): void {
  hints = nextHints;
  strokeAttempts = new Map();
}

export function getHint(index: number): string | undefined {
  return hints.get(index);
}

export function getExpectedStrokeCount(index: number): number {
  return hints.get(index)?.split("/").length ?? 1;
}

export function recordStrokeAttempt(index: number): void {
  strokeAttempts.set(index, (strokeAttempts.get(index) ?? 0) + 1);
}

export function getStrokeAttempts(index: number): number {
  return strokeAttempts.get(index) ?? 0;
}

export function resetStrokeAttempts(index: number): void {
  strokeAttempts.delete(index);
}
