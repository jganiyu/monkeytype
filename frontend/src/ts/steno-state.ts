export function isEnabled(): boolean {
  return document.body.classList.contains("stenoPractice");
}

let categoryStarts = new Map<number, string>();
let entryCount = 0;

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
