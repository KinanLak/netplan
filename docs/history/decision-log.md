---
title: Decision log
description: The 2026-10-15 grilling session and the agents' question journals that shaped the rebuild.
---

# Decision log

This is a frozen record of how the rebuild's decisions were reached. It holds the 2026-10-15 grilling
session between the owner and an assistant, plus the question journals that agents kept while running
the plan. It is a snapshot: entries are never edited, and later lots only append their journals at the
end. The durable decisions live in `docs/adr/`, which wins whenever it disagrees with this log. Inside
the session, later answers override earlier ones. Each entry's Outcome says when that happened.

## 2026-10-15 grilling session

### Context

Netplan was a map editor for drawing building floors, walls and network devices, built with TanStack
Start and Convex. On top of it sat a "computer location refresh" integration, which followed the chain
MAC → LibreNMS FDB → switch port → NetBox cable → wall socket → socket placed in Netplan → PC position.

The deployment had four parts:

- The backend ran on Convex Cloud.
- The web app was hosted on Vercel.
- An Electrobun desktop app wrapped the same web app.
- An external integration agent ran from a systemd user timer on the owner's workstation, because
  Convex Cloud could not reach LibreNMS.

Phases 0–3 of the French plan in `docs/computer-location-refresh/` (now `docs/history/2026-07-computer-location-refresh/`) were validated. Phases 4–7
(history, UX, operations, tests) were not. The app had no auth, so anyone could edit. The Arles site
was hardcoded, and device identity was keyed on NetBox ids.

The owner first asked for an audit of what was left, including UI testing. Then the owner asked how to
organise the work. Auth was to offer username/email + password or SSO OIDC. The owner also asked for a
full grilling, in simple words, that skipped obvious questions. Research subagents fed the later rounds:

- auth libraries;
- self-hosted Convex;
- coupling to NetBox and LibreNMS;
- the anglix repo and the zipzoup review bot.

### Q1 — Work organisation

- Asked: There are about six workstreams: auth and roles, history and purge, refresh UI, agent robustness and ops docs, UI polish, and tests and smoke tests. Auth touches nearly every Convex function, so how should they be sequenced?
- Options: A. Everything in one thread, one after another. B. Auth first and alone, then 3–4 parallel threads, each in its own worktree with its own PR. C. Everything in parallel now, accepting painful rebases.
- Recommendation: B. UI polish may run alongside auth because it barely touches the backend.
- Answer: B.
- Outcome: Auth comes before the parallel work. Refined by Q36 (lot order) and Q40 (a Foundations lot comes first).

### Q2 — How accounts are created

- Asked: There is no open sign-up. How does an account come to exist?
- Options: A. An admin creates each account by hand, password included. B. An admin invites by email and the person picks a password. C. SSO accounts are created automatically at first login; an admin creates password accounts.
- Recommendation: C. The IdP already decides who may enter, and password accounts are for the cases without SSO.
- Answer: C.
- Outcome: SSO accounts are created at first login, and there is no public sign-up. Refined by Q6: since SMTP is available, local accounts are invited by email and the person sets their own password. The first admin is bootstrapped by a command or an env var at first start.

### Q3 — Login required to view the map

- Asked: The map shows where each PC is, so it reveals roughly where people sit. Should reading the map also require login?
- Options: A. Login for everything, reading included. B. Free reading; login only to edit.
- Recommendation: A. It is simpler and safer, and it lets the random pseudonyms (for example "Sincère Phoque") give way to real names in the connected-users list.
- Answer: A.
- Outcome: Login is required everywhere. Presence shows real user names.

### Q4 — Roles

- Asked: The proposal is three roles, valid across all sites:
  - Lecteur views the map and inventory.
  - Éditeur edits the plan and triggers a manual refresh.
  - Admin manages users and integrations, toggles refresh, and sees history and health.
    The variants were to split "edit" from "refresh", or to have per-site roles.
- Recommendation: Three global roles. With a single site, per-site roles are needless complexity.
- Answer: _"Parfait"_.
- Outcome: Lecteur / Éditeur / Admin, all global. History visibility was narrowed later by Q18.

### Q5 — SSO provider and role source

- Asked: Which IdP should be tested (the config stays generic OIDC), and who decides an SSO user's role?
- Options: A. The admin, in Netplan; everyone arrives as Lecteur. B. IdP groups, for example "netplan-admins" gives Admin. C. Groups set a default and the admin can change it.
- Recommendation: One generic IdP and option A for v1, because groups require control over the IdP configuration.
- Answer: Keycloak, option B. The admins choose the role name that grants each Netplan role, which is also the role to create in Keycloak (_"le/les admins peuvent choisir le nom du role qui détermine ça"_).
- Outcome: Keycloak OIDC. An SSO user's role comes from a Keycloak role name that the admin configures in Netplan. Q14 settles the edge cases.

### Q6 — Forgotten password and email

