import Config, { setConfig } from "./config";
import * as CustomText from "./test/custom-text";
import * as TestLogic from "./test/test-logic";
import * as TestState from "./test/test-state";
import * as ManualRestart from "./test/manual-restart-tracker";
import * as StenoState from "./steno-state";
import * as PractiseWords from "./test/practise-words";
import * as Commandline from "./commandline/commandline";
import * as ConfigEvent from "./observables/config-event";
import { onDOMReady } from "./utils/dom";
export { isEnabled } from "./steno-state";

export const categoryKeys = [
  "briefs",
  "words",
  "phrases",
  "wordSets",
  "numbers",
  "times",
  "dates",
] as const;

export type StenoCategoryKey = (typeof categoryKeys)[number];

type CategorySettings = {
  enabled: boolean;
  randomize: boolean;
  percent: number;
  text: string;
};

type Settings = {
  masterRandomize: boolean;
  categories: Record<StenoCategoryKey, CategorySettings>;
};

type PracticeEntry = {
  text: string;
  hint: string;
};

const labels: Record<StenoCategoryKey, string> = {
  briefs: "briefs",
  words: "words",
  phrases: "phrases",
  wordSets: "word sets",
  numbers: "numbers",
  times: "times",
  dates: "dates",
};

const defaultSettings: Settings = {
  masterRandomize: false,
  categories: {
    briefs: { enabled: true, randomize: false, percent: 100, text: "" },
    words: { enabled: true, randomize: false, percent: 100, text: "" },
    phrases: { enabled: true, randomize: false, percent: 100, text: "" },
    wordSets: { enabled: true, randomize: false, percent: 100, text: "" },
    numbers: { enabled: true, randomize: false, percent: 100, text: "" },
    times: { enabled: true, randomize: false, percent: 100, text: "" },
    dates: { enabled: true, randomize: false, percent: 100, text: "" },
  },
};

const storageKey = "stenoPracticeSettings";

let activeEntries: PracticeEntry[] = [];
let bound = false;
let starting = false;

export function getActiveEntries(): string[] {
  return activeEntries.map((entry) => entry.text);
}

export function getCategoryLabel(key: StenoCategoryKey): string {
  return labels[key];
}

function formatThemeName(theme: string): string {
  return theme.replace(/_/g, " ");
}

function updateThemeLabels(): void {
  document.querySelectorAll(".stenoThemeLabel").forEach((label) => {
    label.textContent = formatThemeName(Config.theme);
  });
}

function syncMissedControls(): void {
  const input = document.querySelector<HTMLInputElement>(
    "#stenoMissedOccurrences",
  );
  if (input === null) return;
  input.value = `${PractiseWords.getStenoMissedOccurrences()}`;
}

function applyMissedOccurrencesFromUi(): void {
  const input = document.querySelector<HTMLInputElement>(
    "#stenoMissedOccurrences",
  );
  if (input === null) return;

  const currentValue = PractiseWords.getStenoMissedOccurrences();
  const nextValue = Number.parseInt(input.value, 10);
  if (Number.isNaN(nextValue)) {
    input.value = `${currentValue}`;
    return;
  }
  if (nextValue === currentValue) return;

  PractiseWords.setStenoMissedOccurrences(nextValue);
  const normalizedValue = `${PractiseWords.getStenoMissedOccurrences()}`;
  input.value = normalizedValue;

  if (PractiseWords.rebuildStenoMissedPractice()) {
    ManualRestart.set();
    TestLogic.restart({
      practiseMissed: true,
      noAnim: true,
    });
  }
}

function updateMissedOccurrences(count: number): void {
  PractiseWords.setStenoMissedOccurrences(count);
  syncMissedControls();

  if (PractiseWords.rebuildStenoMissedPractice()) {
    ManualRestart.set();
    TestLogic.restart({
      practiseMissed: true,
      noAnim: true,
    });
  }
}

function readSettings(): Settings {
  const raw = localStorage.getItem(storageKey);
  if (raw === null) return structuredClone(defaultSettings);

  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      masterRandomize: parsed.masterRandomize ?? false,
      categories: Object.fromEntries(
        categoryKeys.map((key) => [
          key,
          {
            ...defaultSettings.categories[key],
            ...parsed.categories?.[key],
          },
        ]),
      ) as Settings["categories"],
    };
  } catch {
    return structuredClone(defaultSettings);
  }
}

function writeSettings(settings: Settings): void {
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

function getLines(text: string): PracticeEntry[] {
  return text
    .split(/\r?\n/g)
    .map((line) => {
      const [entry = "", ...hintParts] = line.split("\t");
      return {
        text: entry.trim(),
        hint: hintParts.join("\t").trim(),
      };
    })
    .filter((entry) => entry.text !== "");
}

function shuffle<T>(array: T[]): T[] {
  const ret = [...array];
  for (let i = ret.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ret[i], ret[j]] = [ret[j] as T, ret[i] as T];
  }
  return ret;
}

