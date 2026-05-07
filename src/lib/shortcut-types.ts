export type ShortcutKeyBinding =
  | string
  | {
      key: string;
      alt?: boolean;
      code?: string;
      ctrl?: boolean;
      display?: string;
      hiddenFromDisplay?: boolean;
      meta?: boolean;
      mod?: boolean;
      shift?: boolean;
    };