- Asked: A "forgot password" link means sending email, and nothing exists for that today.
- Options: A. No email; the admin resets the password and passes it on. B. Send email through an internal SMTP relay.
- Recommendation: A. Password accounts will be rare, and SMTP is one more secret and one more dependency.
- Answer: B in substance. The owner assumes people have SMTP relays (_"on considère que les gens ont des relais SMTP dispo"_), so Netplan should offer the configuration and not reinvent anything.
- Outcome: SMTP is supported and used for invitations and forgot-password. The admin no longer sets passwords. Q15 settles where it is configured.

### Q7 — Where the integration agent runs in production

- Asked: The agent that polls LibreNMS and NetBox runs on the owner's workstation through a systemd user timer, because Convex Cloud cannot reach LibreNMS. If that PC is off, no location is computed. Where should it run?
- Options: A. A small VM or internal server with systemd. B. A Docker or Podman container on an existing server. C. Leave it on a workstation.
- Recommendation: A or B, depending on what exists. Ship both a Dockerfile and the systemd files.
- Answer: In production it runs as A or B, next to a self-hosted Convex and an existing Postgres instance. Docker looks ideal and could later move to the k8s cluster. The owner added _"à terme il n'y aura rien dans le cloud"_ and asked which option is best.
- Outcome: The assistant confirmed Docker:
  - the official self-hosted Convex backend, on the existing Postgres;
  - Netplan in its own image;
  - docker-compose first, with the same images reused on k8s later.
    Convex Cloud and Vercel both go away. The agent itself is removed (Q13).

### Q8 — Alerting

- Asked: When the agent fails repeatedly, or NetBox has not synced for more than 24 h, someone must know. How?
- Options: A. A health state in the admin page plus an in-app banner. B. A, plus a notification (webhook to Twake Chat, Matrix or Slack, or email). C. A, plus a health probe for existing monitoring, such as a `/health` route that Zabbix or Uptime Kuma polls.
- Recommendation: C. It is cheap and plugs into the monitoring that already exists.
- Answer: _"La route c'est parfait"_.
- Outcome: An in-app health view plus a `/health` route (lot 5).

### Q9 — Placing the real wall sockets

- Asked: The real relocation test needs the wall sockets placed on the real Arles map. That is manual work by people who know the building.
- Options: A. Someone places them soon with the current tool. B. First build a coverage view (sockets cabled, placed, missing), then place them.
- Recommendation: B, and move the coverage view earlier in the schedule.
- Answer: The owner did not follow. Sockets will never be entered manually in NetBox, and at most Netplan could push updates to NetBox.
- Outcome: Misunderstood. Rephrased as Q16.

### Q10 — Auth library

- Asked: Which auth library?
- Options:
  - better-auth through the official Convex component. It offers password login (email or username), generic OIDC, roles, an admin-managed user list with ban and password reset, and sign-up that can be turned off, with all data in Convex. Its risks are a 0.x component with open TanStack Start bugs, and a forced migration in 1.7, which changes the SSO callback URL.
  - Convex Auth: beta, with no roles or user management.
  - A hand-written minimal solution: long and risky for security.
  - Clerk or WorkOS: users stored at a SaaS vendor, and enterprise SSO is paid.
- Recommendation: better-auth, after a 1–2 day spike on the known TanStack Start bugs and on mapping OIDC groups to roles. Pin 1.6 and do the move to 1.7 as a separate task.
- Answer: _"better-auth alors"_.
- Outcome: better-auth via `@convex-dev/better-auth`, in local-install mode. The 1.6 pin was only part of the recommendation. The owner later asked for every dependency to be on its latest version, even across majors (see Q37).

### Q11 — Electrobun desktop app

- Asked: The desktop app embeds its own copy of the site and serves it on a fixed loopback port. With auth, the IdP needs an extra redirect URI, the port must stay fixed, and cookies break over plain http.
- Options: A. The desktop app simply loads the hosted site. B. Keep the local mode and handle two origins. C. Drop the desktop app.
- Recommendation: A if anyone really uses it, otherwise C.
- Answer: _"on abandonne"_.
- Outcome: The desktop app, its code and its dependencies are deleted (lot 0).

### Q12 — Internal tool or installable product

- Asked: "People have SMTP relays" suggests that other organisations will install Netplan. Yet the Arles site is hardcoded in the code: its name, its LibreNMS switch ids and its NetBox site.
- Options: A. An internal tool, where hardcoded Arles is fine and the docs stay light. B. A product others install, which needs a site configuration screen, real install docs and no hardcoded values.
- Recommendation: B, if that is the intent.
- Answer: A today, B eventually (_"à terme V"_, a typo for B).
  - Sites, switches and the like must never be hardcoded.
  - The owner sees a _"tool agnostic"_ app: usable alone for visual planning with no external service, with optional NetBox and LibreNMS "integrations".
  - Machines have physical ids (MAC address, hostname…).
  - This changes the product a lot, but it was always the end goal.
