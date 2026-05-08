import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  ShortcutIntentProvider,
  useOptionHeld,
  useShortcutIntentEffect,
  useShortcutIntentEffects,
} from "@/hooks/use-shortcuts";
import type { DeviceId, FloorId } from "@/types/map";
import { seedMapStore } from "../../test/storeHarness";

const did = (s: string) => s as DeviceId;
const fid = (s: string) => s as FloorId;

const dispatchKeyDown = (init: KeyboardEventInit) => {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { ...init, bubbles: true }),
  );
};

const RegisterTool = ({
  action,
  run,
}: {
  action: "tool-wall" | "tool-pc";
  run: () => void;
}) => {
  useShortcutIntentEffect(action, run);
  return null;
};

afterEach(() => {
  cleanup();
});

describe("ShortcutIntentProvider", () => {
  it("invokes the registered effect when its key combo fires in canvas scope", () => {
    seedMapStore({
      activeDrawTool: "device",
      currentFloorId: fid("floor-1"),
      isEditMode: true,
      selectedDeviceId: null,
    });

    const onWall = mock(() => {});

    render(
      <ShortcutIntentProvider>
        <RegisterTool action="tool-wall" run={onWall} />
      </ShortcutIntentProvider>,
    );

    dispatchKeyDown({ key: "1", code: "Digit1" });

    expect(onWall.mock.calls.length).toBe(1);
  });

  it("does not invoke shortcuts while a device is selected (drawer scope)", () => {
    seedMapStore({
      activeDrawTool: "device",
      currentFloorId: fid("floor-1"),
      isEditMode: true,
      selectedDeviceId: did("device-1"),
    });

    const onWall = mock(() => {});

    render(
      <ShortcutIntentProvider>
        <RegisterTool action="tool-wall" run={onWall} />
      </ShortcutIntentProvider>,
    );

    dispatchKeyDown({ key: "1", code: "Digit1" });

    expect(onWall.mock.calls.length).toBe(0);
  });

  it("requires edit mode for tool shortcuts", () => {
    seedMapStore({
      activeDrawTool: "device",
      currentFloorId: fid("floor-1"),
      isEditMode: false,
      selectedDeviceId: null,
    });

    const onPc = mock(() => {});

    render(
      <ShortcutIntentProvider>
        <RegisterTool action="tool-pc" run={onPc} />
      </ShortcutIntentProvider>,
    );

    dispatchKeyDown({ key: "7", code: "Digit7" });

    expect(onPc.mock.calls.length).toBe(0);
  });

  it("ignores keydown events whose default has already been prevented", () => {
    seedMapStore({
      activeDrawTool: "device",
      currentFloorId: fid("floor-1"),
      isEditMode: true,
      selectedDeviceId: null,
    });

    const onWall = mock(() => {});

    render(
      <ShortcutIntentProvider>
        <RegisterTool action="tool-wall" run={onWall} />
      </ShortcutIntentProvider>,
    );

    const event = new KeyboardEvent("keydown", {
      key: "1",
      code: "Digit1",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    window.dispatchEvent(event);

    expect(onWall.mock.calls.length).toBe(0);
  });

  it("skips effects whose enabled flag is false", () => {
    seedMapStore({
      activeDrawTool: "device",
      currentFloorId: fid("floor-1"),
      isEditMode: true,
      selectedDeviceId: null,
    });

    const DisabledTool = ({ run }: { run: () => void }) => {
      useShortcutIntentEffect("tool-wall", run, { enabled: false });
      return null;
    };

    const onWall = mock(() => {});

    render(
      <ShortcutIntentProvider>
        <DisabledTool run={onWall} />
      </ShortcutIntentProvider>,
    );

    dispatchKeyDown({ key: "1", code: "Digit1" });

    expect(onWall.mock.calls.length).toBe(0);
  });
});

describe("useShortcutIntentEffect outside the provider", () => {
  it("throws a descriptive error", () => {
    expect(() =>
      renderHook(() => useShortcutIntentEffect("tool-wall", () => {})),
    ).toThrow(/ShortcutIntentProvider/);
  });
});

describe("useShortcutIntentEffects", () => {
  it("registers each adapter and routes the matching key", () => {
    seedMapStore({
      activeDrawTool: "device",
      currentFloorId: fid("floor-1"),
      isEditMode: true,
      selectedDeviceId: null,
    });

    const onWall = mock(() => {});
    const onRoom = mock(() => {});

    const Bundle = () => {
      useShortcutIntentEffects([
        { action: "tool-wall", run: onWall },
        { action: "tool-room", run: onRoom },
      ]);
      return null;
    };

    render(
      <ShortcutIntentProvider>
        <Bundle />
      </ShortcutIntentProvider>,
    );

    dispatchKeyDown({ key: "1", code: "Digit1" });
    dispatchKeyDown({ key: "2", code: "Digit2" });

    expect(onWall.mock.calls.length).toBe(1);
    expect(onRoom.mock.calls.length).toBe(1);
  });

  it("throws when used outside the provider", () => {
    expect(() =>
      renderHook(() =>
        useShortcutIntentEffects([{ action: "tool-wall", run: () => {} }]),
      ),
    ).toThrow(/ShortcutIntentProvider/);
  });
});

describe("useOptionHeld", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

  it("becomes held immediately and visible after the configured delay", async () => {
    const { result } = renderHook(() => useOptionHeld(0), { wrapper });

    expect(result.current.isHeld).toBe(false);
    expect(result.current.isVisible).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
    });
    expect(result.current.isHeld).toBe(true);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(result.current.isVisible).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }));
    });
    expect(result.current.isHeld).toBe(false);
    expect(result.current.isVisible).toBe(false);
  });

  it("ignores key repeat events", () => {
    const { result } = renderHook(() => useOptionHeld(0), { wrapper });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Control", repeat: true }),
      );
    });

    expect(result.current.isHeld).toBe(false);
  });

  it("resets state on window blur", () => {
    const { result } = renderHook(() => useOptionHeld(0), { wrapper });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
    });
    expect(result.current.isHeld).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(result.current.isHeld).toBe(false);
    expect(result.current.isVisible).toBe(false);
  });
});
