import type { ReactNode } from "react";
import { CurrentUserContext } from "@/hooks/use-current-user";
import type { Role } from "../convex/lib/roles";

/** Renders its children as a signed-in user with the given role. */
export function SignedInAs({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  return (
    <CurrentUserContext.Provider
      value={{ id: "user-1", name: "Test", role, sso: false }}
    >
      {children}
    </CurrentUserContext.Provider>
  );
}

export const SignedInEditor = ({ children }: { children: ReactNode }) => (
  <SignedInAs role="editor">{children}</SignedInAs>
);