function applyPercent(
  entries: PracticeEntry[],
  percent: number,
): PracticeEntry[] {
  const normalizedPercent = Math.max(0, Math.min(100, percent));
  if (normalizedPercent === 100) return entries;
  return entries.slice(
    0,
    Math.ceil(entries.length * (normalizedPercent / 100)),
  );
}

function getPercentFromInput(key: StenoCategoryKey, fallback: number): number {
  const value = document.querySelector<HTMLInputElement>(
    `#stenoControls [data-percent="${key}"]`,
  )?.value;
  if (value === undefined || value === "") return fallback;

  const percent = Number.parseInt(value, 10);
  if (Number.isNaN(percent)) return fallback;
  return Math.max(0, Math.min(100, percent));
}

function buildEntries(settings: Settings): PracticeEntry[] {
  const categoryStarts = new Map<number, string>();
  const hints = new Map<number, string>();
  let nextIndex = 0;
  const grouped = categoryKeys.flatMap((key) => {
    const category = settings.categories[key];
    if (!category.enabled) return [];

    let entries = getLines(category.text);
    if (category.randomize) entries = shuffle(entries);
    entries = applyPercent(entries, category.percent);

    if (entries.length > 0) categoryStarts.set(nextIndex, labels[key]);
    entries.forEach((entry, index) => {
      if (entry.hint !== "") hints.set(nextIndex + index, entry.hint);
    });
    nextIndex += entries.length;
    return entries;
  });

  if (!settings.masterRandomize) {
    StenoState.setCategoryStarts(categoryStarts);
    StenoState.setHints(hints);
    return grouped;
  }

  const randomized = shuffle(grouped);
  StenoState.setCategoryStarts(new Map<number, string>());
  StenoState.setHints(
    new Map(
      randomized.flatMap((entry, index) =>
        entry.hint === "" ? [] : [[index, entry.hint]],
      ),
    ),
  );
  return randomized;
}

function applySettings(): void {
  const settings = readSettings();
  activeEntries = buildEntries(settings);

  if (activeEntries.length === 0) {
    activeEntries = [
      { text: "Paste entries on the steno content page", hint: "" },
    ];
    StenoState.setHints(new Map());
  }

  StenoState.setEntryCount(activeEntries.length);
  CustomText.setText(activeEntries.map((entry) => entry.text));
  CustomText.setMode("repeat");
  CustomText.setLimitMode("word");
  CustomText.setLimitValue(activeEntries.length);
  CustomText.setPipeDelimiter(true);
  if (Config.mode !== "custom") setConfig("mode", "custom");
}

function updateCounts(settings: Settings): void {
  for (const key of categoryKeys) {
    const category = settings.categories[key];
    const total = getLines(category.text).length;
    const selected = category.enabled
      ? applyPercent(
          category.randomize
            ? shuffle(getLines(category.text))
            : getLines(category.text),
          category.percent,
        ).length
      : 0;
    const count = document.querySelector<HTMLElement>(
      `#stenoControls [data-count="${key}"]`,
    );
    if (count) count.textContent = `${selected} / ${total}`;
    document
      .querySelector<HTMLElement>(`#stenoControls [data-category="${key}"]`)
      ?.classList.toggle("empty", total === 0);
  }
}

function syncControlsFromSettings(settings: Settings): void {
  const master = document.querySelector<HTMLInputElement>(
    "#stenoMasterRandomize",
  );
  if (master) master.checked = settings.masterRandomize;

  for (const key of categoryKeys) {
    const category = settings.categories[key];
    const enabled = document.querySelector<HTMLInputElement>(
      `#stenoControls [data-enabled="${key}"]`,
    );
    const randomize = document.querySelector<HTMLInputElement>(
      `#stenoControls [data-randomize="${key}"]`,
    );
    const percent = document.querySelector<HTMLInputElement>(
      `#stenoControls [data-percent="${key}"]`,
    );
    const content = document.querySelector<HTMLTextAreaElement>(
      `#stenoContent [data-content="${key}"]`,
    );
    if (enabled) enabled.checked = category.enabled;
    if (randomize) randomize.checked = category.randomize;
    if (percent) percent.value = `${category.percent}`;
    if (content) content.value = category.text;
  }
  updateCounts(settings);
}

function saveFromUi(): void {
  const settings = readSettings();
  const master = document.querySelector<HTMLInputElement>(
    "#stenoMasterRandomize",
  );
  settings.masterRandomize = master?.checked ?? false;

  for (const key of categoryKeys) {
    settings.categories[key] = {
      enabled:
        document.querySelector<HTMLInputElement>(
          `#stenoControls [data-enabled="${key}"]`,
        )?.checked ?? true,
      randomize:
        document.querySelector<HTMLInputElement>(
          `#stenoControls [data-randomize="${key}"]`,
        )?.checked ?? false,
      percent: getPercentFromInput(key, settings.categories[key].percent),
      text:
        document.querySelector<HTMLTextAreaElement>(
          `#stenoContent [data-content="${key}"]`,
        )?.value ?? "",
    };
  }

  writeSettings(settings);
  applySettings();
  updateCounts(settings);
}

