import * as TestWords from "./test-words";
import * as Notifications from "../elements/notifications";
import Config, { setConfig } from "../config";
import * as CustomText from "./custom-text";
import * as TestInput from "./test-input";
import * as ConfigEvent from "../observables/config-event";
import * as StenoState from "../steno-state";
import { setCustomTextName } from "../states/custom-text-name";
import { Mode } from "@monkeytype/schemas/shared";
import { CustomTextSettings } from "@monkeytype/schemas/results";

type Before = {
  mode: Mode | null;
  punctuation: boolean | null;
  numbers: boolean | null;
  customText: CustomTextSettings | null;
};

type InitOptions = {
  occurrencesPerWord?: number;
  steno?: boolean;
};

export const before: Before = {
  mode: null,
  punctuation: null,
  numbers: null,
  customText: null,
};

let stenoMissedOccurrences = 1;
let active = false;
let stenoMissedBaseWords: string[] = [];

function syncStenoMissedClass(): void {
  document.body.classList.toggle("stenoMissedPractice", active);
}

export function isActive(): boolean {
  return active;
}

export function getStenoMissedOccurrences(): number {
  return stenoMissedOccurrences;
}

export function setStenoMissedOccurrences(count: number): void {
  if (Number.isNaN(count)) return;
  stenoMissedOccurrences = Math.max(1, Math.min(20, count));
  if (document.body.classList.contains("stenoMissedPractice")) active = true;
}

function buildStenoMissedText(): string[] {
  return stenoMissedBaseWords.flatMap((word) =>
    Array.from({ length: stenoMissedOccurrences }, () => word),
  );
}

export function rebuildStenoMissedPractice(): boolean {
  if (!active && !document.body.classList.contains("stenoMissedPractice")) {
    return false;
  }
  if (stenoMissedBaseWords.length === 0) return false;
  const text = buildStenoMissedText();
  CustomText.setText(text);
  CustomText.setLimitMode("word");
  CustomText.setMode("repeat");
  CustomText.setLimitValue(text.length);
  StenoState.setEntryCount(text.length);
  StenoState.setCategoryStarts(new Map([[0, "missed words"]]));
  StenoState.setHints(new Map());
  return true;
}

export function init(
  missed: "off" | "words" | "biwords",
  slow: boolean,
  options: InitOptions = {},
): boolean {
  if (Config.mode === "zen") return false;
  let limit;
  if ((missed === "words" && !slow) || (missed === "off" && slow)) {
    limit = 20;
  } else {
    // (biwords) or (missed-words and slow) or (biwords and slow)
    limit = 10;
  }

  // missed word, previous word, count
  let sortableMissedWords: [string, number][] = [];
  if (missed === "words") {
    Object.keys(TestInput.missedWords).forEach((missedWord) => {
      const missedWordCount = TestInput.missedWords[missedWord];
      if (missedWordCount !== undefined) {
        sortableMissedWords.push([missedWord, missedWordCount]);
      }
    });
    sortableMissedWords.sort((a, b) => {
      return b[1] - a[1];
    });
    sortableMissedWords = sortableMissedWords.slice(0, limit);
  }

  let sortableMissedBiwords: [string, string, number][] = [];
  if (missed === "biwords") {
    for (let i = 0; i < TestWords.words.length; i++) {
      const missedWord = TestWords.words.get(i);
      const missedWordCount = TestInput.missedWords[missedWord];
      if (missedWordCount !== undefined) {
        if (i === 0) {
          sortableMissedBiwords.push([missedWord, "", missedWordCount]);
        } else {
          sortableMissedBiwords.push([
            missedWord,
            TestWords.words.get(i - 1),
            missedWordCount,
          ]);
        }
      }
    }
    sortableMissedBiwords.sort((a, b) => {
      return b[2] - a[2];
    });
    sortableMissedBiwords = sortableMissedBiwords.slice(0, limit);
  }

  if (
    ((missed === "words" && sortableMissedWords.length === 0) ||
      (missed === "biwords" && sortableMissedBiwords.length === 0)) &&
    !slow
  ) {
    Notifications.add("You haven't missed any words", 0);
    return false;
  }

  let sortableSlowWords: [string, number][] = [];
  if (slow) {
    const typedWords = TestWords.words
      .get()
      .slice(0, TestInput.input.getHistory().length - 1);

    sortableSlowWords = typedWords.map((e, i) => [
      e,
      TestInput.burstHistory[i] ?? 0,
    ]);
    sortableSlowWords.sort((a, b) => {
      return a[1] - b[1];
    });
    sortableSlowWords = sortableSlowWords.slice(
      0,
      Math.min(limit, Math.round(typedWords.length * 0.2)),
    );
    if (sortableSlowWords.length === 0) {
      Notifications.add("Test too short to classify slow words.", 0);
    }
  }

  // console.log(sortableMissedWords);
  // console.log(sortableMissedBiwords);
  // console.log(sortableSlowWords);

  if (
    sortableMissedWords.length === 0 &&
    sortableMissedBiwords.length === 0 &&
    sortableSlowWords.length === 0
  ) {
    Notifications.add("Could not start a new custom test", 0);
    return false;
  }

  const newCustomText: string[] = [];
  const occurrencesPerWord = options.occurrencesPerWord;
  sortableMissedWords.forEach((missed) => {
    for (let i = 0; i < (occurrencesPerWord ?? missed[1]); i++) {
      newCustomText.push(missed[0]);
    }
  });

  sortableMissedBiwords.forEach((missedBiwords) => {
    for (let i = 0; i < (occurrencesPerWord ?? missedBiwords[2]); i++) {
      if (missedBiwords[1] !== "") {
        newCustomText.push(missedBiwords[1] + " " + missedBiwords[0]);
      } else {
        newCustomText.push(missedBiwords[0]);
      }
    }
  });

  sortableSlowWords.forEach((slow, index) => {
    for (let i = 0; i < sortableSlowWords.length - index; i++) {
      newCustomText.push(slow[0]);
    }
  });

  const mode = before.mode ?? Config.mode;
  const punctuation = before.punctuation ?? Config.punctuation;
  const numbers = before.numbers ?? Config.numbers;

  let customText = null;
  if (Config.mode === "custom") {
    customText = CustomText.getData();
  }

  active = options.steno === true;
  setConfig("mode", "custom", {
    nosave: true,
  });
  if (options.steno === true && missed === "words" && !slow) {
    stenoMissedBaseWords = sortableMissedWords.map(([word]) => word);
  }
  CustomText.setPipeDelimiter(true);
  CustomText.setText(newCustomText);
  CustomText.setLimitMode(options.steno === true ? "word" : "section");
  CustomText.setMode(options.steno === true ? "repeat" : "shuffle");
  CustomText.setLimitValue(
    options.steno === true
      ? newCustomText.length
      : (sortableSlowWords.length +
          sortableMissedWords.length +
          sortableMissedBiwords.length) *
          5,
  );

  setCustomTextName("practise", undefined);

  before.mode = mode;
  before.punctuation = punctuation;
  before.numbers = numbers;
  before.customText = customText;
  if (active) {
    StenoState.setEntryCount(newCustomText.length);
    StenoState.setCategoryStarts(new Map([[0, "missed words"]]));
    StenoState.setHints(new Map());
  }
  syncStenoMissedClass();

  return true;
}

export function resetBefore(): void {
  before.mode = null;
  before.punctuation = null;
  before.numbers = null;
  before.customText = null;
  active = false;
  stenoMissedBaseWords = [];
  syncStenoMissedClass();
}

ConfigEvent.subscribe(({ key }) => {
  if (key === "mode" && !active) resetBefore();
});
