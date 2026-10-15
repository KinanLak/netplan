import type { Role } from "../../convex/lib/roles";

// One account per role, created only where ALLOW_DEV_SEED=true. The password
// is public on purpose: these accounts exist only on throwaway backends.
export const DEV_PASSWORD = "netplan-dev"; // gitleaks:allow

export const DEV_ACCOUNTS: ReadonlyArray<{
  username: string;
  email: string;
  name: string;
  role: Role;
}> = [
  {
    username: "lecteur",
    email: "lecteur@netplan.test",
    name: "Lecteur Démo",
    role: "reader",
  },
  {
    username: "editeur",
    email: "editeur@netplan.test",
    name: "Éditeur Démo",
    role: "editor",
  },
  {
    username: "admin",
    email: "admin@netplan.test",
    name: "Admin Démo",
    role: "admin",
  },
];