- Outcome: A tool-agnostic product. Q22 and Q22bis set its scope.

### Q13 — Keep the external agent? (first version)

- Asked: The agent exists only because Convex Cloud could not reach LibreNMS. A self-hosted Convex inside the network can call LibreNMS and NetBox directly. The assistant also stated that the in-Convex code for this already existed.
- Options: A. Delete the agent; Convex does everything, with the LibreNMS and NetBox tokens in Convex env vars. B. Keep the agent, in its own container.
- Recommendation: A, provided the Convex container can reach LibreNMS and NetBox.
- Answer: _"On vire l'agent"_ (first "Q13" line). It sits where the original Q13 falls in the list of open questions (Q12, Q13, Q14…), so it answers this version.
- Outcome: The assistant withdrew the premise before the owner answered (see Q13 corrected). Removing the agent still stands, but only after the in-Convex path is finished. The "tokens in env vars" part was superseded by Q23 (tokens stored encrypted in the database).

### Q13 (corrected) — Finish the in-Convex path before removing the agent

- Asked: The self-hosting research showed the in-Convex workers had never been wired.
  - The pieces exist: querying a switch, retrying a single failed switch, and the global NetBox timeout.
  - Nothing triggers them, and the final step is missing: assembling the switch results and publishing positions.
  - Only the agent had been proven for real (2 switches in about 45 s, 718 observations).
- Options: A. Finish the Convex path (wire the triggers, write the finalizer, test the actions, rerun a real test), then delete the agent. B. Keep the agent as a container; no risk, but two things to deploy and monitor, and per-switch retry still has to be added.
- Recommendation: A, after the move to self-hosting. Keep the agent until the new path passes the same real test.
- Answer: _"Q13 A"_ (second "Q13" line). It was given after Q20, in the order the assistant had listed the open items ("Q12 and Q14 to Q20, plus the corrected Q13 and Q21"), so it answers this version.
- Outcome: Finish the in-Convex workers and validate them against the real NetBox and LibreNMS. Then delete the agent, the connector and the systemd units (lot 2, step 4).

### Q14 — Keycloak role edge cases

- Asked: The admin maps Keycloak role names to Netplan roles. Three cases remain:
  1. An SSO user with no recognised role: refuse access, or let them in as Lecteur?
  2. The role changes in Keycloak: re-read it at each login?
  3. Can a Netplan admin override an SSO user's role? Who wins if they disagree?
- Recommendation: (1) Refuse access. (2) Yes. (3) No: Keycloak alone decides for SSO users, and roles are edited in Netplan only for local password accounts.
- Answer:
  - (1) Let them in as Lecteur, because _"le role est juste pour la modif/admin"_.
  - (2) Each login is fine. If OIDC already has a session refresh, that would be a good moment to re-check the role, but only if it adds no complexity.
  - (3) Not answered explicitly.
- Outcome:
  - A user with no recognised role enters as Lecteur, overriding the recommendation.
  - The role is re-read only at login. The assistant explained that better-auth creates its own session after Keycloak validates the user and never asks Keycloak again, so checking during a session would add complexity. A role removed in Keycloak therefore stays active until the Netplan session ends, which Q24 bounds.
  - Point 3 follows the recommendation: in the plan, the admin sets roles only for local accounts.

### Q15 — Where SMTP is configured

- Options: A. Env vars (host, port, user, password, sender), like the other secrets. B. In the admin page, which means storing the SMTP password in the database.
- Recommendation: A, with a "send a test email" button in the admin page.
- Answer: A.
- Outcome: SMTP comes from env vars, and the admin page has a "send test email" button.

### Q16 — Placing sockets on the plan (Q9 rephrased)

- Asked: NetBox knows that socket 001 is cabled to switch port 1, but not where the socket sits on the floor plan. Someone has to drag each socket into place in Netplan once; otherwise PCs stay "resolved, socket not placed".
  1. Is that one-time manual placement acceptable, or is there an existing plan (DWG, SVG, PDF) to import?
  2. Is a Netplan → NetBox push part of "done"?
- Recommendation: (1) Manual placement, helped by a coverage view; importing a plan is a project of its own. (2) Not in v1; note it for later.
- Answer:
  - (1) Manual placement, plus importing an image "calque" to help with the first placement. It is a visual aid only, with no automatic reading, and it must be well integrated (_"faut que ça soit bien intégré et bien foutu"_).
  - (2) Feasible, and it would even be good.
- Outcome: The floor overlay ("calque") feature, detailed in Q25. The NetBox push is accepted and scoped in Q26.

### Q17 — MAC addresses

