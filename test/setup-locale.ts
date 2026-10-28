import { displayLocale } from "@/lib/time";

// Dates follow the browser's locale; tests read the French one whatever the
// machine's own, so they pass the same on every host and in CI.
displayLocale.current = "fr-FR";
