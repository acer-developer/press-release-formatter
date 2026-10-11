import { emptyAiSettings, type AiSettings } from "@/lib/ai/providers";

const KEY = "rating-note-studio:ai-settings";

/** AI keys are stored only in this browser (localStorage) and sent only to the chosen provider. */
export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyAiSettings(), ...JSON.parse(raw) } : emptyAiSettings();
  } catch {
    return emptyAiSettings();
  }
}

export function saveAiSettings(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or blocked storage: settings last for this session only.
  }
}