- Asked: The plan stored MAC history as an HMAC, unreadable without the server key. Today MACs are in clear everywhere.
- Options: A. HMAC only in the 30-day history. Current state keeps MACs in clear for port matching but never sends them out of the server, and admins search by having the server hash the input. B. HMAC everywhere, current state included. C. No HMAC: MACs stay in clear, protected only by auth and roles.
- Recommendation: A, as in the original plan.
- Answer: For an internal-only tool, a MAC address isn't really secret. Tolerating it in clear beats adding complexity (C).
- Outcome: MACs stay in clear, and HMAC is removed from the plan. This overrides the recommendation.

### Q18 — Who sees history, and where

- Asked: The plan defined history data but no screen for it. The proposal:
  - a "Historique" tab in a PC's panel, with 30 days of moves and absences;
  - in the admin page, the cycles, the per-switch errors and a search such as "where was this PC at 14:00 on 3 October".
    Who should see it?
- Options: A. PC history for every logged-in user; admin page for Admins. B. PC history for Éditeur and Admin only. C. All history for Admin only.
- Recommendation: B. Knowing where a PC was at a given hour is close to tracking a person.
- Answer: B.
- Outcome: History is visible to Éditeur and Admin only (lot 5).

### Q19 — Admin page contents

- Asked: The proposal is four sections:
  - Users: list, invitations, disabling, and the Keycloak role name for each Netplan role.
  - Integrations: health, last cycles, per-switch errors, age of the last NetBox sync, and a refresh button.
  - Toggles: per site, turn automatic cycles and manual refresh on or off.
  - Email: send a test.
    Thresholds stay in code, and the emergency env kill switches stay as a fallback.
- Recommendation: These four, plus a fifth "Sites" section if Q12 is B.
- Answer: _"bien parfait"_.
- Outcome: Adopted. With the tool-agnostic model, sites and per-site integrations are also configured in the admin page (Q22, Q23, Q33, Q34bis).

### Q20 — How far the map goes

- Asked: Three things are half done:
  - Status dots never update and stay "unknown".
  - Switches always show 24 fake ports.
  - NetBox cables are not drawn.
- Options: For dots, A has the PC dot reflect localization (green online, grey offline, orange ambiguous) and the switch dot reflect LibreNMS up/down; B removes the dots. For ports, show the real count from NetBox and colour ports where a PC was seen. For cables, draw them all (spaghetti risk) or only those of the selected device.
- Recommendation: A for dots, real coloured ports, and cables of the selected device only.
- Answer: The dot shouldn't be a base attribute but the PC's state, derived from several inputs. To keep it simple, online/offline/unknown is enough.
- Outcome: The PC dot shows online, offline or unknown. Q27 re-asked the ports and cables parts.

### Q21 — One Docker image for every environment?

- Asked: The Convex URL is baked into the site at build time, so an image built for staging does not work in production.
- Options: A. One image per environment, rebuilt for each URL. B. A single image whose server reads the URL at startup and passes it to the browser.
- Recommendation: B. It is the normal pattern for Docker and k8s, and better-auth already reads its config at startup.
- Answer: B.
- Outcome: A single image with runtime config and a lazily created Convex client.

### Q22 — How far "tool agnostic" goes

- Options: A. Remove everything hardcoded: sites, switches and NetBox/LibreNMS connections are configured in the admin page, each integration can be turned on or off per site, and without integrations the app is a planning tool. B. A, plus native physical identity: any device carries MAC, hostname and serial even without NetBox. Localization then rests on two generic facts, "MAC seen on port" and "port cabled to socket", which any source can provide, including hand-drawn cabling. C. B, plus a real plugin system with a generic integration contract (GLPI, UniFi, Zabbix…).
- Recommendation: B now. Draw code boundaries so that C comes naturally later, but build no plugin system until a third integration exists.
- Answer: _"B avec le C à l'avenir"_.
- Outcome: Option B now and plugins (C) later. Q22bis then made B a rebuild with no legacy.

### Q22bis — Rebuild directly, no legacy (owner follow-up)

- Asked: Not asked by the assistant; the owner added it after answering Q22.
- Answer: Go straight to B instead of keeping the app's old ways of working. The owner's general rule: _"il vaut mieux reconstruire BIEN dès maintenant plutot que de se trimballer une vieille architecture"_.
- Outcome: A clean rebuild to B with no compatibility for the old NetBox-keyed model; this became the "rebuild properly" rule. The assistant also recorded three points:
  - Port names are matched without vendor-specific rules.
  - When importing a PDF overlay, the user chooses the page.
  - The old `docs/computer-location-refresh/` plan would be rewritten. The Foundations plan changed this: those docs are moved to `docs/history/` and frozen.

### Q23 — Where integration tokens are stored