function setControlsFrozen(frozen: boolean): void {
  document
    .querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
    >(
      "#stenoControls input, #stenoControls button, #stenoContent textarea, #stenoContent button",
    )
    .forEach((control) => {
      control.disabled = frozen;
    });
  document.querySelector("#stenoControls")?.classList.toggle("frozen", frozen);
}

function showSetup(): void {
  document.body.classList.add("stenoSetup");
  document.body.classList.remove("stenoSession");
}

function showSession(): void {
  document.body.classList.add("stenoSession");
  document.body.classList.remove("stenoSetup");
}

function startSession(): void {
  if (starting) return;
  starting = true;
  PractiseWords.resetBefore();
  saveFromUi();
  showSession();
  setControlsFrozen(false);
  TestLogic.restart({ noAnim: true });
  setTimeout(() => {
    starting = false;
  }, 250);
}

function restartSession(): void {
  TestLogic.restart({ noAnim: true });
}

function returnToContent(): void {
  showSetup();
  setControlsFrozen(false);
  TestLogic.restart({ noAnim: true });
}

function focusSessionRestart(event: KeyboardEvent): void {
  if (!document.body.classList.contains("stenoSession")) return;
  if (event.key !== "Tab" || event.shiftKey) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  document.querySelector<HTMLButtonElement>("#stenoRestart")?.focus();
}

function showThemeSelector(): void {
  Commandline.show({ subgroupOverride: "themes" });
}

function bind(): void {
  if (document.querySelector("#stenoStart") === null) {
    setTimeout(bind, 50);
    return;
  }
  if (bound) return;
  bound = true;

  document.body.classList.add("stenoPractice");
  showSetup();
  const settings = readSettings();
  syncControlsFromSettings(settings);
  applySettings();
  updateThemeLabels();
  syncMissedControls();

  const startButton = document.querySelector("#stenoStart");
  startButton?.addEventListener("pointerdown", startSession);
  startButton?.addEventListener("mousedown", startSession);
  startButton?.addEventListener("click", startSession);

  const restartButton = document.querySelector("#stenoRestart");
  restartButton?.addEventListener("pointerdown", restartSession);
  restartButton?.addEventListener("mousedown", restartSession);
  restartButton?.addEventListener("click", restartSession);

  document.querySelectorAll(".stenoTheme").forEach((button) => {
    button.addEventListener("pointerdown", showThemeSelector);
    button.addEventListener("mousedown", showThemeSelector);
    button.addEventListener("click", showThemeSelector);
  });

  const contentButton = document.querySelector("#stenoBackToContent");
  contentButton?.addEventListener("pointerdown", returnToContent);
  contentButton?.addEventListener("mousedown", returnToContent);
  contentButton?.addEventListener("click", returnToContent);

  document
    .querySelector<HTMLTextAreaElement>("#wordsInput")
    ?.addEventListener("keydown", focusSessionRestart, { capture: true });

  document.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement) {
      if (event.target.id === "stenoMissedOccurrences") {
        applyMissedOccurrencesFromUi();
      }
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement) {
      if (event.target.id === "stenoMissedOccurrences") {
        applyMissedOccurrencesFromUi();
      }
    }
  });
  document.addEventListener("keyup", (event) => {
    if (event.target instanceof HTMLInputElement) {
      if (event.target.id === "stenoMissedOccurrences") {
        window.setTimeout(applyMissedOccurrencesFromUi, 0);
      }
    }
  });
  document.addEventListener("pointerup", (event) => {
    if (event.target instanceof HTMLInputElement) {
      if (event.target.id === "stenoMissedOccurrences") {
        window.setTimeout(applyMissedOccurrencesFromUi, 0);
      }
    }
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("#stenoMissedDecrease")) {
      updateMissedOccurrences(PractiseWords.getStenoMissedOccurrences() - 1);
    }
    if (target.closest("#stenoMissedIncrease")) {
      updateMissedOccurrences(PractiseWords.getStenoMissedOccurrences() + 1);
    }
  });
  window.setInterval(() => {
    if (document.body.classList.contains("stenoMissedPractice")) {
      applyMissedOccurrencesFromUi();
    }
  }, 250);

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("#stenoControls, #stenoContent")) return;
    saveFromUi();
  });

  document.addEventListener(
    "blur",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.matches("#stenoControls [data-percent]")) return;
      syncControlsFromSettings(readSettings());
    },
    true,
  );
}

export function sync(): void {
  setControlsFrozen(TestState.isActive);
}

onDOMReady(bind);

ConfigEvent.subscribe(({ key }) => {
  if (key === "theme") updateThemeLabels();
});
