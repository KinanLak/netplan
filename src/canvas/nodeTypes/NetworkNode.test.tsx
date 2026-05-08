import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import NetworkNode from "./NetworkNode";
import { seedMapStore } from "../../../test/storeHarness";

afterEach(() => {
  cleanup();
});

describe("NetworkNode wrapper", () => {
  it("renders children with status color and dimensions", () => {
    seedMapStore({
      isEditMode: true,
      selectedDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: new Set(),
    });

    render(
      <NetworkNode id="device-1" status="up" width={80} height={120}>
        <span>child</span>
      </NetworkNode>,
    );

    const child = screen.getByText("child");
    const wrapper = child.parentElement;
    expect(wrapper?.style.width).toBe("80px");
    expect(wrapper?.style.height).toBe("120px");
    expect(wrapper?.className.includes("border-up")).toBe(true);
  });

  it("applies a status-specific glow when the device is selected", () => {
    seedMapStore({
      isEditMode: true,
      selectedDeviceId: "device-1",
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: new Set(),
    });

    render(
      <NetworkNode id="device-1" status="down" width={80} height={80}>
        <span>selected</span>
      </NetworkNode>,
    );

    const wrapper = screen.getByText("selected").parentElement;
    expect(wrapper?.className.includes("--down")).toBe(true);
  });

  it("flips cursor between grab and pointer based on edit mode", () => {
    seedMapStore({
      isEditMode: false,
      selectedDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: new Set(),
    });

    const { container, rerender } = render(
      <NetworkNode id="device-1" status="up" width={80} height={80}>
        <span>label</span>
      </NetworkNode>,
    );
    expect(
      container.firstElementChild?.className.includes("cursor-pointer"),
    ).toBe(true);

    seedMapStore({ isEditMode: true });
    rerender(
      <NetworkNode id="device-1" status="up" width={80} height={80}>
        <span>label</span>
      </NetworkNode>,
    );
    expect(container.firstElementChild?.className.includes("cursor-grab")).toBe(
      true,
    );
  });
});