- Asked: If NetBox and LibreNMS are configured per site in the admin page, possibly with a different instance for each site, where do their tokens live?
- Options: A. In the database, encrypted with a master key from an env var. The field is write-only: the admin can replace a token but never read it back, and it is never sent to the browser. B. Only in env vars; the admin only picks which declared instance applies to which site.
- Recommendation: A. It is the only choice that fits "everything is configured in the admin page", and encryption protects tokens if the database leaks.
- Answer: A.
- Outcome: Tokens are encrypted in the database with an env master key, in write-only fields, and never reach the browser.

### Q24 — Session length

- Asked: Session length is the longest time a role removed in Keycloak stays active, and how often people must log in again.
- Options: A. 7 days, extended while the app is in use (the better-auth default). B. 24 hours. C. 8 hours, one working day.
- Recommendation: B. People log in once a day, and a removed right disappears within 24 h. With SSO, logging in again is often one click.
- Answer: B.
- Outcome: Sessions last 24 hours.

### Q25 — The placement overlay ("calque")

- Asked: The proposal:
  - Formats: PNG, JPG and SVG. From a PDF, only the first page is imported, rasterised at import.
  - One overlay per floor, uploaded by an Éditeur.
  - Controls: move, resize, rotate, opacity, lock once placed, show and hide.
  - Scale: click two points on the overlay and enter their real distance (for example 10 m) to scale it to the plan.
  - Walls can be traced over the overlay as a guide.
    Is PDF needed? Is two-point scaling needed?
- Recommendation: Yes to both. Building plans almost always arrive as PDF, and without scaling the overlay never matches the plan.
- Answer: Yes to both, plus at least a way to select which page to import.
- Outcome: A per-floor overlay accepting PNG/JPG/SVG/PDF with a page choice for PDFs. It can be moved, resized, rotated, faded, locked and hidden, and it supports two-point scale calibration.

### Q26 — Netplan → NetBox push

- Asked: What does Netplan write to NetBox? The push is one-way, can be turned on per site, and is deferred rather than run every cycle.
- Options: A. Each PC's observed location (socket, room, floor, date) in NetBox custom fields. B. A, plus socket positions (room and coordinates). C. A real two-way sync where the plan modifies NetBox; risky because conflicts must be handled.
- Recommendation: A, after the bulk of the work. It is the data NetBox lacks and only Netplan produces. C is not recommended.
- Answer: A. The owner added that NetBox doesn't know socket positions either, as far as they know.
- Outcome: A one-way push of observed PC locations to NetBox custom fields, done late (lot 5). The assistant confirmed that Netplan is the only source of socket positions.

### Q27 — Ports and cables on the map (rest of Q20)

- Asked:
  1. Show the real port count from the inventory, and colour a port when a PC has been seen on it?
  2. Cables: only those of the selected device, or all of them all the time?
  3. Should dots on other devices (switch, rack) stay "unknown" until an integration provides a state?
- Recommendation: (1) Yes. (2) Selected device only. (3) Yes.
- Answer: (1) Yes. (2) Selected device. (3) Yes.
- Outcome: Real switch ports, coloured by observation. Other devices stay "unknown" until a source provides a state (switch state from LibreNMS when available). The cable display rule was refined by Q32bis.

### Q28 — Does Netplan have its own inventory?

- Asked: Today a device exists in Netplan only if it is on the plan, and the list of devices waiting to be placed is NetBox. Under B, Netplan owns identities.
- Options: A. Netplan has its own inventory. A device can exist without being placed; NetBox adds and updates devices, users can create them by hand, and they are placed whenever convenient. B. A device exists only once placed, and external sources stay separate lists.
- Recommendation: A. It makes the app tool-independent and lets localization place a PC nobody placed by hand.
- Answer: A.
- Outcome: Netplan owns its inventory and device identity (MAC, hostname, serial), and devices can exist unplaced.

### Q29 — Which source wins on conflict

- Asked: A PC comes from NetBox, and someone edits its hostname in Netplan. Who wins?
- Options: A. Fields that come from a source are read-only in Netplan and are fixed in the source; hand-created devices stay editable. B. Everything is editable in Netplan, and the local edit wins over the source.
- Recommendation: A. No conflicts, no phantom values, and the origin of every value is always known. The panel shows each field's source.
- Answer: A.
- Outcome: Source-owned fields are read-only in Netplan.

### Q30 — A MAC seen on the network but unknown to the inventory

- Options: A. Ignore it, as today. B. Show it in an "Appareils inconnus" list with the socket where it is seen; an Éditeur can turn it into a device in one click.
- Recommendation: B. It is the best way to complete the inventory without NetBox.
- Answer: B, but watch the "remediation" when NetBox eventually learns the device. Example: a device is plugged in, Netplan learns about it quickly, then someone creates it in NetBox, and there must be no conflict.
- Outcome: An unknown-MACs list with "create device". Q30bis defines the remediation rules.

### Q30bis — Remediation when NetBox learns the device later

