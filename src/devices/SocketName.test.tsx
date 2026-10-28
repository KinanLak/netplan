import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { SocketName } from "./SocketName";

describe("SocketName", () => {
  it("reads « Prise » once, whether or not the name already says it (A105)", () => {
    const text = (name: string) =>
      render(<SocketName name={name} />).container.textContent;
    expect(text("Prise C-03")).toBe("Prise C-03");
    expect(text("prise salle de pause")).toBe("prise salle de pause");
    expect(text("C-03")).toBe("Prise C-03");
  });
});
