import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusDot } from "./StatusDot";

afterEach(() => {
  cleanup();
});

describe("StatusDot", () => {
  it("exposes an accessible label by default", () => {
    render(<StatusDot status="up" />);
    const dot = screen.getByRole("img");
    expect(dot.getAttribute("aria-label")).toBe("Status: up");
  });

  it("hides itself from assistive tech when decorative", () => {
    render(<StatusDot status="down" decorative />);
    expect(screen.queryByRole("img")).toBe(null);
  });

  it("applies one status color class per status", () => {
    const { container, rerender } = render(<StatusDot status="up" />);
    const upDot = container.firstElementChild;
    expect(upDot?.className.includes("bg-up")).toBe(true);

    rerender(<StatusDot status="down" />);
    const downDot = container.firstElementChild;
    expect(downDot?.className.includes("bg-down")).toBe(true);

    rerender(<StatusDot status="unknown" />);
    const unknownDot = container.firstElementChild;
    expect(unknownDot?.className.includes("bg-unknown")).toBe(true);
  });
});