- Asked: Scenario: a PC is plugged in, Netplan sees its MAC and an Éditeur creates the device. A week later, someone creates it in NetBox. Proposed rules:
  - Same MAC or serial: merge automatically. The Netplan device keeps its position and history, is bound to NetBox, and its fields become NetBox's, read-only.
  - Same hostname only: too weak to merge alone. Netplan shows a suggestion ("this PC may match PC-ARL-012 in NetBox") that an Éditeur confirms in one click.
  - Ambiguous case (one MAC on two NetBox devices): no merge, and a conflict to resolve in the admin page.
- Recommendation: These three rules, so there are no silent duplicates and nothing is merged on weak evidence.
- Answer: _"Parfait"_.
- Outcome: A matching MAC or serial merges automatically. A hostname-only match is a suggestion an Éditeur confirms. Ambiguous cases become an admin conflict.

### Q31 — Which devices can be localized

- Asked: Today only PCs are localized.
- Options: A. Only PCs. B. Any endpoint with a MAC (PC, printer, IP phone, Wi-Fi access point…), with a generic "other endpoint" type. In both cases a patch-panel type is also needed, or hand-described cabling cannot be realistic.
- Recommendation: B, plus the patch panel. The localization logic is the same; only the icon changes.
- Answer: B.
- Outcome: Any MAC endpoint can be localized, and there are generic-endpoint and patch-panel device types.

### Q32 — Describing cabling by hand

- Asked: A cable often spans two floors (switch on the ground floor, socket on floor 1), so it cannot be drawn on one plan.
- Options: A. Edit cabling in the device panel as a port table ("Port 3 → Panel A port 12 → Socket 105 (Floor 1)"). The map draws only the selected device's cables, when they are on the same floor. B. Draw on the plan by dragging between two ports, with a special "floor crossing" object.
- Recommendation: A. It is more reliable, works across floors and matches NetBox's model; drawing stays display only.
- Answer: The owner asked whether links are automatic anyway, and why they would be manual. Without integrations the owner prefers B's UX, but there may be trade-offs they don't see.
- Outcome: Clarified and settled in Q32bis.

### Q32bis — Cables: automatic or manual?

- Asked: With NetBox, cables are automatic and read-only. They are entered by hand only when there is no cabling integration. Drawing on the plan (B) then has three limits:
  - cables between floors are never on the same screen;
  - patch-panel paths (switch → panel front → panel rear → socket) need three precise strokes per socket;
  - 48 drawn cables turn into spaghetti.
    The proposal is a hybrid where both screens edit the same data: on the same floor, drag a line from port to port on the plan (B's UX); across floors and for patch-panel paths, use the port table in the device panel.
- Recommendation: The hybrid.
- Answer: _"Parfait"_, with two more rules:
  - Never show ALL cables.
  - Hovering shows cables only for endpoints. For network devices higher (or lower) in the chain, such as patch panels and switches, the "spaghetti" appears only after an explicit action.
- Outcome: Hybrid cable editing.
  - Cables are never all drawn at once.
  - Hovering an endpoint shows its cable path.
  - Switches and patch panels show their cables only after an explicit action.

### Q33 — Hardcoded NetBox rules

- Asked: Code maps some NetBox roles to Netplan types ("wall socket" → socket, "switch access" → switch…). It also filters PCs by name prefixes (`ordi`, `render`, `tnzpv`). Why does the name filter exist, and do some PCs have the wrong role?
- Options: A. A "NetBox role → Netplan type" table in the admin page, and no name filter at all. B. A, plus a configurable name filter (a regex).
- Recommendation: A if the NetBox roles are reliable, otherwise B.
- Answer: A is better, and it also forces better hygiene in NetBox (_"ça force en plus à avoir une meilleurs hygiène dans netbox"_).
- Outcome: The NetBox role → type mapping lives in the admin page, with no name regex.

### Q34 — Hours and public holidays

- Asked: The cadence (5 min by day, 1 h at night) hardcodes French public holidays and Paris time. The per-site proposal: a timezone, day hours (07–20h by default), country holidays computed by an existing library, and manually added closure days.
- Recommendation: As proposed; country plus manual closures covers every case.
- Answer: The owner asked whether this wasn't a limit set because of Convex quotas, and whether it is still useful once self-hosted.
- Outcome: Clarified and settled in Q34bis.

### Q34bis — Why 5 minutes by day and 1 hour at night

- Asked: The limit was never about Convex quotas. Each cycle makes LibreNMS poll switches over SNMP, which loads the switch CPUs and the LibreNMS VM. Self-hosting doesn't change that, though it removes any database cost constraint. Since this is a constraint of each customer's network, the cadence should be configurable per site:
  - a business-hours cadence (default 5 min) and an off-hours cadence (default 1 h);
  - a time range and working days (default 07–20h, Monday–Friday);
  - a timezone.
    Public holidays are dropped: a holiday only wastes a few fast cycles, and dropping it avoids a library and a per-country setting.
- Recommendation: As above.
- Answer: _"ouai très bien alors on fait ce que tu as dis"_.
- Outcome: The cadence is set per site.
  - Defaults: every 5 min during business hours (07–20h, Mon–Fri, in the site timezone) and every 1 h otherwise.
  - There is no holiday calendar.
  - The cadence exists to limit SNMP and LibreNMS load. It supersedes the holiday and closure-day parts of Q34.

### Q35 — Existing data

- Asked: The Convex Cloud dev deployment holds a plan, cycles and positions, and migrating them to the new model would be expensive.
- Options: A. Restart from zero on the self-hosted instance, redraw the plan and re-run the NetBox sync. B. Write a migration.
- Recommendation: A. The project is unreleased, and the Arles plan is quick to redo, especially with the overlay.
- Answer: A.
- Outcome: Restart from zero, with no data migration.

### Q36 — Lot order

- Asked: Six lots were proposed:
  - Lot 0, Infra: Docker, compose, runtime config, removal of Vercel and desktop. Small, and parallel with lot 1.
  - Lot 1, Auth: better-auth, roles, Keycloak, SMTP and user management. It comes before the big refactor because site and integration config needs Admin rights.
  - Lot 2, the new model (B), in steps:
    1. configurable sites and integrations with encrypted tokens;
    2. Netplan-owned inventory and identity;
    3. cabling and device types;
    4. generic sources with collection inside Convex.
       The agent is deleted at the end of this lot.
  - Lot 3, overlay and map polish: parallel with lot 2.
  - Lot 4, UX: refresh, freshness, toasts, offline section, coverage view, unknown devices, full admin page. Starts after lot 2.
  - Lot 5: history and purge, NetBox push, ops docs, `/health`, real tests.
- Recommendation: This order.
- Answer: _"parfait"_.
- Outcome: Adopted, then extended:
  - Q40 adds a Foundations lot before everything.
  - The orchestrator settled the parallelism (see the journal below): F → (L0 ∥ L1) → (L2 ∥ L3a overlay) → L3b map → L4 → L5.

### Q37 — How we work

- Asked: The proposed way of working:
  - For each lot, a short design doc in `docs/` that the owner validates before any code.
  - One PR per step, never a giant PR, with an automatic code review run before handing over, and the owner merges.
  - Parallel work in separate threads, each in its own worktree.
    A variant had the assistant merge once tests and review are green.
- Recommendation: The owner validates the design and merges, because a refactor this size needs a human seeing each step.
- Answer:
  - (1) Yes. Also send a subagent to explore the matecorp/anglix repo (available locally), which is largely built with Claude Code and T3 Code. Its tests, decision-making and documentation have much to teach, as does the structure of AGENTS.md/CLAUDE.md.
  - (2) For review, the owner installed an in-house review bot, zipzoup (the same as on anglix); explore its code and its GitHub repo. Stacked PRs can group the changes within a lot.
  - (3) Yes.
  - The owner also wants a clean base with up-to-date libraries. The assistant should launch a dep-updater thread and own it (launch, follow-up, validation). Everything should be on the latest version, _"même si on doit jump une majeure"_.
- Outcome: At the time: design doc → stacked PRs → zipzoup review → owner merges, plus a dependency-update thread.
  - Superseded by the autonomous mandate (see the end of this session and PLAN): agents squash-merge their own PRs when CI is green, no P0/P1 finding is unresolved and the branch is up to date.
  - Design docs are ADRs in each lot's first PR, with no owner validation.

### Q38 — Repository language

- Options: A. The whole repo in English (code, commits, PRs, ADRs, docs), with the UI in French. B. Everything in French except code. C. Code and commits in English, docs and PRs in French.
- Recommendation: A. It matches zipzoup and anglix and is needed if other organisations install Netplan. The UI stays French and can be translated later.
- Answer: A.
- Outcome: The repo is in English and the UI is in French.

### Q39 — zipzoup on a public repo, and cubic

- Asked: The zipzoup README says it is "only for private repositories with trusted authors", and `KinanLak/netplan` is public. Should cubic, the current review bot, stay alongside it?
- Options: A. Make Netplan private, at least during the rebuild. B. Stay public and accept the risk knowingly.
- Recommendation: A, and remove cubic, because two review bots means twice the noise for the same findings.
- Answer: Labelled "A", but the content is the other way round:
  - Netplan stays public.
  - The owner will change zipzoup so that it only activates on maintainers' PRs.
  - The owner will uninstall cubic.
  - The assistant may launch the zipzoup thread on the local repo itself and _"merge le dès qu'il est bon, tu as pas besoins de mon aval"_.
- Outcome: The repo stays public (option B in substance), zipzoup is restricted to maintainer PRs, and cubic is removed. The assistant may merge the zipzoup change without approval.

### Q40 — A Foundations lot before everything

- Asked: Insert a lot right after the dependency PR and before lots 0 and 1, containing:
  1. a new AGENTS.md modelled on anglix;
  2. separate `check` (read-only), `fix` and `verify` scripts, and GitHub Actions CI (full verification, generated files up to date, secret scanning, dependency audit);
  3. zipzoup wiring with `.github/zipzoup/review.md`;
  4. `t3.json`;
  5. docs restructured into `adr/`, `architecture/` and `history/`, with the old localization plan moved to history;
  6. first ADRs for every decision taken in this session.
- Recommendation: Yes, first, so that every parallel thread follows the same rules and zipzoup has something to judge against.
- Answer: _"Parfait"_, with three additions:
  - Reuse the anglix approach to how the agent/AI tests the app in the UI, which matters a lot.
  - Are per-MR environments possible with self-hosted Convex? It deserves thought (_"ça mérite gamberge"_).
  - Take inspiration from the t3code GitHub repo, especially but not only its skills.
- Outcome: The Foundations lot comes first. It also includes an agent UI-testing workflow: a per-worktree Convex backend, seeded data, `t3.json` and a test skill.

### Q41 — Is GitHub Actions compatible with "nothing in the cloud"?

- Asked: The "nothing in the cloud" rule targeted the production app, but CI runs at GitHub.
- Options: A. GitHub Actions for CI, since the code is already on GitHub. B. Self-hosted runners.
- Recommendation: A. CI sees neither production data nor production secrets.
- Answer: Yes. CI is for development, so it is acceptable (_"le CI c'est pour le dev on s'en fout c'est tollerable"_).
- Outcome: CI runs on GitHub-hosted runners (`ubuntu-latest`, see the orchestrator journal).

### After Q41 — autonomous mandate

The owner asked for the zipzoup relay to be deployed and approved the plan. The owner then handed over
an autonomous mandate:

- Work as autonomously as possible, so the owner is in the loop as little as possible.
- Ask only questions without an obvious answer, and write every question, with its answer, to a file.
- Nothing is in production, so everything may be deleted and recreated.
- Write to NetBox as little as possible, and never act destructively on real devices. Agents may
  create test devices and must delete them at the end.
- Retry NetBox calls on timeouts and 5xx errors.
- Agents have every right to merge.

This mandate overrides Q37 on merging and on design validation.

## Orchestrator journal (2026-10-15)

### Where do we deploy for the autonomous run?

- Context: no server is available yet; target is self-hosted Docker.
- Decision: local Docker on the owner's workstation (not podman).
- Why: owner said Docker is installed, running and they have rights.
- Who: owner (pre-mandate question)

### Which Keycloak for SSO tests?

- Decision: a local Keycloak container with a scripted dev realm.
- Who: owner (pre-mandate question)

### Where does the NetBox location push write during tests?

- Decision: custom fields on the real NetBox, values written only on `netplan-test-*` devices; feature off by default.
- Who: owner (pre-mandate question)

### Can agents trigger LibreNMS discoveries?

- Decision: yes, at the product cadence (≤ one cycle / 5 min / site).
- Who: owner (pre-mandate question)

### Who merges PRs?

- Context: Q37 said the owner merges; the mandate gives agents every right to merge.
- Decision: lot threads squash-merge when CI is green, no unresolved P0/P1 (zipzoup + self-review) and the branch is up to date.
- Why: the mandate explicitly overrides Q37.
- Who: owner (mandate)

### Do design docs wait for owner validation?

- Decision: no; each lot writes its ADR in its first PR and proceeds.
- Why: the mandate asks to keep the owner out of the loop; ADRs keep the trace.
- Who: agent (obvious)

### Where does CI run?

- Decision: GitHub-hosted `ubuntu-latest`; the self-hosted `github-runners-*` containers on this host belong to other work.
- Why: public repo → free hosted minutes; no risk of untrusted code on the workstation.
- Who: agent (obvious)

### How are NetBox test objects identified?

- Decision: name `netplan-test-<lot>-<n>`, tag `netplan-test`; deleted at the end of each lot; final sweep in L5.
- Who: agent (obvious)

### Which Postgres for the local compose deployment?

- Decision: a Postgres container inside the compose stack; external Postgres is just an env var for real installs.
- Who: agent (obvious)

### Which SMTP for local tests?

- Decision: Mailpit in compose and in dev.
- Who: agent (obvious)

### Per-worktree dev backend storage?

- Decision: SQLite in a per-worktree Docker volume; Postgres only in compose/CI where Postgres behaviour matters.
- Who: agent (obvious; research §2b)

### Lot parallelism

- Decision: F alone first; then L0 ∥ L1; then L2 ∥ L3a; then L3b, L4, L5.
- Why: F changes AGENTS/CI/scripts every lot depends on; L1 touches every Convex function.
- Who: owner (Q36) + agent

## Lot journals

Each lot appends its question journal here in its last PR.

### F — Foundations

_Appended at the end of the lot._
