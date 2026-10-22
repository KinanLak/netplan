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

Questions of 2026-10-15, in the order they came up.

#### How is the lot split into PRs?

- Context: PLAN suggests docs → tooling → dev env → CI e2e.
- Decision: four stacked PRs in that order; each PR updates AGENTS.md only for what it introduces, so AGENTS.md is never ahead of the code.
- Why: a reviewer reading PR 1 alone must not find instructions for scripts that do not exist yet.
- Who: agent (judgement call)

#### Which ADR is the lot's design doc?

- Context: PLAN asks for a design doc as an ADR in the first PR.
- Decision: the product decisions get one ADR each (0001–0017); the Foundations design is split into 0018 (agent dev environment and CI e2e) and 0019 (delivery: check/fix/verify, CI gate, zipzoup, agents merge).
- Why: one ADR per decision; the two Foundations choices can be superseded independently.
- Who: agent (judgement call)

#### AGENTS.md or CLAUDE.md as the source?

- Context: anglix keeps CLAUDE.md as the file and AGENTS.md as a symlink; Netplan already has `CLAUDE.md -> AGENTS.md`.
- Decision: keep AGENTS.md as the file, CLAUDE.md the symlink.
- Why: already in place; AGENTS.md is the cross-harness name (Codex/zipzoup read it first).
- Who: agent (obvious)

#### Which convex-backend image?

- Context: owner asked to pin the latest version tag.
- Decision: `ghcr.io/get-convex/convex-backend:72ce13c379fe6dbdfc305bc8ad699c5663c68c2a` (release `precompiled-2026-10-10-72ce13c`, the newest on 2026-10-15), digest `sha256:294944b3…392e5a`.
- Why: ghcr has no semver tags; the commit-sha tag of the newest precompiled release is the version tag. One constant shared by dev:agent and CI.
- Who: agent (obvious)

#### Where is Convex codegen freshness checked?

- Context: `convex codegen` refuses to run without a deployment (checked: "No CONVEX_DEPLOYMENT set").
- Decision: CI runs it against a convex-backend service container; locally `bun run check` runs it only when the worktree's dev:agent backend answers, otherwise prints that it skipped. It restores the committed files, so `check` never mutates.
- Why: check must stay non-mutating and fast; CI is the authority.
- Who: agent (judgement call)

#### Does CI run on draft pull requests?

- Context: PLAN opens a draft after the first commit; GitHub-hosted minutes cost nothing on a public repository.
- Decision: CI runs on every pull request, drafts included, and on pushes to `main`.
- Why: a draft's CI tells the agent early what breaks; nothing is saved by waiting for ready.
- Who: agent (judgement call)

#### Which audit advisories are accepted?

- Context: `bun audit --audit-level=high` failed on two advisories with no fix reachable by updating.
- Decision: ignore GHSA-vfj7-8cjw-p6xm (braces, no fixed version, dev tooling only) and GHSA-c475-qrg2-pj4r (basic-ftp, only through electrobun, removed in lot 0), each with its reason in `ci.yml`.
- Why: the gate must be green to be useful; each ignore is narrow and has an end (lot 0 for electrobun).
- Who: agent (judgement call)

#### What does gitleaks do with the localStorage key name?

- Context: gitleaks' generic-api-key rule flagged the `netplan-identity`-style storage key constant in an old commit of `src/store/useMapStore.ts`.
- Decision: list that one finding (commit:file:rule:line) in `.gitleaksignore` with its reason; a real secret is rotated, never ignored.
- Why: it is a key name, not a credential, and history is not rewritten.
- Who: agent (obvious)

#### Does ADR 0004 claim French role names in the code?

- Context: a draft said role names are French in the code.
- Decision: dropped; only the UI labels (Lecteur, Éditeur, Admin) are French, identifiers stay English like the rest of the repo.
- Why: the language rule: repository in English, UI strings in French.
- Who: agent (obvious)

#### Where does the CI backend's secret come from?

- Context: ADR 0018 first said CI starts the backend "with a throwaway secret".
- Decision: no secret is passed; the image generates `INSTANCE_SECRET` in its data directory on first start, and the admin key comes from `generate_admin_key.sh`. ADR corrected.
- Why: nothing to store, nothing to leak; each run gets a new instance.
- Who: agent (obvious)

#### How does dev:agent store its backend?

- Context: per-worktree backend (ADR 0018); `--local` binaries do not run on this RHEL 9 host.
- Decision: one container and one SQLite volume per worktree, both named `netplan-cvx-<slug>-<hash6>` and labelled `netplan.role=dev-backend`, `netplan.worktree=<path>`; ports bound to 127.0.0.1; `--reseed` removes container and volume; an image pin change recreates the container on the same port and keeps the volume.
- Why: isolation without a shared database server; labels make GC of deleted worktrees safe on a host with other stacks.
- Who: agent (judgement call)

#### Is the seed run only on an empty backend?

- Context: the seed could be gated on "backend empty" or made idempotent. A first version replayed a fixed `opId` per floor; the self-review found that a cleared map then stayed empty (the replay answered from the stored record) and that a changed demo site made every start fail.
- Decision: every run fills what is missing: the site, building and floors when absent, and a floor's map while the floor has no device and no wall, each batch with the next `dev-seed` sequence number. An existing site is left as it is. A change to the demo data reaches an existing backend through `--reseed`.
- Why: a cleared map comes back, user edits stay, and nothing about an existing backend can make the start fail.
- Who: agent (judgement call)

#### What is the demo site?

- Context: the seed needs a site for integrations not to break, without contacting anything real.
- Decision: "Site de démonstration" (`site:demo`), `enabled: false`, with placeholder NetBox and LibreNMS config names (no tokens); data uses documentation IPs (192.0.2.0/24) and locally administered MACs.
- Why: a disabled site never schedules a sync; fictional addresses can never match a real device.
- Who: agent (obvious)

#### Where does the seed's map live, and how is it written?

- Context: the seed must obey server validation (ADR 0018) and be testable without Convex.
- Decision: a pure builder in `src/dev-seed/demoMap.ts` (relative imports, because Convex bundles it without the `@/` alias); `convex/dev.ts` applies it through `applyMapOperation`, extracted from `mapOperations.apply` so both share one code path.
- Why: the same validation as users, unit tests of the map in the engine, and no second write path.
- Who: agent (judgement call)

#### How are ports chosen?

- Context: parallel worktrees must not collide, and the same worktree should keep its URLs.
- Decision: backend pair from 13200 + 2·(h mod 400), web from 3100 + (h mod 900), h from the path's SHA-256; walk up while taken (web checked on 127.0.0.1 and ::1); skip 3659, which Chrome refuses. The last served app URL is recorded in the marked `.env.local` for `--status`.
- Why: stable per worktree, collision-free, and no browser-blocked port.
- Who: agent (obvious)

#### Is the admin key regenerated on every run?

- Context: `generate_admin_key.sh` returns a different key each call; rewriting `.env.local` restarts a running Vite.
- Decision: keep the recorded key while the backend accepts it (`convex env list`); generate a new one otherwise (new volume after `--reseed`).
- Why: a second `dev:agent --setup` next to a running app must not restart it.
- Who: agent (obvious)

#### What does the worktree setup do?

- Context: `t3.json` runs a setup command when T3 Code creates a worktree.
- Decision: `scripts/setup-worktree.ts` runs `bun install` with stdin closed and pulls the pinned backend image if missing; it does not start a backend.
- Why: a worktree that never runs the app costs no container; the first `dev:agent` does not wait for the pull. No env files to link: dev:agent writes its own.
- Who: agent (judgement call)

#### What about the failing Vercel check?

- Context: the legacy Vercel integration fails on `main` and on this lot's PRs: its own install leaves `@tanstack/router-utils` without its nested `@babel/generator`, so `vite build` cannot load the config. GitHub CI's build of the same commit passes. Vercel is not a required check.
- Decision: ignore it in the merge gate; do not fix it.
- Why: the failure predates the lot and is specific to Vercel's environment; a failed Vercel deploy leaves the previous one live; lot 0 removes Vercel (ADR 0002).
- Who: agent (judgement call)

#### Can a `.env` deploy key redirect dev:agent?

- Context: the Convex CLI loads `.env` itself, and a `CONVEX_DEPLOY_KEY` there wins over `CONVEX_SELF_HOSTED_URL`; dev:agent strips `CONVEX_*` from its own environment, which unshadowed it. Checked in the CLI source and with a fake key.
- Decision: every Convex child gets `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT_TOKEN` and `CONVEX_DEPLOYMENT` set to empty, which the CLI treats as unset and dotenv never overrides.
- Why: the push and the seed must never leave the worktree's backend.
- Who: agent (obvious)

#### Whose orphans does dev:agent remove?

- Context: Docker is shared by every account on the host, and `existsSync` reports another account's unreadable worktree as missing.
- Decision: resources also carry `netplan.owner=<uid>`; collection lists only the caller's, and a worktree counts as gone only on `ENOENT`.
- Why: never delete another person's data on a shared host.
- Who: agent (obvious)

#### What does `--reseed` do while the app runs?

- Context: it removed the container under a running `convex dev`, which kept the old admin key.
- Decision: it refuses while this worktree's app answers; stop the process first. Every run already restores what is missing, so most resets need no reseed.
- Why: a reset must not leave a half-broken instance.
- Who: agent (judgement call)

#### How does `--status` know the recorded app URL is this worktree's?

- Context: the URL stays in `.env.local` after the app stops, and another worktree's Vite may take the port.
- Decision: it asks the server for this worktree's `package.json` through Vite's `/@fs/` route, which serves only its own workspace.
- Why: an agent must not test someone else's checkout.
- Who: agent (judgement call)

#### Is `.env.local` loadable by a shell?

- Context: AGENTS.md loads env files with `set -a; . file`, and the admin key holds a `|`; unquoted, the shell ran part of the key as a command and printed it in an error (a local, loopback-only key; rotated by reseeding).
- Decision: values are single-quoted; the file is created with mode 0600 instead of chmod after writing.
- Why: the documented way to load secrets must work and must never echo them.
- Who: agent (obvious)

#### Does CI's function push regenerate the files it then checks?

- Context: zipzoup on the tooling PR: `convex dev --once` regenerated `convex/_generated` before `verify`, so a stale committed file was repaired in the checkout and `codegen:check` passed.
- Decision: the push runs with `--codegen disable`; `codegen:check` alone regenerates, against the committed baseline.
- Why: the check must compare the commit, not a repaired checkout.
- Who: agent (obvious)

#### May the lot correct its own ADR 0018 after it merged with the first PR?

- Context: zipzoup (P2) asked for a superseding ADR when the dev-agent PR corrected 0018's description of the seed and the labels; AGENTS.md says an ADR is never rewritten after a change of mind.
- Decision: correct 0018 in place within lot F; a later lot that revises the design supersedes it with a new ADR. Answered in the review thread.
- Why: the decision is unchanged; only the description of this lot's implementation was wrong, and the lot has not landed yet. A superseding ADR inside the same lot would record noise, not a change of mind.
- Who: agent (judgement call)

#### Does `--down` succeed when Docker cannot remove the backend?

- Context: zipzoup (P2): removal results were ignored, so `--down` deleted `.env.local` and reported success with the backend still there.
- Decision: `--down` and `--reseed` fail on a Docker error (`--force` already accepts an absent resource); orphan collection logs it and continues.
- Why: a teardown must not lie; an orphan of another worktree must not block this one.
- Who: agent (obvious)

### L0 — Infra

Questions of 2026-10-15, in the order they came up.

#### How do browser and containers share one set of URLs locally?

- Context: published `127.0.0.1:<port>` URLs work for the browser but not inside containers (app `/health`, Convex reaching Keycloak and its own site origin for better-auth).
- Decision: a Caddy edge publishes one port (`127.0.0.1:8480`) and routes by host name; it carries a Docker network alias for every public host (`netplan.localhost`, `convex.netplan.localhost`, …), so the same URL resolves to the edge from the browser (Chromium maps `*.localhost` to loopback) and from containers (Docker DNS).
- Why: production-shaped (one reverse proxy, host routing), no internal/public URL split to configure; verified with musl and glibc containers. curl special-cases `*.localhost`, so container healthchecks use service names.
- Who: agent (judgement call)

#### Where does the web app get the Convex URLs?

- Context: one image for every installation (ADR 0002); `VITE_*` values are inlined at build.
- Decision: server env `CONVEX_URL` and `CONVEX_SITE_URL`, read at request time by a server function; the root loader returns them and the browser builds a memoised `ConvexReactClient` from them. No `VITE_` prefix, so nothing can inline them.
- Why: the TanStack Start documented pattern; `ConvexReactClient` connects lazily, so creating it from loader data costs nothing in SSR.
- Who: agent (obvious)

#### How are Convex functions deployed in compose?

- Context: `convex deploy` needs the CLI, the functions source and an admin key.
- Decision: a one-shot `convex-deploy` service whose image is built FROM the pinned convex-backend image (Node 22 and `generate_key` inside) plus the functions and `node_modules`; it derives the admin key from `INSTANCE_NAME`/`INSTANCE_SECRET`, deploys, then sets the allowlisted Convex env vars.
- Why: `docker compose up` gives a working stack with no manual key step; shares layers with the running backend (disk is tight); the same image can run as a Kubernetes Job later.
- Who: agent (judgement call)

#### Which Postgres major?

- Context: Postgres 18 is newest; upstream Convex says it is tested with 17.
- Decision: `postgres:17` (pinned minor) in compose.
- Why: the backend's tested version beats "latest" for the database under it; moving to 18 is a dump/restore when upstream tests it.
- Who: agent (judgement call)

#### Are Keycloak and Mailpit part of every install?

- Context: production installs bring their own IdP and SMTP relay.
- Decision: both sit in the compose profile `local`, enabled by `COMPOSE_PROFILES=local` in `.env.example`; production removes it.
- Why: one compose file, no dev-only services in production.
- Who: agent (obvious)

#### How does the Bun app server reach `*.localhost` URLs inside Docker?

- Context: Bun's `fetch` (like curl and Chromium) sends every `*.localhost` name to loopback, ignoring Docker DNS aliases; `/health` from the app container failed. Node, glibc/musl `getaddrinfo` and the Convex backend's action `fetch` follow the aliases.
- Decision: the `app` service uses `network_mode: service:edge`; inside it, `127.0.0.1:<edge port>` is the edge, so the public URLs work. The edge proxies the app host to `127.0.0.1:3000`.
- Why: keeps one set of URLs and Bun as the runtime (vs an internal-URL split or running the image on Node); in production the hosts are real DNS names and both paths reach the edge anyway. Verified: `/health` 200, browser end to end, Convex action reaching Keycloak and convex-site via public URLs.
- Who: agent (judgement call)

#### SSR stylesheet 404 (pre-existing)

- Context: the SSR bundle links `styles-<hash>.css` from its own build, the client build emits a different hash; the link 404s but the client manifest CSS still styles the page.
- Decision: out of L0 scope; record as a leftover for the owner.
- Who: agent (obvious)

#### What goes in the functions image?

- Context: `convex deploy` bundles `convex/` (and the `src/` files it imports) at deploy time, so the image needs their packages; the functions only import `convex`, but `package.json` lists build tools (vite, tanstack, hugeicons) under `dependencies`.
- Decision: the backend image plus `bun install --production --frozen-lockfile` node_modules (~360 MB over the shared 582 MB base). A test keeps `deploy/convex-env.txt` equal to the `process.env` names the functions read.
- Why: correct by construction from the lockfile; a hand-picked `convex` closure breaks silently when a dependency changes. Moving build tools to `devDependencies` would trim it: leftover for the owner.
- Who: agent (judgement call)

#### Does an empty `.env` value clear a Convex variable?

- Context: `convex-deploy` sets every name in `convex-env.txt` on each start; `.env.example` leaves the integration variables empty.
- Decision: an empty value leaves the deployment's value alone; only a non-empty value is set.
- Why: a value set from the dashboard must survive a restart; clearing one is a deliberate dashboard action.
- Who: agent (judgement call)

#### Does the app image run as root?

- Context: the distroless Bun image defaults to root; the server only reads `.output/` and listens on 3000.
- Decision: `USER nonroot` (65532).
- Why: nothing needs root, and a compromise of the server should not own the container.
- Who: agent (obvious)

#### How do operators run Convex CLI commands (export, import, env)?

- Context: backups and upgrades need `convex export`/`import`/`env list` with an admin key, which only the backend's `generate_key` can derive.
- Decision: `deploy/convex.sh` in the functions image derives the key from `INSTANCE_NAME`/`INSTANCE_SECRET` and runs any CLI command; `convex-deploy.sh` uses it too. Operators call it with `docker compose run --entrypoint ./deploy/convex.sh convex-deploy …`.
- Why: no admin key ever lands in `.env` or on screen, and there is one key path for deploy and operations.
- Who: agent (obvious)

#### Which backup procedure is documented?

- Context: the brief asks for Postgres plus Convex storage; upstream recommends `convex export` for upgrades.
- Decision: both: A, `convex export --include-file-storage` (online, portable across versions); B, `pg_dump` plus a tar of the `convex-data` volume with the backend stopped (exact, same version). Both verified by a round trip through `down -v` with identical document counts.
- Why: A is the safe default and the upgrade fallback; B is the fast one for large data and the only one that keeps the backend's internal state as is.
- Who: agent (judgement call)

#### Why did the image's server-rendered page link a missing stylesheet?

- Context: the page served by the image linked `styles-<hash>.css`, which answered 404, while builds from a checkout were fine. Tailwind's automatic source detection scans the working directory, skipping what `.gitignore` lists; the image's build context has no `.gitignore`, so the server build, which runs after the client build, also scanned `.output/` and generated a different stylesheet with a different hash.
- Decision: `@import "tailwindcss" source(".")` limits detection to `src/`. The end-to-end test and the CI image job check that every stylesheet the server renders answers 200.
- Why: the build's output must not depend on which files sit next to it. Scanning only `src/` dropped nothing the UI uses, only stray candidates found in the docs.
- Who: agent (obvious)

#### What goes in `dependencies`?

- Context: the functions image installs `dependencies` (361 MB, mostly icons and build tools), yet the app ships as a self-contained Nitro bundle and the functions import only `convex`.
- Decision: `dependencies` is `convex` alone; everything else is a dev dependency. A test fails if `dependencies` lists a package `convex/` does not import. The functions image drops from 944 MB to 636 MB; the app image is unchanged at 98.5 MB.
- Why: "runtime" for a bundled app is the bundle; only the functions deploy installs packages.
- Who: agent (judgement call)

### L3a — Floor overlay

Questions of 2026-10-15 and 16, in the order they came up.

#### Does the plan already have a unit in metres?

- Context: calibration needs "real distance in metres → plan units". Nothing in src/ or convex/ defines a scale; the grid is 20 units, walls are one 20×20 block.
- Decision: fix 100 plan units = 1 m (a cell/wall block = 20 cm), recorded in ADR 0024 (drafted as 0022; renumbered when lot 2 took 0022 and 0023).
- Why: 20 cm walls are realistic, the seed's rooms and racks come out at plausible sizes (tech room ≈ 4.8 × 3.2 m), and ADR 0011 says the map keeps its own grid and the image is calibrated, so the scale must be a constant, not a per-floor setting.
- Who: agent (judgement call)

#### How do we keep SVG/PDF from running anything?

- Context: an SVG served from the Convex storage origin can run script if opened directly; PDFs need a renderer.
- Decision: rasterize both in the browser at import (SVG via `<img>` → canvas, PDF via pdf.js, chosen page) and store only PNG/JPEG.
- Why: a raster image cannot execute; no sanitizer to keep up to date; the calque is a visual guide only (Q16), so vector fidelity is not needed.
- Who: agent (obvious)

#### Upload URL or action?

- Context: Convex `generateUploadUrl` lets the client store any bytes with any content type before the server sees them.
- Decision: an Éditeur action receives the bytes, checks the PNG/JPEG signature, size and dimensions, then stores them and records a `floorOverlayFiles` row.
- Why: nothing unchecked ever lands in storage, and the pixel size comes from the server, not the client.
- Who: agent (judgement call)

#### Is show/hide shared or personal?

- Context: brief lists show/hide among the controls; readers "see it but cannot change it".
- Decision: personal and session-only (Zustand); opacity and lock are durable.
- Why: hiding the calque to check the drawn plan is a viewing need every role has; a durable hide by one editor would hide it from everyone. Removing it is the durable way.
- Who: agent (judgement call)

#### What does "lock" protect against?

- Decision: lock blocks placement changes (move, resize, rotate, calibrate) and replacement/removal, on the client and the server, unless the same change unlocks. Opacity stays editable.
- Why: the risk is nudging a calibrated calque while drawing walls over it; fading it is exactly what you do while drawing.
- Who: agent (judgement call)

#### When are calque files deleted?

- Decision: a daily cron deletes files no calque references once they have been unused for 7 days.
- Why: undo/redo can bring back a replaced or removed calque, so deletion must wait; undo history is per session.
- Who: agent (obvious)

#### Is the calque one more draw tool?

- Context: the toolbar's draw tools (wall, eraser, device) are mutually exclusive; the calque panel could have been one of them.
- Decision: the panel is its own state (`isOverlayPanelOpen`), opened from a "Calque" button or `C`, and closes when a draw tool, multi-select or a device is chosen; edit tools are dropped together when edit rights go.
- Why: the panel is settings, not a pointer mode; making it a DrawTool would have forced wall drawing off while the panel is open, and the brief wants walls drawn over the calque.
- Who: agent (judgement call)

#### What is stored for each import format?

- Decision: PNG and JPEG are re-encoded through a canvas too; SVG renders through `<img>`; a PDF page renders at 200 dpi with its longest side capped at 8192 px. The result is PNG unless that exceeds the 15 MB client cap, then JPEG on white, then smaller.
- Why: re-encoding strips metadata and any trailing payload; 200 dpi keeps 1:100 plans legible at the zoom used to draw walls; the cap stays under Convex's 16 MiB action argument limit (checked against the self-hosted backend).
- Who: agent (judgement call)

#### Where does a new or replaced calque land?

- Decision: a first import is fitted to 80 % of the visible area at opacity 0.6; a replacement keeps the old centre, rotation, opacity and width on the plan (a locked calque must be unlocked before it can be replaced).
- Why: the user sees the calque immediately; replacing a plan with a newer revision of the same drawing should not lose its calibration.
- Who: agent (judgement call)

#### Reader gating for the calque UI

- Context: L1 (#21) landed `useCanEdit` while PR2 was in review.
- Decision: the panel, its shortcut and the toolbar button follow L1's edit-mode gating; readers keep the personal hide toggle.
- Why: no extra checks needed; the server already rejects reader writes.
- Who: agent (obvious)

#### When does the placement gizmo show, and does it snap?

- Decision: the move/resize/rotate frame shows only while the Calque panel is open in edit mode and the calque is unlocked; it reads the pointer without the wall grid's snap.
- Why: outside the panel the canvas is for walls and devices, and the frame would steal their clicks; snapping to the 20-unit grid made a resize land on 8.12 m instead of 7.98 m, and a plan must align freely.
- Who: agent (judgement call)

#### How many operations does a gesture send?

- Decision: a gesture previews through a local Zustand draft and commits one `overlay.patch` on release; the opacity slider does the same on release or key up.
- Why: one gesture is one undo step, the outbox is not flooded with intermediate positions, and other users see only the final placement.
- Who: agent (obvious)

#### Which shortcuts?

- Decision: `C` opens the panel, `Shift+L` toggles the lock, `Shift+E` starts calibration, all only while the panel's controls apply.
- Why: `L` and `E` were taken (edit mode is `E`); the shifted forms read as "the calque's L/E" and bare bindings never match shifted events.
- Who: agent (judgement call)

#### Scale field: pixels-per-unit or metres?

- Decision: the panel shows and edits the calque's width in metres (decimal comma), not the raw scale.
- Why: users know how wide their building is; the scale factor means nothing to them.
- Who: agent (obvious)

#### How does pdf.js find its decoders, fonts and CMaps?

- Context: pdf.js 6 loads wasm decoders, standard fonts and CMaps on demand; without them some PDFs render blank glyphs or fail. zipzoup flagged it (P2).
- Decision: `openPdf` passes a `BinaryDataFactory` that resolves each asset from lazy `import.meta.glob` URLs into the package, with `assetsInclude` for the binary types.
- Why: self-hosted means no CDN at run time; lazy globs keep them out of the main bundle until a PDF needs them.
- Who: agent (obvious)

#### What happens to an import still running when the panel closes?

- Decision: each import takes an id; a new import, a reset or unmounting the panel bumps it, and the upload and the `overlay.set` check it first. A failed PDF open destroys its loading task.
- Why: a slow upload must not place a calque the user walked away from (zipzoup P2).
- Who: agent (obvious)

#### How is the scale calibrated?

- Decision: two clicks on the calque, then the real distance in metres; the image scales about the first point, as one `overlay.patch`. The points are kept in image pixels with the file id, so they follow a calque that moves and are dropped if its file is replaced; two points under 10 image pixels apart are refused, as is a distance that would leave the scale bounds.
- Why: scaling about the first point keeps a known corner where it was; image pixels are what the user actually clicked on; under 10 px a one-pixel click error is already 10 %.
- Who: agent (judgement call)

#### Why did a real mouse not reach the gizmo?

- Context: browser checks with synthesised pointer events passed, yet a real drag panned the canvas.
- Decision: React Flow's `.react-flow__viewport` sets `pointer-events: none`, inherited by `ViewportPortal` children; the gizmo and the calibration layer set `pointer-events-auto`. Browser checks of canvas gestures now use real mouse drags.
- Why: synthesised events skip hit testing, so they cannot prove an element is reachable.
- Who: agent (obvious)

### L1 — Auth

Questions of 2026-10-15 and 16, in the order they came up.

#### Which better-auth version?

- Context: deps stay on latest, but `@convex-dev/better-auth` 0.12.5 (latest) declares `better-auth >=1.6.11 <1.7.0`; better-auth latest is 1.7.10.
- Decision: `@convex-dev/better-auth@latest` with `better-auth@1.6.33` (latest of the supported line).
- Why: the component is the integration point; running outside its peer range is unsupported. 1.7 also moves the OIDC callback path, which is planned work (ADR 0003).
- Who: agent (obvious)

#### How are role identifiers stored?

- Context: roles are Lecteur / Éditeur / Admin (ADR 0004); the repo is in English, the UI in French (ADR 0016).
- Decision: stored as `reader | editor | admin` on the better-auth user (admin plugin `role`), labelled in French in the UI. `defaultRole: "reader"`, `adminRoles: ["admin"]`.
- Why: code and data stay English; labels are a UI concern.
- Who: agent (obvious)

#### Where is the Keycloak role mapping applied?

- Context: the admin plugin's `role` field is `input: false`, so better-auth drops it from `mapProfileToUser` / `overrideUserInfo` output; ADR 0004 asks for a re-read at every login, not at every token refresh.
- Decision: a `session.create` database hook. When the session is created by the Keycloak OAuth callback, it reads the user's Keycloak account tokens (already refreshed by that callback), collects `realm_access.roles`, `resource_access[clientId].roles`, `roles` and `groups`, maps them with the admin-chosen names (Admin wins over Éditeur) and writes `user.role`; no match gives `reader`.
- Why: runs exactly once per login, on the server, after tokens arrive from the token endpoint over the backchannel; it is the only point where better-auth lets us write a non-input field.
- Who: agent (judgement call)

#### Can a Keycloak login attach to an existing local account with the same email?

- Context: better-auth links implicitly when the provider is trusted or the email is verified; a local admin account would then be reachable through Keycloak, and its role would flip to the Keycloak mapping.
- Decision: implicit account linking is off. A Keycloak login whose email belongs to a local account fails with a French message asking the admin to delete one of the two.
- Why: one account has one source of truth for its role (ADR 0004: local roles set by the admin, SSO roles by Keycloak). Reversible later.
- Who: agent (judgement call)

#### How does an invited user set a password?

- Context: no sign-up; better-auth has no invitation flow outside the organization plugin; `admin.createUser` accepts no password.
- Decision: the admin creates the user without a password; Netplan creates a `reset-password:<token>` verification valid 7 days and mails a link to a French "Choisir un mot de passe" page; `resetPassword` creates the credential account. Re-sending an invitation issues a new token.
- Why: reuses better-auth's own reset path end to end (hashing, token check, credential creation) instead of a parallel flow.
- Who: agent (judgement call)

#### Can an SSO user use "forgot password"?

- Context: better-auth's `resetPassword` creates a credential account when the user has none, so a reset mail to an SSO-only user would give them a local password that bypasses Keycloak (and its role removal).
- Decision: `sendResetPassword` sends nothing to users without a credential account (and the request still answers success, so it leaks nothing); invitations are only issued to users with no Keycloak account. Password reset also revokes the user's other sessions.
- Why: keeps Keycloak the only door for SSO accounts.
- Who: agent (obvious)

#### What does "désactiver" mean?

- Context: the admin page must disable users.
- Decision: better-auth admin `banUser` (no expiry) — it revokes the sessions and blocks both password and Keycloak logins; "réactiver" is `unbanUser`.
- Why: built-in, covers both methods, keeps the user's history attributions.
- Who: agent (obvious)

#### How long does a session last?

- Context: Q24 B: 24 hours.
- Decision: `session.expiresIn` 24h with `disableSessionRefresh: true`, so the 24 hours are absolute, not sliding.
- Why: a sliding session would never pick up a Keycloak role removal for a user who stays active (ADR 0004 bounds that delay by the session length).
- Who: agent (obvious)

#### How is authorization enforced on every Convex function?

- Context: ADR 0003/0004: every public function checks session and role on the server.
- Decision: `convex/lib/functions.ts` exports `readerQuery`, `editorMutation`, `adminMutation`, … built with convex-helpers custom functions; they load the user through the better-auth component (session validated in the database, banned users refused) and put `ctx.user` in the context. An oxlint `no-restricted-imports` rule forbids the raw `query`/`mutation`/`action` builders outside that file; the connector's machine-authenticated actions (deleted in L2) carry the only exception. Behaviour tests cover each role on each function group.
- Why: a wrapper makes the check impossible to forget, the lint rule makes it impossible to bypass silently, the tests prove the levels.
- Who: agent (obvious)

#### Which role does each function need?

- Context: ADR 0004 role semantics.
- Decision: reads → Lecteur; map, building and floor edits and manual refresh → Éditeur; sites, integrations, users, role mapping, SMTP test → Admin; presence → any signed-in user (on their own row only).
- Why: direct reading of ADR 0004.
- Who: agent (obvious)

#### What replaces the `netplan-identity` client identity?

- Context: the local identity also seeds object ids and operation ids (`clientId`).
- Decision: the stored identity and pseudonym lists are deleted; presence name and colour come from the signed-in user on the server; `clientId` becomes a random value per page load kept in memory (still needed for id uniqueness and own-operation echo). No identity key remains in `localStorage`.
- Why: the server must not trust a client-supplied name; a per-tab id is all the engine needs.
- Who: agent (obvious)

#### How is the first admin created?

- Context: no sign-up; a fresh install has no user.
- Decision: internal action `bootstrap:ensureFirstAdmin` (an action because better-auth's `createUser` hashes the password and calls the component), a no-op once any admin exists, reading `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_NAME` from Convex env or from arguments; L0's deploy one-shot runs it after `convex env set`, and `bun run auth:bootstrap-admin` runs it by hand.
- Why: works unattended in compose and by command, as ADR 0003 asks.
- Who: agent (obvious)

#### How is mail sent?

- Context: SMTP by env (Q6 B / Q15 A); Convex runs mutations in its V8 runtime.
- Decision: a `"use node"` internal action with nodemailer, scheduled from the auth callbacks; env `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. The self-hosted backend image ships Node 22, so node actions work there.
- Why: standard, no extra service; scheduling keeps the HTTP auth request fast and retries out of it.
- Who: agent (obvious)

#### How do browser and Convex both reach Keycloak in dev?

- Context: the browser uses a published `127.0.0.1` port; the per-worktree Convex container cannot reach that address.
- Decision: in compose, L0's edge gives one `*.localhost` URL that works from both sides. In `dev:agent`, the shared dev Keycloak runs with hostname v2 (`KC_HOSTNAME` = browser URL, `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`) on a `netplan-dev` Docker network the worktree backends join, so discovery fetched through the internal name returns backchannel endpoints on the internal name and browser endpoints on the public one.
- Why: one issuer, no per-worktree Keycloak; matches L0's compose shape.
- Who: agent (judgement call)

#### Which ADR number?

- Context: L0 writes the deployment ADR at the same time.
- Decision: L0 takes 0020, L1 takes 0021.
- Who: agent (obvious, agreed with L0)

#### How is L1 split into pull requests?

- Context: one concern per PR (ADR 0019); the lot touches every Convex function, the routes, presence, mail, an admin page and Keycloak.
- Decision: five stacked layers: (1) auth core, role builders on every function, login page, sign-out, seeded accounts; (2) a read-only map for readers; (3) presence and identity from the signed-in user; (4) mail, invitations, forgotten password and the bootstrap script; (5) admin users page, Keycloak role mapping and dev realm, docs and this journal.
- Why: each layer is reviewable and green on its own; layer 1 is the smallest change that makes the app require a login.
- Who: agent (judgement call)

#### How does the Convex backend verify its own tokens in dev?

- Context: better-auth's Convex plugin signs JWTs whose JWKS URL derives from the backend's `CONVEX_SITE_URL`, and the backend fetches that URL itself; dev:agent published the site port on a host port the container cannot reach.
- Decision: dev:agent (and CI) set the backend's `CONVEX_SITE_ORIGIN` to its in-container address `http://127.0.0.1:3211`; the app server reaches the site through the published port, which dev:agent writes as `CONVEX_SITE_URL` in `.env.local`.
- Why: no static JWKS to keep in sync; production has one public site URL that both sides reach.
- Who: agent (obvious)

#### Which level does `sites.ensureDefault` need?

- Context: ADR 0004 gives site management to Admin, but the sidebar's "create the default map" flow, available to editors, calls it.
- Decision: Éditeur, until the site pages (L2+) replace that flow.
- Why: it only creates the default site when none exists; requiring Admin would break an editor's first-map flow.
- Who: agent (judgement call)

#### How is "every public function is authorized" tested?

- Context: the brief asks for server-side authorization on every function, with tests.
- Decision: each role builder tags the function with its level; a test imports every module under `convex/`, compares the tags with an explicit policy table, and fails on a new or changed function. Behaviour tests check unauthenticated, banned, expired, reader, editor, admin and unknown-role callers.
- Why: proves coverage without a test per function, and a level change is a visible diff.
- Who: agent (judgement call)

#### What is rate-limited, and by which address?

- Context: better-auth rate-limits by client IP read from `X-Forwarded-For`; requests reach Convex through the app server, and without that header every user shares one bucket. Token and session reads run on every page load.
- Decision: rate limiting stays on (database storage) for sign-in and other auth endpoints; `/convex/token` and `/get-session` are exempt. The edge (L0) must set a single-address `X-Forwarded-For`; the app proxy forwards it.
- Why: the limit is about guessing credentials; counting session reads would write a row per page load and lock everyone out together behind a misconfigured edge.
- Who: agent (judgement call)

#### What happens to an open page when its session ends?

- Context: the Convex JWT stays valid for a while after a sign-out in another tab, an expiry or a ban; functions then refuse with `unauthenticated` and the page showed a raw error.
- Decision: the signed-in layout uses the component's `AuthBoundary` on `users.me`; an `unauthenticated` refusal sends the user to the login page with a redirect back.
- Why: verified in the browser with two tabs; a reload alone would loop on the error.
- Who: agent (obvious)

#### Should a reader still see edit tools?

- Context: the server refuses a reader's edit, but the map still offers edit mode and the dev map controls, and the refusal surfaced as an unhandled error.
- Decision: a dedicated layer gives readers a read-only map (no edit mode, no edit shortcuts or controls) and shows a server refusal.
- Why: "the server rejects what the client prevents"; separate from layer 1 to keep that PR about authentication.
- Who: agent (obvious)

#### How does the backend fetch its own JWKS under dev:agent?

- Context: after #15, the Convex CLI writes the backend's reported site URL into `.env.local` as `CONVEX_SITE_URL`, which the app server now reads; making the backend report its in-container origin (above) left the app server proxying to an address that only works inside the container.
- Decision: the container reports its published site URL again, and an optional Convex variable, `AUTH_JWKS_URL`, replaces the JWKS address in `auth.config.ts`; dev:agent sets it to the in-container port. Reading an unset variable there throws (`AuthConfigMissingEnvironmentVariable`) and `"X" in process.env` is always false, so a `try`/`catch` keeps it optional. Compose passes it empty.
- Why: a static JWKS puts a private key in the environment and needs a second push; the backend refuses a repeated port flag, so the image's flags cannot be overridden.
- Who: agent (judgement call)

#### How was the lot actually split?

- Context: the five layers planned above grew as reviews and L2's work landed alongside.
- Decision: eight pull requests: login and role builders (#13), the read-only map for readers (#21), real-name presence (#24), the SMTP relay and dev Mailpit (#26), forgotten password (#29), waiting for the token before the first query (#30), the users page with invitations, roles, disabling and test mail (#33), and Keycloak sign-in with the role mapping and dev realm (#37), then this closing docs change.
- Why: invitations, mail and Keycloak each carried enough review on their own; #30 fixed a race L2 reported.
- Who: agent (judgement call)

#### Was the shared dev Keycloak built?

- Context: the entry on reaching Keycloak in dev planned one shared Keycloak on a `netplan-dev` network.
- Decision: no. The realm ships in the compose `local` profile (`deploy/keycloak/import/`); browser checks under dev:agent ran a Keycloak built from that directory, attached to the worktree's backend network and removed afterwards. dev:agent starts no Keycloak.
- Why: every check needed one Keycloak for a few hours; a permanent shared service is something to run and secure for nothing the tests do not already cover.
- Who: agent (judgement call)

#### Does `sites.ensureDefault` still exist?

- Context: the entry above gave it Éditeur until the site pages replaced it.
- Decision: L2's site pages (#28) removed it; creating a site is Admin only.
- Who: agent (obvious)

#### Why does the first query wait for the token?

- Context: on a page loaded with a session, children of `ConvexBetterAuthProvider` subscribe before the provider sets the token, so `users.me` went out anonymous, failed as `unauthenticated`, and `AuthBoundary` could send a signed-in user to `/login`.
- Decision: the Convex client is built with `expectAuth` when the root route found a session cookie; a signed-out page does not wait.
- Why: sign-in and sign-out are full page loads, so the choice holds for the client's life.
- Who: agent (obvious)

#### Where does the Keycloak role mapping live?

- Context: ADR 0004 says the admin chooses the Keycloak role names; environment variables would need a redeploy to change them.
- Decision: an `authSettings` table holds the editor and admin names, set from a Keycloak section of the users page that also shows the issuer, client and redirect URI to register; the same name for both is refused. A Keycloak account's role is locked on that page.
- Why: an admin changes the mapping without touching the deployment, and one place decides each account's role.
- Who: agent (obvious)

#### How does the login page know Keycloak is on?

- Decision: a small better-auth plugin answers `GET /api/auth/sign-in-options` with `{ keycloak }`, true only when issuer, client id and secret are all set; the server reads it before rendering the login page.
- Why: the button must not appear on an installation without Keycloak, and the client cannot read Convex variables.
- Who: agent (obvious)

#### Is turning account linking off enough?

- Context: zipzoup (P1) found that linking from a signed-in session ignores `accountLinking.enabled`, and that generic OAuth also registers Keycloak with `/link-social`.
- Decision: both `/oauth2/link` and `/link-social` are disabled; a test signs in through Keycloak and expects 404 from each (it got 200 from `/link-social` without the fix).
- Why: a local account linking a Keycloak identity would keep its local role at password logins.
- Who: agent (obvious)

#### Where does a cancelled Keycloak login land?

- Context: the OAuth callback redirects `error=access_denied` and state errors before it reads the sign-in state, so the `errorCallbackURL` does not apply and better-auth's English `/error` page showed (zipzoup P2).
- Decision: `onAPIError.errorURL` is `<SITE_URL>/login`; the login page maps the codes to French messages and never echoes the provider's text. Only OAuth routes use that setting.
- Who: agent (obvious)

#### How strict is the rate limit on starting a Keycloak login?

- Context: the `/sign-in/*` rule allows 3 attempts per 10 s per address, and a team behind one NAT signs in together in the morning.
- Decision: `/sign-in/oauth2` has its own rule of 100 per 10 s; Keycloak guards the password itself.
- Who: agent (judgement call)

#### What name does a Keycloak user without first and last names get?

- Context: Keycloak omits `name` for such a user, and better-auth refuses a login without a name.
- Decision: `mapProfileToUser` takes the first of `name`, `preferred_username` and `email`.
- Who: agent (obvious)

### L2 — Domain model

Questions of 2026-10-15 and 16.

#### Does a device stay tied to a floor?

- Context: ADR 0005 says a device can exist without being placed; today `devices.floorId`, `position` and `size` are required, and devices have no site.
- Decision: a device belongs to a site; its placement (floor, position, size) is optional. Placing and unplacing are map operations (`device.place` / `device.unplace`, inverse of each other); `device.delete` removes the device from the inventory.
- Why: an unplaced device is the normal state of anything imported from NetBox or created from an unknown MAC; the map stays the only place positions change, so undo keeps working.
- Who: agent (obvious)

#### Where do identity edits go: map operations or plain mutations?

- Context: name, hostname, serial, MACs, model and IP are inventory facts, edited in the drawer or the inventory page, sometimes for an unplaced device that has no floor document.
- Decision: identity, ports and cables are edited through site-scoped Éditeur mutations, not map operations. The map history keeps geometry (create, place, unplace, move, resize, delete, walls). Destructive inventory edits offer an "Annuler" toast that applies the inverse.
- Why: map operations are floor documents with one revision each; an unplaced device or a cross-floor cable has no single floor. Splitting keeps both models simple.
- Who: agent (judgement call)

#### How are source-owned fields enforced?

- Context: ADR 0007; NetBox provides name, type, serial, MACs, model and primary IP.
- Decision: a sourced device records its source (integration, external id, URL, last sync). The fields that source owns are a fixed list per provider in shared code; the server rejects edits to them and the drawer shows them read-only with a "NetBox" badge and link. Hostname, notes and placement stay editable.
- Why: one list read by both the UI and the server cannot drift.
- Who: agent (obvious)

#### What replaces links?

- Context: links join two devices on one floor with free-text port names; ADR 0009 wants port-level cables across floors.
- Decision: a `ports` table (device, name, kind interface/front/rear, rear pairing, order, source) and a `cables` table (two port ids, label, source), one cable per port, site-scoped. New devices get default ports per type. A trace follows cables and front↔rear pairs until it reaches a wall socket. Links and the `link.*` operations are removed; drawing cables on the map is L3b.
- Why: the trace "switch port → socket" is what localisation needs, and NetBox cables at the real site go through patch panels' rear ports.
- Who: agent (judgement call)

#### Which new device types, and how are NetBox roles mapped?

- Context: the real NetBox site has roles workstation, render, laptop, nas, printer, proxmox, windows, wall_socket, patch-panel, switch_access, switch-core, and 16 devices without role.
- Decision: add `endpoint` (Terminal) and `patch-panel` (Panneau de brassage). The admin maps each NetBox role to a Netplan type or "ignorer"; unmapped roles default to "ignorer". Racks are not imported. No name regex.
- Why: ADR 0005; an explicit mapping is predictable and the admin sees every role.
- Who: agent (obvious)

#### How are LibreNMS port names matched to inventory ports without vendor rules?

- Context: LibreNMS reports `Gi1/0/18` in ifName and `GigabitEthernet1/0/18` in ifDescr; NetBox names the rear port `GigabitEthernet1/0/18`. The old code expanded Cisco prefixes.
- Decision: first an exact case-insensitive match on ifName or ifDescr; otherwise split each name into a leading alphabetic part and the rest, and match when the rests are identical and one alphabetic part is a prefix of the other. A match must be unique across the ports of every Netplan switch mapped to that LibreNMS device; otherwise the port is reported unmatched.
- Why: it covers the usual abbreviation scheme of every vendor without a table, and refuses rather than guesses on ambiguity.
- Who: agent (judgement call)

#### How does a NetBox import merge with devices Netplan already has?

- Context: ADR 0008. The real NetBox site has many devices with the serial "System Serial Number".
- Decision: per NetBox device, candidates are Netplan devices of the site without a source sharing a MAC or a serial. Serials on a small denylist (placeholders such as "System Serial Number", "To be filled by O.E.M.", "Default string", "0", "N/A") and any serial or MAC carried by more than one NetBox device of the import are ignored for matching. One candidate and no contradiction (a different non-empty serial, or MACs that are disjoint where both have some) → automatic merge. No identifier match but one hostname match → a suggestion an Éditeur confirms (merge) or rejects (import as new); the NetBox device waits until then. Several candidates or a contradiction → an admin conflict; nothing is imported for that device until resolved.
- Why: shared placeholders would merge unrelated machines; holding the device avoids creating a duplicate that would itself need merging.
- Who: agent (judgement call)

#### What happens to a device that disappears from NetBox?

- Context: imports run every 15 minutes; a removal in NetBox may be a mistake or a decommission.
- Decision: an unplaced device that disappears is deleted with its ports and cables; a placed one loses its source binding and becomes a manual device, keeping its position.
- Why: nobody invested anything in an unplaced import; a placed device was put there by a person.
- Who: agent (judgement call)

#### Which devices does the LibreNMS cycle localise, and when is a MAC "unknown"?

- Context: FDB tables list every MAC on every port, including uplinks where hundreds of MACs appear.
- Decision: a sighting counts on an edge port: a port whose trace reaches a socket, or an uncabled port with at most four MACs. Devices of type pc and endpoint with a MAC sighted there become online at that socket; after two cycles without a sighting they become offline. A sighted MAC that belongs to no device of the site is listed as unknown with "Créer l'équipement".
- Why: uplinks and trunks would put every MAC everywhere; four covers a phone with a PC behind it plus a virtual machine or two.
- Who: agent (judgement call)

#### Does localisation move devices on the map?

- Context: the product places each PC where the network last saw it.
- Decision: when a device's observed socket changes, or it is seen while unplaced, the cycle places it next to the socket (rings around the socket, snapped to the grid, avoiding collisions) on the socket's floor, as a system change that bumps the floor revisions. If the socket is unchanged, a position chosen by a person is kept.
- Why: same rule as the old projection, without fighting manual adjustments.
- Who: agent (obvious)
- Update (agent, #54): the move goes through the map's operations with the client id `librenms` rather than as a separate system write; see "When does a sighting move a device on the map?".

#### Where are integration tokens decrypted, and with what?

- Context: ADR 0006; Convex mutations are deterministic and cannot call sources.
- Decision: AES-256-GCM with Web Crypto inside actions only. Key `NETPLAN_SECRET_KEY` (32 bytes, base64) in the Convex environment; `NETPLAN_SECRET_KEY_PREVIOUS` is accepted for decryption during a rotation, and an admin action re-encrypts every token with the current key. The additional data binds the ciphertext to the integration row and provider. No query returns ciphertext; the admin sees "configuré" or not.
- Why: real randomness for IVs and the network only exist in actions; binding prevents copying a ciphertext to another integration.
- Who: agent (obvious)

#### How is the cadence scheduled?

- Context: ADR 0010; the old scheduler had hard-coded French holidays and a workflow/attempt machinery for the external agent.
- Decision: a cron every minute reads sites with automatic refresh on, and starts a cycle for each site whose next run is due, under a per-site lease. A cycle syncs NetBox if the last sync is 15 minutes old or the refresh is manual, then runs LibreNMS: trigger a discovery on each mapped switch not triggered in the last five minutes, wait up to two minutes for `last_discovered` to move, read ports and FDB, publish. The next run is 5 minutes after the start during business hours (07:00–20:00 Mon–Fri in the site's time zone), 60 minutes otherwise, with backoff after failures. No holidays.
- Why: one loop per site is all the product needs; the leases prevent overlap; five minutes between discoveries is the LibreNMS budget.
- Who: agent (judgement call)

#### Can the legacy pipeline be deleted before the new workers are validated?

- Context: ADR 0012 says the workers are validated against the real sources before the agent is deleted. The legacy tables are keyed on NetBox objects and cannot coexist with the new device model; the agent's systemd timer is inactive and its unit files point at a deleted path; nothing is deployed.
- Decision: the legacy pipeline (agent, connector, orchestration tables, `ops/systemd`) is deleted early in the stack, and the lot is not reported done until the new workers are validated against the real NetBox and LibreNMS. The dangling user units are removed and systemd reloaded.
- Why: owner Q13 order changed by agent; reason: keeping both would mean porting the old pipeline to a schema it was not written for, only to delete it, and there is no running deployment whose localisation would stop.
- Who: agent (judgement call), approved by the orchestrator

#### How are dev credentials put into the local instance without printing them?

- Context: the mandate wants the real NetBox/LibreNMS configured in the dev site; tokens live in `~/.zshrc`.
- Decision: `bun run dev:agent --integrations` reads `NETBOX_URL/TOKEN` and `LIBRENMS_URL/TOKEN` from its own environment and calls an internal seed action with the admin key over HTTP, which encrypts them into the demo site. Nothing is echoed, passed on a command line, or written to disk.
- Why: command-line arguments are visible in the process list; the admin UI would put the token in a transcript.
- Who: agent (obvious)

#### LibreNMS is unreachable from this host

- Context: `$LIBRENMS_URL` resolves to a Tailscale address and Tailscale is stopped on the host; requests time out.
- Decision: build and test the LibreNMS worker against payload fixtures (real recordings if any exist, otherwise from the API docs); the real validation is a separate final step with a script and a checklist in docs/operations. If Tailscale is still down when the rest is merged, the lot ends with NetBox validated for real and LibreNMS against fixtures, listed as open.
- Why: bringing the node up changes the owner's host networking; the orchestrator asked the owner and said not to run `tailscale up`.
- Who: orchestrator
- Update (orchestrator, later): Tailscale is up with the owner's authorisation, but the host is on the owner's personal tailnet and no peer owns or routes to the LibreNMS address, so it still times out. The plan is unchanged: fixtures, then a real-validation script and checklist; the agent does not touch Tailscale settings.

#### Where does the map keep the site it shows?

- Context: the default site is gone, and several sites can exist.
- Decision: in the map URL (`/?site=<id>`); without one the map shows the first site by name, and the sidebar picks between sites when there is more than one.
- Why: a link to a site's plan can be shared, and reload keeps it; nothing new in `localStorage` (AGENTS.md allows only the identity key).
- Who: agent (obvious)

#### Can an admin delete a site that has buildings?

- Context: buildings, floors and devices belong to a site.
- Decision: no; a site is deleted only when empty, and the page says why.
- Why: deleting a site must never silently delete a plan; buildings already have their own delete path.
- Who: agent (judgement call)

#### Who creates the admin shell?

- Context: L1 (users) and L2 (sites) both need `/admin`; agreed that whoever lands first creates it.
- Decision: L2 creates `src/routes/_authed/admin.tsx`, `admin/index.tsx` and `src/admin/sections.ts` in its sites PR; L1 adds its users section to `ADMIN_SECTIONS`.
- Why: L1 had not started it.
- Who: agent, agreed with L1

#### Who validates the site forms: the browser or the app?

- Context: the cadence fields are native number and time inputs; the browser blocks submission with its own English bubbles.
- Decision: the forms are `noValidate`. The rules in `src/sites/settings.ts` run on submit and on the server, and show one French error, which clears when a field changes.
- Why: one source of rules and one language; the server must reject the same things anyway.
- Who: agent (obvious)

#### An empty site's map still shows the old dev controls

- Context: a site with no building shows the English "create demo" controls and a "Plan indisponible" that never resolves.
- Decision: left for the lot that owns the map's empty states; recorded in PR #28's Scope.
- Why: out of L2's domain, and it is visible only on a new site.
- Who: agent (judgement call)

#### Where do PR screenshots live?

- Context: AGENTS.md says to upload them to the PR and never commit them; `gh` cannot attach images to a PR body.
- Decision: a secret gist per PR, referenced by its raw URLs.
- Why: they stay out of the repository and render in the PR.
- Who: agent (obvious)

#### No migration for sites in the old shape (zipzoup P1 on #28)

- Context: #28 reshapes `sites`; a backend seeded before it refuses the schema push.
- Decision: answered as intended, no migration. Local backends use `dev:agent --reseed`; L1 and L3a were told.
- Why: ADR 0022 restarts data from zero and nothing is deployed; a shim would outlive its use.
- Who: agent (following the owner's "data restarts from zero")

#### How is a key rotation run?

- Context: `NETPLAN_SECRET_KEY_PREVIOUS` decrypts during a rotation; every token must then be re-encrypted.
- Decision: an internal action, `convex run integrations:reencryptTokens`, documented in docs/operations/configuration.md; no admin button.
- Why: a rotation is an operator's act on the deployment, done with its environment, not a site setting.
- Who: agent (judgement call)

#### What is a token bound to?

- Context: AES-GCM additional data can tie a ciphertext to its context.
- Decision: site + tool + normalised address. Changing the address requires entering the token again.
- Why: a token is never sent to an address other than the one it was entered for, even by an admin's mistake.
- Who: agent (judgement call)

#### What does "Enregistrer et tester" do when the test fails?

- Decision: the connection stays saved and the failure is shown and stored as its last check.
- Why: an unreachable tool (LibreNMS today) must still be configurable; the collection reports the failure later too.
- Who: agent (obvious)

#### How do tests replace fetch?

- Context: the happy-dom preload makes `globalThis.fetch` an accessor, which `spyOn` cannot wrap in a full run.
- Decision: `convex/_test/fetch.ts` `stubFetch`, defineProperty-based, with no `bun:test` import because Convex bundles that folder.
- Who: agent (obvious)

#### How is the inventory work split?

- Decision: device types first (#34), then devices as site inventory (identity, optional placement), then the inventory page, then ports and cables, then the workers.
- Why: each layer is green on its own and the types are needed by every later one.
- Who: agent (judgement call)

#### Device types without a hotbar

- Context: the device hotbar was removed in 9723bf4; the registry still declared a toolbar entry and a key per type, read by nothing.
- Decision: #34 adds `patch-panel` and `endpoint` to the demo seed to be visible; #35 removes the dead toolbar and key config. Placement comes back from the inventory page.
- Why: inventing a key for a tool nobody can reach is config for nothing.
- Who: agent (obvious)

#### Endpoint size and label

- Decision: 80×80 with a wrapping uppercase label, like a workstation.
- Why: at 60×60 a hostname was cut after five characters.
- Who: agent (obvious, seen in the browser)

#### What happens to a floor's devices when the floor is removed?

- Decision: they lose their placement and stay in the site inventory, with their MACs and identity.
- Why: a device exists apart from where it stands (ADR 0022); removing a floor plan does not remove the hardware.
- Who: agent (follows from ADR 0022)

#### What does the dev "Clear map" do to devices?

- Context: with unplacing, reseeding after a clear collided with the leftover demo devices' ids and MACs.
- Decision: `clearMap` deletes the site's devices that no integration owns, with their MACs; sourced ones are only unplaced.
- Why: it is a reset of drawn data; a sourced device would come back at the next sync anyway.
- Who: agent (judgement call)

#### How is per-site MAC uniqueness enforced?

- Decision: a `deviceMacs` table, one row per (site, MAC) pointing at its device, written in the same mutation as the device; MACs canonical `aa:bb:cc:dd:ee:ff`, at most 32 per device.
- Why: Convex has no unique constraint or array index; one indexed lookup also serves the collectors' sightings later.
- Who: agent (obvious)

#### Are MACs visible to a Lecteur?

- Decision: yes, they are part of a device's public shape, shown in the drawer.
- Why: finding a machine by its MAC is a reader's main task; nothing about a MAC is secret within the organisation.
- Who: agent (judgement call)

#### Where are place and unplace?

- Decision: `device.place`/`device.unplace` arrive with the inventory page (PR C); B1 only makes placement optional and keeps `device.patch` to position and size.
- Why: without a list of unplaced devices, nothing could use them.
- Who: agent (obvious)

#### How does the server learn a floor's site?

- Decision: point lookups floor → building → site for the floors an operation touches, instead of collecting every floor.
- Why: the planner needs the site for MAC uniqueness; collecting all floors grew with the deployment.
- Who: agent (obvious)

#### Length limits on identity text

- Decision: B2 (identity mutations) bounds name, hostname, serial, model, IP and notes; B1 keeps the existing unbounded name and hostname.
- Why: one place validates identity text, the mutations that edit it.
- Who: agent (obvious)

#### Is an identity edit undoable from the map history?

- Decision: no; `devices.updateIdentity` is an Éditeur mutation outside the map's undo stack, as ADR 0022 sets for site facts. Cancelling the dialog is the way back before saving.
- Why: identity belongs to the site inventory, shared by every floor and by integrations; the per-floor history cannot own it.
- Who: agent (follows ADR 0022)

#### Can the drawer change a device's type?

- Decision: not in B2; the dialog edits name, hostname, IP, model, serial, MACs and notes.
- Why: a type change resizes the node and changes which ports and links make sense; it belongs with ports and cables.
- Who: agent (judgement call)

#### When is a source-owned field refused?

- Decision: only when the edit changes it; sending its current value is accepted.
- Why: a form can submit the whole identity without knowing which fields the source owns, and a sync between opening and saving does not turn a hostname edit into an error.
- Who: agent (obvious)

#### What does `device.place` carry?

- Decision: the whole device, so the map shows it at once and undo can rebuild it; the server takes only floor, position and size, and keeps the inventory's identity.
- Why: the client already has the device; trusting its identity would let a stale tab overwrite an identity edit.
- Who: agent (obvious)

#### May a sourced device leave the map?

- Decision: yes; "Retirer du plan" works for every device, "Supprimer" only for devices no integration owns.
- Why: the next sync would bring a deleted sourced device back, but where it stands is Netplan's own fact.
- Who: agent (follows ADR 0022)

#### What do unplace and delete mean in the UI?

- Decision: "Retirer du plan" (U, drawer, context menu) keeps the device in the site inventory; "Supprimer" removes it for good. The context menu's "Supprimer de la carte" became "Supprimer".
- Why: with an inventory, "de la carte" now describes unplacing, not deleting.
- Who: agent (judgement call)

#### Who names a device created from the inventory?

- Decision: the client, with `createStandaloneObjectId("device")`, as buildings and floors already do; the server checks the shape and that the id is free.
- Why: Convex mutations have no cryptographic random source, and a client id makes a retry, or the "Annuler" of a deletion, bring back the same device.
- Who: agent (forced by Convex)

#### Which devices can be deleted from the inventory?

- Decision: only unplaced manual ones; a placed device is deleted from the map (its links and undo live there), a sourced one is not deleted in Netplan.
- Why: one place per kind of deletion keeps link cleanup and undo where they already are.
- Who: agent (judgement call)

#### How is an inventory deletion undone?

- Decision: a 10-second Sonner toast with "Annuler" recreates the device with the same id and fields; Sonner was added as the app's toast library.
- Why: the inventory has no undo stack, and a toast is the usual way back from a one-row deletion.
- Who: agent (judgement call)

#### How does an inventory device get onto the map?

- Decision: a picker on the map (toolbar "Placer", shortcut P) lists the site's unplaced devices; the chosen one goes on the current floor at its type's default size, centred on the view or at the nearest free spot, through the existing `device.place` operation.
- Why: placement needs a floor and a position, which only the map has; reusing `device.place` gives undo (`device.unplace`) and server validation for free. Drag-from-list was left for later.
- Who: agent (judgement call)

#### Where do ports and cables live, and what happens to them when a device moves?

- Decision: `ports` and `cables` are site-level Convex tables keyed by the device. Unplacing keeps them; a floor or building removal unplaces devices with their cabling; deleting a device (map, inventory, map clear, site removal) deletes its ports and cables, and the undo of a deletion carries them back on `device.create`.
- Why: a cable belongs to the inventory, not to the drawing; a device stored in a cupboard is still cabled to its panel.
- Who: agent (follows ADR 0022)

#### How does a floor's map see a cable whose other end is elsewhere?

- Decision: a floor document carries every cable touching one of its devices' ports, and the ports of both ends; the drawer lists only connected devices on the same floor, as links did. The port table of the next pull request shows each cable's far end wherever it is.
- Why: a cable may cross floors; the drawer can only jump to a device on the map being shown.
- Who: agent (judgement call)

#### What ports does a new manual device get?

- Decision: defaults by type (24 interfaces for a switch, 24 front ports with their rear ports for a panel, one front port for a socket, one interface for a PC or endpoint, none for a rack); an operation may carry its own list. Port ids are `port:<deviceId>:<kind>:<n>`, so they cannot collide across devices.
- Why: an Éditeur cables a new switch immediately; the source's real interface names replace the defaults when an integration owns the device.
- Who: agent (judgement call)

#### What if a deleted device's cable no longer fits when it is brought back?

- Decision: `device.create` (map undo, inventory "Annuler") still brings the device and its ports back and leaves out each cable whose far port has gone, is in another site, or holds another cable since. A malformed list (bad id, a cable that misses the device, a port id another device has) is still refused.
- Why: cables cross floors, so each floor's undo history can delete one end before the other is restored; refusing the whole device would lose it for good.
- Who: agent (found in self-review)

#### How does an Éditeur change cables, and how is a change undone?

- Decision: a "Câbles" dialog (drawer button, shortcut K, inventory menu) lists a device's ports, each cable's far end wherever it is, and where the trace ends. `cables.connect` and `cables.disconnect` are direct Éditeur mutations; unplugging shows a 10-second toast naming the device and port whose "Annuler" reconnects the same cable. Source cables are read-only.
- Why: a cable crosses floors, so it does not belong in one floor's undo history (ADR 0022); the toast matches the inventory deletion.
- Who: agent (follows ADR 0022)

#### Where does a trace stop?

- Decision: from a port, follow the cable; on a patch panel cross front to rear (or rear to front) and follow the next cable; stop at an uncabled port, an interface, a socket, or a port already visited.
- Why: that is the question a technician asks ("which switch port is this socket on?"); a loop through a miscabled panel must not hang.
- Who: agent (judgement call)

#### Why can a toast's "Annuler" be pressed with the cable dialog open?

- Decision: the dialog traps focus (`modal="trap-focus"`) without blocking presses outside it, and a press on the toaster does not close it.
- Why: Base UI's fully modal dialog blocks every outside press, the toast's button included.
- Who: agent (found in browser verification)

#### Where does a site's collection cycle live, and what stops two at once?

- Decision: a `siteCycles` row per site holds the next run, the consecutive failures, the cycle running (with a 15-minute lease and its id) and the last cycle's outcome per source. A cron every minute starts each due site; "Lancer une collecte" starts one at once unless one is running. A cycle whose lease ran out may be taken over; its late report is ignored. A failure retries 5, 10, 20… up to 120 minutes later, never sooner than the cadence. Changing the cadence to a shorter one brings the next cycle forward.
- Why: keeping it apart from `sites` means a cycle's bookkeeping does not wake every reader of the site's settings; the lease survives a crashed action without a manual unlock.
- Who: agent (follows ADR 0023)

#### How is collection stopped on a whole server?

- Decision: `NETPLAN_COLLECTION_PAUSED=true` on the deployment stops every cycle, automatic or manual; each site's admin page says so.
- Why: ADR 0010 keeps an environment kill switch as the fallback when a source suffers under Netplan's load, without editing every site.
- Who: agent (follows ADR 0010)

#### Where do a site's NetBox settings live, and what survives a change of NetBox?

- Decision: on the NetBox integration row, as the chosen NetBox site and the Netplan type of each mapped role, keyed by NetBox id; a role left out is ignored. Saving the connection with another address forgets them. Roles map to switch, patch panel, wall socket, workstation or terminal (the real NetBox models wall sockets as devices with a role). The lists are read page by page with offsets, never by following NetBox's `next`.
- Why: ids survive a rename in NetBox but mean nothing in another NetBox; `next` is built from request headers and could send the token to another host behind a proxy.
- Who: agent (follows ADR 0023)

#### How does a NetBox import merge into the inventory, and how often does it run?

- Decision: a collection cycle reads the mapped site's devices (filtered by the mapped roles; with none mapped it reads nothing from NetBox and still merges an empty import, which retires what NetBox brought) and their interfaces' MAC addresses, then one mutation merges them under ADR 0022: a bound device is updated; a new one binds to the one manual device sharing a MAC or serial without contradiction; a hostname-only match (NetBox name against a device's hostname or name, domain ignored) becomes an Éditeur suggestion; several matches, a contradiction or two NetBox devices claiming one manual device become an admin conflict; the rest are created unplaced. Suggestions and conflicts are recomputed by each import. A MAC address a device outside the import holds stays with it. An automatic cycle imports at most every 15 minutes; a manual one always does. A device is written only when NetBox changed what it owns, and `syncedAt` records that change.
- Why: one transactional mutation means a failure half-way changes nothing; skipping unchanged devices keeps an import from waking every page.
- Who: agent (follows ADR 0022 and ADR 0023)

#### When does a sighting move a device on the map?

- Decision: a pc or endpoint is placed next to the socket it is seen at when it is on no floor, or when none of the sockets its MACs are seen at now is one where its latest sighting, through any of its MACs, saw it (or that sighting was at no socket). Seen at several sockets, it goes to the first one read. The first sighting of a device a person already placed keeps it where it is. The spot is the free one nearest to the socket, clear of devices and walls, and on the socket's side of every wall; with none within 200 units the device stays where it was. The move goes through the map's operations (`device.place`, `device.patch`, or `device.unplace` then `device.place` across floors) with the client id `librenms`, so the server validates and records it like a person's; it is outside any person's undo history.
- Why: ADR 0022 keeps a person's position while the socket stays the same; a first sighting is not evidence that the person's placement is wrong. Without the wall rule the nearest free spot was often in the next room, since sockets sit against walls.
- Who: agent (follows ADR 0022; wall rule found in browser verification)

#### What does "Créer l'équipement" make from an unknown MAC, and who sees the list?

- Decision: the inventory lists, for Éditeurs and admins, the MACs LibreNMS sees on edge ports that no device of the site carries, newest first, ten at a time, with the socket (or "Sans prise"), the switch port and when it was seen. "Créer l'équipement" asks only for a name and creates an endpoint carrying that MAC, online as its sighting says, placed next to its socket with the same search the cycle uses; seen on an uncabled port, it is created on no floor. The list checks ownership live, so a MAC a device gained since the last cycle disappears at once.
- Why: ADR 0022 makes it an endpoint next to its socket. A Lecteur cannot act on the list, like the import reviews beside it. Asking for the name alone keeps the action one step; the rest is edited afterwards like any device.
- Who: agent (follows ADR 0008 and 0022)

#### How is the LibreNMS collection validated when the real LibreNMS cannot be reached?

- Decision: the worker is built and tested against payload fixtures and a fake LibreNMS. Real validation is a separate step: `scripts/check-librenms.ts` checks a real instance with the cycle's own requests, retries and readers. It reports whether the answers read, whether forwarding entries are on known ports and carry a readable `updated_at`, and, with `--discover`, whether one discovery moved the newest entry. It prints counts and digit-masked formats only. `docs/operations/integrations.md` adds the in-app checklist. Until someone runs both against the real LibreNMS, it stays open.
- Why: the real LibreNMS was unreachable from this host for the whole lot. The cycle's freshness rule depends on how that instance timestamps its forwarding table, and fixtures cannot confirm that. A script that shares the cycle's code checks the assumptions themselves, and its output can be pasted into an issue without leaking names or addresses.
- Who: Kinan (validate the worker against fixtures, real validation as a separate step); agent (the script and its checks)

#### What do imported devices bring besides their identity?

- Context: ADR 0022 imports ports and cables from NetBox; Netplan has one cable per port.
- Decision: the import also reads interfaces, front ports, rear ports and cables, in the same cycle and mutation as the devices. An imported device gets NetBox's ports in NetBox's order; a port already from that NetBox port keeps its id, and on a manual device NetBox now owns, a manual port with the same kind and name keeps its id and its cable. Other ports go with their cables. A front port points at its rear port. A NetBox cable between two imported ports replaces a manual cable on either end and goes when NetBox drops it. Breakouts and a second cable on one port are skipped. Leaving a NetBox turns its ports and cables manual with its devices.
- Why: keeping the id of a matching manual port keeps the cabling a person drew; skipping what the one-cable-per-port model cannot hold is safer than approximating it.
- Who: agent (follows ADR 0022)

#### How is an import suggestion or conflict settled?

- Decision: the inventory shows the pending reviews to Éditeurs and admins. An Éditeur settles a suggestion with "Rattacher" (bind to the manual device, which keeps its placement, notes and cables) or "Garder séparés" (create a new device bound to NetBox). Only an admin settles a conflict: bind one candidate or create a new device; an Éditeur sees "Un administrateur doit trancher." and the server refuses them. Settling binds at once, so the next import treats the device like any other and the planner stores no decision. Candidates bound or deleted since are no longer offered; settling twice is refused.
- Why: a binding is the decision, so nothing extra can drift or make a review come back. ADR 0008 gives conflicts to admins.
- Who: agent (follows ADR 0008 and 0022)

#### What happens when an admin unmaps every NetBox role?

- Context: zipzoup (P2, #49): with no role mapped the import returned early, leaving what NetBox had brought in place forever.
- Decision: with no role mapped the cycle reads nothing from NetBox, since an unfiltered request would list every device, and still merges an empty import: unplaced imported devices go, placed ones become manual, reviews and NetBox cables are cleared.
- Why: unmapping the last role must mean the same as unmapping one.
- Who: agent (obvious)

#### What id does an imported port get when its usual id is taken?

- Context: zipzoup (P2, #49): a port released as manual keeps its generated id, so a later import could generate the same id for another port and overwrite it.
- Decision: the plan matches every port first, then gives each unmatched port an id no existing or kept port holds, adding `:2`, `:3`… when the generated one is taken.
- Who: agent (obvious)

#### How does a site know which LibreNMS device each switch is?

- Decision: the LibreNMS integration row stores, per Netplan switch, the LibreNMS device it stands for, or none to skip it; several switches may share one device, as a stack's members do. The admin page lists the mapping and its form reads LibreNMS's device list; a switch never configured starts on the only device named like its hostname or name, domain and case ignored, IPv4 names kept whole. The server refuses an impossible id, a switch mapped twice, a device that is not a switch of the site, and a form read from an address that has since changed. Changing the address clears the mapping.
- Why: names differ between NetBox and LibreNMS too often to match silently every cycle; a suggestion the admin confirms once is predictable. Ids mean nothing in another LibreNMS.
- Who: agent (follows ADR 0023)

#### How does a cycle tell a MAC seen now from one LibreNMS merely remembers?

- Context: the 2026-07 audit found that LibreNMS keeps forwarding entries that discovery no longer refreshes.
- Decision: at most every five minutes per site the cycle asks each polled device to rediscover, once and never retried, since a retry could ask twice, then waits up to two minutes for `last_discovered` to change. An entry counts only if its `updated_at` is within two minutes of the newest in its switch's table. A discovery that finished without moving that newest entry refreshed nothing: entries up to it stay unseen, in that cycle and later ones (`staleUpTo`), until a discovery brings newer ones. A table without timestamps cannot be judged and counts whole. Sightings live in `macSightings`, apart from devices, with the switch, port, socket, misses and the device whose status the MAC last set (`ownerId`), so a cycle writes a device only when its status changes and a device that drops a MAC still has its status settled. A switch LibreNMS fails to read counts no miss.
- Why: without the freshness rule a PC switched off yesterday would stay online; an outage of LibreNMS must not take everybody offline.
- Who: agent (follows ADR 0022 and 0023)

#### How was the lot actually split?

- Decision: twenty-five pull requests before this closing one, each green on its own:
  - the design ADRs (#22) and the legacy pipeline's removal (#23);
  - sites (#28) and their encrypted integrations (#32);
  - patch panels and endpoints (#34, after a cleanup in #35);
  - the site inventory and identity (#36, #38), unplacing (#39), the inventory page (#41) and placing from it (#42);
  - ports and cables (#43, #45);
  - collection cycles (#46, with a CI fix in #44 and a test fix in #51);
  - the NetBox settings, import, cabling and reviews (#47 to #50);
  - the LibreNMS mapping, cycle, placement and unknown MACs (#52 to #55);
  - the real-validation script (#56), then this closing docs change.
- Why: each step landed something a person can use and verify, and reviews stayed small enough to settle in one or two rounds.
- Who: agent (judgement call)

### L4 — Experience

Questions of 2026-10-16, in the order they came up.

#### Who may press "Actualiser"?

- Context: L2 shipped `collection.refresh` as an Éditeur mutation but the button only in the admin; the brief asks the lot to decide from the product direction.
- Decision: Éditeur and Admin see and press "Actualiser" on the map and in the inventory; a Lecteur sees freshness only.
- Why: the lot 1 journal already split roles as reads → Lecteur, map edits and manual refresh → Éditeur; the server rule exists, only the button was missing.
- Who: agent (follows the lot 1 journal)

#### When is a site's data "late"?

- Context: the 2026-07 plan used fixed thresholds (10 min by day, 75 min otherwise); cadences are now per site (ADR 0010).
- Decision: data is as fresh as the start of the last cycle where every source answered; it is late once two scheduled cycles have passed since then (computed from the site's cadence), or after two failed cycles in a row.
- Why: a fixed threshold would be wrong for any site whose cadence differs from the default; "two missed cycles" is the same rule at every cadence and matches the old numbers at the default one.
- Who: agent (judgement call)

#### What does "Prochaine collecte" say once its date has passed?

- Context: the admin showed the stored `nextRunAt`, which stays in the past while automatic cycles are off, collection is paused or the site has no integration, and for up to a minute before the cron picks it up.
- Decision: "imminente" for two minutes after the due date, then "en attente"; when cycles are off, paused or without integration, that state replaces the date.
- Why: a past date reads as a bug; each state that causes it has a name the user can act on.
- Who: agent (obvious)

#### Does a manual refresh ask for confirmation when the last cycle is recent?

- Context: the 2026-07 plan asked for one under two minutes.
- Decision: no confirmation; the button is disabled while a cycle runs.
- Why: the server refuses overlapping cycles and throttles LibreNMS discoveries to one per five minutes (ADR 0023), so a second press cannot load the switches.
- Who: agent (judgement call)

#### Where do toasts go, and how is React Scan kept off them?

- Context: each page mounted its own `<Toaster/>` (the admin none), bottom-right, where React Scan's toolbar sits in development and the map's status card sits always.
- Decision: one toaster in the authenticated layout, bottom-centre; map-operation rejections become error toasts instead of a card.
- Why: React Scan's toolbar is draggable and snaps to a corner, so no corner is safe; bottom-centre is free on every page.
- Who: agent (judgement call)

#### In which language do map operations reject?

- Context: the server rejected map operations with English sentences that the client translated by substring, falling back to "Action refusee: <English>".
- Decision: the server's rejections are French sentences, like every `ConvexError`; the client shows them as they are.
- Why: one source of wording; the translation table silently missed most messages.
- Who: agent (obvious, ADR 0016)

#### How is an unknown MAC ignored durably?

- Context: L2 left unknown MACs without a way to dismiss a phone or a visitor's laptop.
- Decision: an `ignoredMacs` row per site and MAC, written and removed by inverse Éditeur mutations with an "Annuler" toast; an ignored list restores one; the server refuses a MAC a device carries and treats repeats as no-ops.
- Why: sightings are deleted after misses, so the fact must outlive them; inventory edits already undo through inverse mutations (L2).
- Who: agent (follows ADR 0022)

#### What replaces the development "Create default map" and "Clear map" buttons?

- Context: they showed, in English, to any Éditeur of a site without buildings; "Clear map" deleted every manual device of the site.
- Decision: delete both mutations; Éditeurs create a building with its first floor, add floors, and remove only empty ones.
- Why: the seed already fills local instances; a one-click wipe of a site is not an Éditeur action.
- Who: agent (judgement call)

#### Who ignored a MAC, and does the LibreNMS step still count it?

- Context: the ignored list shows who ignored each MAC; user names live in the better-auth component, and the LibreNMS step reports "N inconnues".
- Decision: store the user id and the name at the time (as presences do); the LibreNMS step no longer counts ignored MACs as unknown.
- Why: the list reads without joining the auth tables, and the step's count must match the list an Éditeur sees.
- Who: agent (judgement call)

#### Where do offline devices show, and how many?

- Context: the scope asks for an offline devices section; the map's sidebar is the one place every role sees, and a site can have dozens of offline PCs after a power cut.
- Decision: a "Hors ligne (n)" group in the map's sidebar, at most eight entries, each opening the device on its floor; the rest through a link to the inventory pre-filtered by `?status=down`, which also gains a status column and filter. Unplaced offline devices are listed, disabled, as "Hors plan". The group is hidden when nothing is offline.
- Why: the sidebar must stay a navigation aid, not a report; the inventory already handles long lists, and a URL filter makes the link shareable.
- Who: agent (judgement call)

#### When is a floor empty enough to remove?

- Context: removing a floor or a building must never take a drawing with it, but presences and revisions only describe the floor.
- Decision: a floor is empty when no device, wall or calque stands on it; removal deletes its presences and revision with it (operation receipts stay, keyed by operation, so a retry still finds its answer); a building is removed only when all its floors are empty. The refusal names what remains, floor by floor.
- Why: the removal stays outside undo, so it must lose nothing a user drew; the cleanup leaves no orphan.
- Who: agent (judgement call)

#### What makes a building or floor name valid?

- Context: names were free text; two "Rez-de-chaussée" in one building cannot be told apart in the sidebar.
- Decision: trimmed, inner spaces collapsed, 1 to 60 characters, and unique among siblings ignoring case and accents (French collator); the server checks it, the dialog repeats the check and shows the server's refusal inline.
- Why: the sidebar and the offline list identify a floor by name only.
- Who: agent (judgement call)

#### Where do building and floor actions live, and are they undoable?

- Context: the map's undo history covers `MapOperation`s on one floor's document; a building has no document.
- Decision: the actions sit in the sidebar behind edit mode (a "+" on the Bâtiments header, a menu per building and floor), plus the empty-state button; edit mode can be entered without a floor. They are plain Éditeur mutations outside undo; removal asks for confirmation instead.
- Why: edit mode already marks "I am changing the plan" and hides controls from Lecteurs; a cross-floor undo entry would need a site-level history that does not exist.
- Who: agent (judgement call)

#### How does the inventory show what is left to draw?

- Context: ADR 0026 asks for per-type placed/total counts that filter to the unplaced devices, and an inventory empty state that offers creation.
- Decision: one card per device type the site has, in registry order, with placed/total, a bar and "N hors plan". A click shows that type's unplaced devices, clearing search and status so nothing hides them; a second click resets. Fully placed types are disabled. A type select joins the filters so the card's filter has a visible way out. An empty inventory replaces the table with a message; Éditeurs get its "Nouvel équipement" button (the header one is hidden then), Lecteurs learn who can create.
- Why: the count is only useful if the click lands on exactly what is left to place; a hidden type filter with no control would be a way in without a way out.
- Who: agent (judgement call)

#### How does the admin health page show each polled switch's result?

- Context: ADR 0026 asks for each polled switch's result in the last LibreNMS read, kept as structured data next to the step's message; until now the per-switch outcome lived only inside the message text.
- Decision: a LibreNMS cycle step gains an optional `switches` list (name, ok, notes), while its message keeps naming the failing switches for the site page's "Collecte" section. The health page lists the polled switches failures first, open when one failed and folded otherwise. "Santé" is the first admin section, so `/admin` lands on it. Switch counts by status hide zeros so a red dot only appears for a real offline switch.
- Why: the site page reads only the message and must stay readable alone; a structured list lets the admin page sort and fold without parsing French text.
- Who: agent (judgement call)

#### How was the lot split?

- Context: ADR 0019 asks for one concern per pull request, each green on its own.
- Decision: eight pull requests: one toaster and French map-operation refusals (#59); freshness and "Actualiser" for everyone who may (#61); ignored MACs (#63); the offline group and status filter (#64); building and floor management with the empty states (#66); the coverage view (#68); the admin health page (#70); then this closing docs change.
- Why: each landed something a user can see and verify alone, so each review stayed within one or two rounds.
- Who: agent (judgement call)

### L3b — Map polish

Questions of 2026-10-16, in the order they came up; the last sections record the judgement calls of each pull request.

#### Is "stale" a new status value?

- Context: L2 leftover: a device no longer seen keeps its last status forever, because a switch that fails to read counts no miss and a stopped cycle changes nothing. L4's health view needs to know where statuses live.
- Decision: no new value. `metadata.status` stays online, offline or absent ("Inconnu"). Each switch's last successful read is recorded; when it is older than twice the site's longest interval plus the lease, the minute cron removes the statuses that rest on it: the switch's, its ports' and those of devices last seen on it.
- Why: one field for the map, the inventory and the health view; the rule holds when LibreNMS or the cycles stop, since the minute cron always runs.
- Who: agent (judgement call)

#### Does an offline device become unknown after a while?

- Context: a device the switch was read without seeing is offline for as long as it stays unseen.
- Decision: no. Offline is a fact while the switch is read; only a stale read makes statuses unknown.
- Why: an offline PC for a week is useful information (lot 4's offline section), not uncertainty.
- Who: agent (obvious)

#### Where does a switch's status come from?

- Context: ADR 0009 / Q27: a switch's state from LibreNMS when available, unknown otherwise.
- Decision: the cycle reads each polled LibreNMS device and writes up/down to `metadata.status` of the Netplan switches it stands for. Unpolled switches have none.
- Why: same field as pcs; L4 reads it for the health view.
- Who: agent (obvious)

#### What colours a port?

- Context: Q27: colour a port where a device has been seen; LibreNMS also knows each port's link state.
- Decision: two facts written on change: the link (LibreNMS operational status) and whether a site MAC is seen on the port. Colour: "Appareil vu" > "Lien actif" > "Lien inactif" > "Inconnu". Both expire with the switch's read.
- Why: a network team spots both where a PC is and which ports are dead; writing only on change keeps cycles from rewriting every port.
- Who: agent (judgement call)

#### Which ports does a switch show, given real NetBox data?

- Context: the real NetBox models switch ports as rear ports (sw-access-01/02: 96 rear ports, no interfaces cabled); every cable is rear ↔ rear, every rear port has one position, no breakouts.
- Decision: a switch shows all its ports in order, whatever their kind; a patch panel shows its front ports.
- Why: a filter on `interface` would show real switches with no ports.
- Who: agent (obvious)

#### Default switch port names (1..24) never match LibreNMS

- Context: L2 leftover. Matching ignores case and abbreviated leading words; "1" never matches "Gi1/0/1".
- Decision: when LibreNMS polls a manual switch whose ports still all carry the default names in order, the cycle adopts LibreNMS's physical Ethernet ports by interface index: renames by position, adds the extra ones, removes uncabled default ports beyond. Never renames ports a person or a source named.
- Why: positional numbering is what a person meant by "port 3"; vendor-specific number matching would be ambiguous (Gi1/0/1 vs Te1/1/1).
- Who: agent (judgement call)

#### Are moves made by the cycle undoable?

- Context: L2 leftover: the cycle places a device next to its socket through `applyMapOperation` with its own client id.
- Decision: they stay outside every undo history. A person's undo or redo that would move a device someone else (the cycle included) has moved since is refused with a message.
- Why: an observation is not a person's edit; undoing a person's earlier move must not silently put a PC back where the network says it no longer is.
- Who: agent (judgement call)

#### Breakout and rear-to-rear cables

- Context: L2 leftover. The server trace picks the first front of a rear port (`.first()`), so a multi-position rear would guess.
- Decision: a trace stops at a rear port several fronts share, on both client and server; rear ↔ rear cables need nothing special. Rendering never assumes a port kind.
- Why: the real site has none today; stopping is honest and cannot draw a wrong path.
- Who: agent (obvious)

#### How does hovering a PC show a path when PCs are not cabled?

- Context: a PC is located by sightings, not cables.
- Decision: the device carries the socket it was last seen at; its path starts with a dashed segment to that socket, then the socket's cables. A hop off the floor ends on a label with the far device and floor.
- Why: the path the user wants is "where is this PC plugged"; the dashed segment shows it is observed, not cabled.
- Who: agent (judgement call)

#### Is drawing a cable on the map a map operation?

- Context: L2 made cables site facts (Éditeur mutations with an "Annuler" toast, outside the floor's undo).
- Decision: drawing on the map uses the same `cables.connect` / `cables.disconnect` and toast.
- Why: one model for both screens (Q32bis: both edit the same data); a cable can cross floors, a map operation cannot.
- Who: agent (obvious)

#### What status does a device brought back by an undo carry?

- Context: zipzoup on #60. The cron expires a read once and never revisits it, so a status restored afterwards (map undo of a deletion, drawer "Annuler", an endpoint made from an unknown MAC) would stay forever.
- Decision: a device or port entering the inventory never keeps a status it brings along: it gets only what a fresh read gives it now (a pc/endpoint from its sightings on fresh switches, a switch and its ports only while its read is fresh). Expiry also finds a MAC's current owner, not only the one a cycle recorded. The demo seed, standing in for cycles that never ran, writes its statuses and port facts itself.
- Why: a first version kept statuses nothing observed, and zipzoup found the holes (sightings deleted since, LibreNMS released since). "Only a read sets a status" (ADR 0025) at the insert closes them all without a cron rescanning every device.
- Who: agent (judgement call)

#### What does "a device is seen on this port" count?

- Context: zipzoup on #62. Presence came from the placement sightings, which keep one port per MAC and only edge ports.
- Decision: computed apart, from every fresh FDB entry on a matched port: an edge port counts any site device, a port cabled to a device counts only that device, busy uncabled ports count nothing.
- Why: an uplink carries every downstream MAC, so "any site MAC" would light every uplink; the cabled device is the one actually behind the port.
- Who: agent (judgement call)

#### Which LibreNMS ports does a manual switch take the names of, and when?

- Context: ADR 0025 says physical Ethernet ports by interface index, while the ports still carry "1".."n" in order.
- Decision: "physical Ethernet" is `ifType` ethernetCsmacd, fastEther, fastEtherFX or gigabitEthernet, with an `ifIndex`; the first name (`ifName`, else `ifDescr`). No adoption when the LibreNMS device stands for several Netplan switches, when any port has a source, or when LibreNMS's names would be empty, too long, repeated (case aside) or more than 256. Cabled default ports beyond LibreNMS's stay under their number.
- Why: one LibreNMS device for two switches does not say which port is whose; refusing an awkward list keeps the defaults rather than writing a half-valid one. A management Ethernet port or a deleted LibreNMS port would shift positions: to check on the real LibreNMS (`check-librenms` now counts the Ethernet ports).
- Who: agent (judgement call)

#### Show cables on demand (#69)

- "Until another device's display": a second explicit "Afficher" on another switch or panel replaces the first. Hovered or selected PC/socket paths draw on top without hiding it.
- H toggles the selected device, else the hovered one; on a non-switch/panel (or none) it hides. The old connection highlight is removed and H is retargeted to this.
- Escape order: overlay calibration > overlay panel > hide cables > leave edit mode.
- Port labels on one device fold into one label: up to 3 names, else "n ports" (a patch panel stacked 10 labels under its switch otherwise).
- zipzoup #67 P2: a trace ending on a port it cannot pass (a switch NetBox models with rear ports) now names that port, like `traceFrom`.

#### Draw cables on the map (#71)

- Grips: a switch's or patch panel's port squares, and a wall socket's icon, in edit mode only, and only with the device tool (not while drawing walls, calibrating the overlay or multi-selecting). PCs and endpoints are neither grips nor targets: sightings locate them.
- A drop: on a free port, that port; on a device with one free port, that one; with several, a picker (rear ports of a panel included); on the starting device or nothing, nothing.
- Starting from a cabled port is refused with a toast pointing to the port table, until deleting from the map lands.
- Escape abandons the cable inside the existing close-drawer and escape handlers: the shortcut registry forbids a second Escape action in a scope.
- After drawing, the cables of the switch or panel end are shown, so the new cable is visible at once.
- The port table's "cabler" now gets the same "Câblé : A ↔ B" toast with Annuler (it had none): one `useCableCommands` for both screens.
- ADR 0025's "for patch-panel paths, the port table": read as a whole path through a panel. The map draws one cable at a time, to a panel too.

#### Unplug cables from the map

- "A drawn cable can be deleted from the map" (ADR 0025): pressing a cabled port grip in edit mode opens a menu under the port, naming both ends, with "Débrancher". It unplugs through the port table's mutation, with the same Annuler toast. No click target on the path lines: they run from device centre to device centre, so a clickable line would steal presses on the devices themselves.
- A cable an integration made is refused with a toast (the server refuses to unplug it too); so is a cable to another floor, which ADR 0025 leaves to the port table.
- What a press does (draw, unplug, refuse) is settled at the press, so another person's edit mid-gesture does not turn a drawing into a menu; a cable unplugged elsewhere meanwhile makes "Débrancher" a no-op, as in the port table.
- The menu opens on release, not on press, so the release is not read as a press outside it.

#### Undo after the cycle moves a device (#74)

- ADR 0025's "an undo or a redo that would move a device someone else has moved since, the cycle included, is refused": a precondition `expected` (position, size) on `device.patch` and `device.unplace`, set only by inverses, checked by the engine (local refusal) and the server (a cycle move between the check and the mutation).
- Applies to undo and redo alike; a redo refusal now says "Impossible de rétablir" (it said "d'annuler").
- `device.unplace` too: undoing a placement would take away a device the cycle has since moved next to its socket. `device.place` was already refused once the device is on a floor again.
- Not extended to deletions, walls or the overlay: the ADR is about moves; the existing conflict checks cover the rest.
- The message names "la collecte", the UI's word for the cycle.
- To check on a real LibreNMS: a PC the cycle moves after an Éditeur dragged it; undo is refused. Here, a second tab's move stood in for the cycle (both go through `applyMapOperation`).

### L5 — History & ops

Questions of 2026-10-16, in the order they came up, ending with the deployment smoke test and the cleanup.

#### Why did signing out ask to leave the page?

- Context: L4 leftover. `ConvexReactClient` installs a `beforeunload` warning that fires while any request is in flight, and the presence heartbeat sends a mutation every 2 s.
- Decision: create the client with `unsavedChangesWarning: false`; the map provider warns only while its outbox holds unsaved edits. Reproduced by stalling the WebSocket's `send` in the preview: the dialog appeared on sign-out before, not after; an unsaved deletion still warns.
- Why: the only unsaved work a user can lose on unload is the map's queued edits; other pages await their single mutation in a toast.
- Who: agent (obvious)

#### Does history need a map operation and an inverse?

- Context: AGENTS.md requires every durable change to ship with an operation, engine behaviour and an inverse.
- Decision: no. History is written only by the collection cycle from what the network observed; no person writes it, and undoing a move does not erase it.
- Why: the rule covers durable changes people make to the map; history is an observation log, like `macSightings`.
- Who: agent (obvious)

#### When is a device "located" in history?

- Context: the cycle already moves a device on a socket change (`socketMoves`), but a device can be seen on an edge port with no socket.
- Decision: a `located` event at the first sighting, and whenever none of the ports seen now is one of its latest sighting's ports; same rule as `socketMoves`, on ports.
- Why: one rule for "it moved" across placement and history; ports exist even where sockets are not modelled.
- Who: agent (judgement call)

#### Should history copy names or reference ids?

- Context: sockets and switches get renamed or deleted; history must still say where a device was.
- Decision: each event and snapshot entry copies the names it shows (device, switch, port, socket, floor, building) along with the ids.
- Why: a 30-day log must survive edits and deletions without joins to rows that may no longer exist.
- Who: agent (obvious)

#### How is a missing snapshot slot recorded?

- Context: the frozen plan wrote an explicit `missing` slot when no cycle fell in [slot−5 min, slot+10 min].
- Decision: only taken slots have a row; the UI shows "pas de relevé" for a slot whose window has closed without one. Hourly cadence (weekends, nights) usually misses slots; accepted.
- Why: same information without a cron writing empty rows; never backfilled with older data.
- Who: agent (judgement call)

#### Does the snapshot design respect the ~8,000 MACs per mutation limit noted by L2?

- Context: Convex allows 16,000 writes per transaction (`TRANSACTION_MAX_NUM_USER_WRITES`); `recordSightings` already writes up to one row per MAC.
- Decision: the cycle's mutation only claims the slot; a scheduled mutation pages `macSightings` 500 at a time to write entries. The purge also deletes 500 per mutation and reschedules itself.
- Why: snapshot capture adds no writes to the cycle's mutation, whatever the site's size.
- Who: agent (obvious)

#### How often does the NetBox push write last-seen?

- Context: each PATCH adds a NetBox changelog entry; a 5-minute cycle over ~200 workstations would add ~57,000 a day.
- Decision: push a location change at once; push last-seen alone when the device is offline (exact time) or when the value sent is over six hours old.
- Why: NetBox shows where and when last seen with useful accuracy, without flooding its changelog.
- Who: agent (judgement call)

#### Who creates the NetBox custom fields?

- Context: owner approved creating them on the real NetBox; the app's token normally only reads.
- Decision: an operator script (`scripts/netbox-custom-fields.ts`, idempotent) or the documented manual steps; the app never creates schema in NetBox.
- Why: creating custom fields needs admin rights the collection token should not have; the push only needs `change_device`.
- Who: agent (judgement call)

#### What does a snapshot copy, given that sightings keep changing?

- Context: zipzoup on #76: paging `macSightings` after the cycle reads mutable rows; a later cycle or LibreNMS removal could mix into or empty a snapshot being written.
- Decision: the cycle's action writes the entries from the sightings it read itself, 500 per mutation; the slot is complete once its last page sets `entries`; an incomplete slot shows nothing.
- Why: the cycle's own observations are immutable, so no lease checks or coordination are needed; a crash leaves an honest gap.
- Who: agent (judgement call)

#### What happens to history when a site is deleted?

- Context: events and snapshots are keyed by site id; site deletion removes current state.
- Decision: history rows of a deleted site are left to the 30-day purge; no query can reach them since the site is gone.
- Why: avoids an unbounded delete in the site deletion mutation; data ages out on schedule.
- Who: agent (judgement call)

#### Where does the real NetBox push test write?

- Context: the brief allows writing values only on devices I create; the demo site imports from a NetBox site.
- Decision: created test site `netplan-test-L5-2`, device `netplan-test-L5-1` (id 1182) with an interface and a MAC, all tagged `netplan-test`; a fake LibreNMS (LibreNMS is unreachable from this host) served the switch; the custom fields were created with `ui_editable: no`, group "Netplan".
- Why: the push can only reach devices of the imported NetBox site, so no real device can be written; fields uneditable in the UI avoid a person's edit being overwritten silently.
- Who: agent (judgement call)

#### Does the push work against the real NetBox?

- Context: L5 relocation test on 2026-10-16, NetBox 4.6.10.
- Decision: recorded as verified: cycle 10:35:44Z wrote Prise B-03 / Accès RDC · Gi1/0/3; after moving the MAC to Gi1/0/5 the 10:40:43Z cycle wrote Prise B-05 / Gi1/0/5; device history showed both located events and "En ligne"; Santé showed "1 équipement mis à jour".
- Why: end-to-end proof through the real API, permissions and custom-field validation.
- Who: agent (obvious)

#### Is a return to the port named by the last located event a move?

- Context: zipzoup on #78: with two MACs, a device seen A, A+B, B, A never recorded its return to A, because recordLocated skipped a place equal to the last located event.
- Decision: the skip applies only to a device's first sighting after its arrival and to arrivals (including undo restoring a deleted device); a move found against the latest sighting is always recorded.
- Why: the skip exists to avoid duplicating the arrival's event, not to filter real moves; zipzoup's follow-up showed undo needed the same skip.
- Who: agent (judgement call)

#### Does a device's snapshot list show an interrupted capture?

- Context: zipzoup on #79: entries are written 500 at a time; a failed capture leaves partial entries.
- Decision: `snapshotsForDevice` drops entries of a slot whose `entries` count is unset, as the site view already did.
- Why: a partial snapshot would say a device was absent when it was simply not written.
- Who: agent (obvious)

#### When is the location of a device made from a MAC recorded, if its read has expired?

- Context: zipzoup on #78 (still open after 366708e): recordArrival skipped the location when no fresh read gave a status, and the next cycle on the same port saw no move, so the device had no location until it moved.
- Decision: recordArrival records the freshest sighting's place at its `seenAt`, whatever the status; presence still needs a fresh read (#82).
- Why: the sighting is a true observation even when too old to vouch for a status; its own time keeps the event honest.
- Who: agent (judgement call)

#### How does the history dialog keep a long list usable?

- Context: zipzoup on #80: the ScrollArea root had a max height but its viewport did not, so a long history pushed the dialog off screen; an empty snapshot page showed the empty state while older pages remained; an interrupted capture read "En cours" forever.
- Decision: the viewport carries the 60vh cap; the device snapshot list shows its empty state only once pagination is exhausted; a slot without entries older than ten minutes (the cycle action's limit) reads "Pas de relevé".
- Why: nothing can still be writing a capture after its action stopped; a page of failed captures says nothing about older ones.
- Who: agent (obvious)

#### What stops a push that the admin turned off, or whose NetBox changed, mid-run?

- Context: zipzoup on #81 (four P2s): a PATCH retried for up to 2.5 minutes kept the token and address of the run's start; an answer arriving after the address changed was still recorded; `sent` values cached for one NetBox device survived a refusal from another; Santé capped failing rows before skipping retired devices.
- Decision: `fetchWithRetry` takes a `beforeRetry` hook, and the push asks `stillPushing` (lease held, push on) after each pause. `record` checks the same before writing anything. `deletePushes` (address change or removal) also drops the run's lease, and import removal or unbinding deletes the device's push row. A refusal for a new `netboxId` forgets `sent`. `failingPushes` walks the index and applies the limit after filtering.
- Why: the push must write only while someone wants it, and only into the NetBox the site points at now; an answer from a NetBox the site left must not make the push skip the new one.
- Who: agent (obvious)

#### Where does an operator learn what a Santé line means?

- Context: the brief asks for troubleshooting built from the Santé page; the messages are spread across the cycle, probe, import, LibreNMS and push code.
- Decision: `docs/operations/troubleshooting.md` follows the page from top to bottom, gives each message's cause and what to do, and links to Integrations for the push refusals instead of repeating them.
- Why: an operator reads the page, not the code. Ordering the guide like the page makes a message easy to find.
- Who: agent (obvious)

#### Is the push switch checked before a device's first PATCH, or only before its retries?

- Context: zipzoup on #81 after 546a375: a push turned off while `due` was planning still sent each device's first PATCH, and only `record` caught it afterwards.
- Decision: the retry hook became `stillWanted` and is asked before every attempt, the first included (d8938b3). The cost is one query per PATCH, at most 100 per run.
- Why: "off" must mean that nothing more is written to NetBox, not just that nothing more is recorded.
- Who: agent (obvious)

#### How was the compose stack redeployed from main?

- Context: the brief asks to rebuild the local compose stack from current main with the `ghcr.io/convex` images; the old `netplan-l0` stack ran L0's code on old data.
- Decision: rebuilt from 46d8bb7 in a separate checkout under the same compose project (`-p netplan-l0`), after a backup. The in-place upgrade was refused: L0-era devices lack the `macs` field, so `convex-deploy` failed, and the old app container had already been replaced, leaving the installation down. Recovered with `down -v` and a fresh install; upgrade.md now says a refused schema leaves the app down and how to roll back. The old data stays in `~/l5-backups/netplan-2026-10-16-1306.zip`.
- Why: the rebuild restarts data from zero (ADR 0001), so no migration was owed; the downtime was the finding worth documenting.
- Who: agent (judgement call)

#### Does the relocation work on the deployed stack?

- Context: the brief's smoke test: a `netplan-test-L5` device moves socket, and its history and NetBox fields follow.
- Decision: recorded as verified on the compose stack (main 46d8bb7, convex-backend 72ce13c), with the fake LibreNMS standing in: the 13:28 automatic cycle wrote Prise B-03 / Accès RDC · Gi1/0/3 to NetBox device 1182; after the MAC moved to Gi1/0/5, the 13:33 cycle wrote Prise B-05 / Gi1/0/5. Historique showed both located events and "En ligne"; Santé showed "Envoi vers NetBox · 1 équipement mis à jour".
- Why: same proof as on dev:agent, through the production images, Caddy and Postgres.
- Who: agent (obvious)

#### Does the stack work over HTTPS?

- Context: the brief asks to try the HTTPS/Caddy path. No public DNS reaches this host, so Let's Encrypt cannot be tried.
- Decision: tried with `NETPLAN_SCHEME=https`, port 8443 and `tls internal` in each Caddyfile site. Without more, `/health` reports `unable to get local issuer certificate` (the app calls Convex through the public URL), and once the app trusts the CA (`NODE_EXTRA_CA_CERTS`), signing in works but the backend cannot fetch its own JWKS (`rustls UnknownIssuer`) and refuses every token. With `SSL_CERT_FILE` on the backend (system bundle plus Caddy's root), sign-in, the `wss://` sync, Historique and Santé all worked, in a headless Chromium that accepted the CA. install.md now says so; `deploy/compose.override.yaml` is ignored by git for that purpose. The stack was put back on HTTP afterwards.
- Why: an internal CA is the likely case on a company network, and the JWKS failure looks like an empty app rather than a TLS error.
- Who: agent (judgement call)

#### What was created in NetBox, and what is left?

- Context: the brief's final sweep: every object tagged `netplan-test` or named `netplan-test-*`, from all lots.
- Decision: a sweep over 33 object types (checking each result's name and tags locally, since NetBox ignores some filters) found only L5's objects. Deleted, after checking each still carried the tag: MAC address 374 `02:4C:35:00:00:01`, interface 452 `eth0`, device 1182 `netplan-test-L5-1`, site 39 `netplan-test-L5-2`, then tag 404 `netplan-test` once it had no item. A second sweep found nothing and no device with a `netplan_*` value. No earlier lot left an object behind.
- Why: test objects must not outlive the lot; verifying before each DELETE guards against a reused id.
- Who: agent (obvious)

#### Are the custom fields kept after the tests?

- Context: the owner approved creating `netplan_site`, `netplan_floor`, `netplan_socket`, `netplan_switch_port` and `netplan_last_seen` (ids 112–116) on `dcim.device`; their test values lived only on device 1182.
- Decision: the fields stay; their values went with device 1182, and no other device holds any.
- Why: they are the production contract of ADR 0027; recreating them is a step an admin would otherwise repeat when turning the push on.
- Who: owner (brief)

#### What happens to the L2 leftovers?

- Context: L2 noted TypeScript errors in generated code, and 161 NetBox devices whose model shows "undefined".
- Decision: logged, not changed. `tsc --skipLibCheck false` reports no error in `convex/_generated` today; the only declaration errors are in `node_modules` (React Compiler's types against zod 4, unstorage drivers' optional peers) and in `src/types/bun-test.d.ts`, which duplicates `bun:test`'s globals. `skipLibCheck` hides them, `bun run check` is green, and none affects the build. The "undefined" models are NetBox data: role 2 and device types 1 and 4 are literally named "undefined"/"undefined2" there, so the drawer shows "Matériel undefined"; renaming them is for whoever owns that NetBox.
- Why: Netplan shows what NetBox says; masking a name would hide a real data problem.
- Who: agent (judgement call)

### L6 — Real LibreNMS validation

Questions of 2026-10-19, in the order they came up, ending with the deployed stack and the cleanup.

#### How does Netplan reach a LibreNMS whose certificate names its old host?

- Context: the LibreNMS moved to `librenms01-tnzpv.mountainmen.fr` and kept a certificate for the old name, so strict TLS fails with `ERR_TLS_CERT_ALTNAME_INVALID`. Convex's default runtime gives no way to relax TLS for one request.
- Decision: a per-connection option, "Ignorer les erreurs de certificat TLS", off by default, for NetBox and LibreNMS alike (ADR 0028, #85). Every source request now runs in a Node action (`convex/sources.ts`) whose undici `fetch` uses an `Agent` with `rejectUnauthorized: false` only when the option is on. The admin form and Santé warn while it is ticked; `check-librenms --insecure` does the same for the script (#84). A refused certificate is reported as such ("Le certificat TLS de … est refusé (CODE)") and is not retried.
- Why: the token goes to whoever answers at that address, so the trade-off is the admin's, per connection, visible until undone; an internal CA needs no option, only the backend's trust store (`NODE_EXTRA_CA_CERTS` next to `SSL_CERT_FILE`).
- Who: owner (brief), design by agent

#### Why does a switch's first read need a reading before its discovery?

- Context: sw-core-01's discoveries no longer rewrite its forwarding table (newest entry 13 October, discoveries daily; `check-librenms --discover` said "refreshed no entry"). A table is judged stale when a discovery leaves its newest entry unchanged, which needs an earlier read; on a first read there was none, so 203 week-old MACs counted as seen.
- Decision: on a switch's first read the cycle reads its table once before asking for the discovery, and judges the first read by the existing rule (#86). A first version compared the table with `last_discovered` instead; dropped in self-review, since the two dates are written separately and may differ by clock or time zone, which would blind every switch on such a LibreNMS. The script's "would count as seen" line now says it holds only if the discovery moved the newest entry.
- Why: compare like with like; one extra request per switch, once.
- Who: agent (judgement call)

#### What did the real checks show?

- Context: the brief's list, run on dev:agent against LibreNMS 26.9.1 (8 devices) and NetBox 4.6.10, on Arles (447 devices imported, 7 switches on 5 LibreNMS devices), a "L6 test push" site and an "Annecy" site.
- Decision, check by check:
  - `check-librenms`, with `--discover` on sw-core-01: the discovery finished in time and refreshed no entry; 62 ports, 213 FDB entries.
  - Port names and order: NetBox's `GigabitEthernetN/0/x` match LibreNMS's `GiN/0/x`; adopted names follow LibreNMS's order on Cisco 3750-X stacks (109 ports, `Gi1/0/1`…), Nexus 3064 (`Ethernet1/x`), Dell DNOS S3124 (`GigabitEthernet 1/1`…), and FortiGate 40F (`wan`, `a`, `modem`, `lan1`…).
  - Statuses: 17 PCs placed by real cycles next to 7 sockets; laptop-cecile offline after two cycles without a sighting, then online again; three Annecy workstations online from the Dell switch.
  - Unknown MACs: listed in the inventory; one ignored, one turned into an endpoint placed at its socket.
  - Santé: the per-switch list with the "n'a rafraîchi aucune entrée" note, the TLS warning, the push block.
  - Undo of a collection move refused (ORDI-154).
  - Snapshots: the 19:00 slot taken by the first cycle of its window, 36 addresses, shown in Historique. The test site was put in Europe/London so a window fell within the session; Arles was connected after its 16:00 window and paused through 19:00.
  - A move reaching history and NetBox: test PC located at its socket ("located" and "online" events), then its five `netplan_*` fields written to the test device.
  - "Inconnu": with Arles's collection paused after a last read at 16:27:57 UTC, its 7 switches and the 96 statuses of devices seen on them were cleared by 18:43:57, 2 h 15 later; Santé read "7 inconnus".
- Why: each claim of the brief checked where it applies, with the result kept as evidence in the pull requests.
- Who: agent (obvious)

#### Which LibreNMS devices can a Netplan switch stand for?

- Context: the brief asks to map the 8 LibreNMS devices. Arles's NetBox has switches for 4 of them; the FortiGate, the Annecy core switch and the Annecy CPE have no NetBox switch, and nas01 is a NetApp.
- Decision: the 4 Arles switches mapped to their NetBox-imported switches (stacks share one device); the FortiGate, the Annecy Dell switch and the Annecy CPE mapped to manual test switches, which adopted their port names; nas01 left unmapped.
- Why: a Netplan switch stands for a device that forwards frames; a NAS has no forwarding table worth reading.
- Who: agent (judgement call)

#### Why did the deployed stack reach nothing?

- Context: after redeploying `~/l5-smoke` from main, every source answered "injoignable". The backend container, created three days earlier, still had the host's DNS from then (a Tailscale search domain) and resolved no name; containers created since resolved fine. The same session's image build hung in `bun install` under BuildKit's network and passed with `--network=host`.
- Decision: recreated the backend (`docker compose up -d --force-recreate convex-backend`), built the two images with `docker build --network=host` under compose's tags, and documented the stale DNS in troubleshooting. The host's network is not changed.
- Why: the stack's backend had never needed the outside before L6; a long-lived container keeps the DNS of its creation, which an operator will meet after a network change.
- Who: agent (obvious)

#### What runs where at the end?

- Context: two installations could poll the same LibreNMS devices and double their discoveries.
- Decision: the deployed stack (`netplan-l0`, main) keeps Arles collecting with both integrations, LibreNMS's certificate option on and NetBox push off. dev:agent's sites that poll switches (Arles, L6 test push, Annecy) have automatic collection off.
- Why: one poller per device, at the product cadence; the push writes only to devices a site imported, and real devices must not receive test values.
- Who: agent (obvious)

#### What was created in NetBox, and what is left?

- Context: the push test needed a NetBox device the test site imports.
- Decision: created, tagged `netplan-test`: tag 405, site 40 `netplan-test-L6-1`, device 1183 `netplan-test-L6-2`, interface 453 `eth0`, MAC 375 (moved once to a MAC active on the test socket's port when the first went quiet). Deleted in reverse order after checking each still carried the tag, then the tag once it had no item. A sweep over 13 object types found nothing, and no device carries a `netplan_*` value.
- Why: test objects must not outlive the lot.
- Who: agent (obvious)

### U1 — Shell, login, errors, offline

Questions of 2026-10-21, in the order they came up (ADR 0031, #93, #99, #105, #106).

#### How long may a user keep editing after the connection drops (C1, option c)?

- Context: the owner chose « édition permise pendant N secondes, puis gel », with the banner in every case, and left N to the lot.
- Decision: N = 30 s (ADR 0031, #105). Under 2 s nothing shows (a socket reconnect); from 2 s the banner says the edits will be sent; at 30 s the map freezes: `useIsEditMode()` and the shortcut runtime read false through a small `useConnectionStore`, « Modifier » is disabled with a hint, and the user's own edit-mode choice is kept so editing resumes on reconnection. The first connection that does not come within 5 s reads « Serveur injoignable · Nouvelle tentative en cours… ».
- Why: 30 s covers a Wi-Fi handover or a VPN reconnecting (the audit's recommendation); longer lets queued edits drift unseen from what others see; freezing through the same selector as a Lecteur hits every edit control at once.
- Who: agent (judgement call within the owner's option)

#### What does the banner count as « modifications en attente »?

- Context: Convex's `inflightMutations` also counts presence heartbeats, so the first version showed « 9 modifications en attente » with no edit.
- Decision: only the map session's queued operations (`pendingCount`, every floor).
- Why: the user's own changes; inventory edits are single mutations that Convex replays on reconnection anyway.
- Who: agent (obvious)

#### How should sign-in attempts be limited when no client address reaches Convex (A2)?

- Context: better-auth keys its limit on the client IP. The browser reaches the app, which proxies `/api/auth` to the Convex site through the edge again (compose) or directly (dev): Convex sees no trusted address, so every user shared one bucket of 3 attempts per 10 s. Forwarding an address would need a header the edge cannot overwrite and that a visitor calling the public Convex site cannot forge.
- Decision: count per identifier typed, 5 per minute, in a `signInAttempts` table through a better-auth `before` hook (#99); the address-keyed rules become a shared ceiling of 60 sign-ins and 10 reset requests per minute. Messages give the real wait.
- Why: a stranger can then slow one account for a minute but no longer lock everyone out; no proxy configuration to get right per deployment.
- Who: agent (judgement call)

#### Do sessions slide with use (B2), and what bounds a Keycloak role removal then?

- Context: ADR 0004/0021 fixed 24 h from login so a Keycloak role removal lands within 24 h; the owner accepted the audit's default, sliding sessions.
- Decision: 24 h after the last use, refreshed at most once an hour, capped at 7 days after login by a `session.update.before` hook (#99). The hook fails open (no cap) if it cannot read the login time, because refusing the update signs the user out.
- Why: an active user is no longer signed out mid-task; a role removal still lands within a week, or at once when an admin disables the account.
- Who: agent (judgement call); ADR 0031 amends 0004 and 0021

#### How does the sign-in page know why a session ended (A3)?

- Context: the audit asked for `?reason=expired|disabled`; the client cannot tell the two apart.
- Decision: the server's `unauthenticated` refusal carries `reason`, `disabled` when the token's user is banned, else `expired`; the signed-in layout forwards it to `/login?reason=`. The identifier is not prefilled after a forced sign-out: `users.me` does not carry the username, and the message is enough.
- Why: the server knows; no extra request.
- Who: agent (obvious)

#### Where does the reset page get the username for password managers (A4)?

- Decision: the invitation and forgot-password links carry `login=<address>` in their landing URL; the page puts it in a hidden `username` field and passes it to « Se connecter » afterwards.
- Who: agent (obvious)

#### Tab titles: with or without the brand (A108)?

- Context: the owner commented « Pas besoin du netplan dans le titre d'onglet ».
- Decision: no brand in any tab title (« Rez-de-chaussée · Bâtiment A », « Inventaire », « Connexion », « Page introuvable »); a page without its own title reads « NetPlan ».
- Why: one rule everywhere; the favicon carries the brand.
- Who: owner (comment on A108), extended to every page by agent

#### Brand and the `/logo` page (B30)

- Context: the owner overrode the default: « NetPlan » everywhere, the light logo only in the light theme and the dark one only in the dark theme.
- Decision: « NetPlan » in every string a user reads (UI, mails, server messages, NetBox field labels; the custom-field script only creates missing fields, so nothing on the real NetBox changes); code identifiers and English docs keep "Netplan". `/logo` showed both variants side by side, against the rule: removed. The variants now follow the theme on every page because the theme class is always on `<html>` (A46/A47).
- Who: owner (comment on B30)

#### Why did test logins keep « logging out » in the preview browser?

- Context: random redirects to `/login` while testing on `http://127.0.0.1:3515`.
- Decision: cookies are per host, not per port: the other lots' instances on 127.0.0.1 overwrite the better-auth cookie in the shared preview profile. Not a Netplan bug. Tested in separate profiles; `<name>.localhost` is not a trusted origin on this branch's dev:agent, so sign-out there answers 403.
- Who: agent (obvious)

#### Which self-review findings were fixed, and which kept?

- Context: a review pass over the stack found no P0, one P1 and several P2.
- Decision: fixed — the offline fallback token is seeded from the hydrated context (a full load never ran `beforeLoad` in the browser, so the first offline page change failed); the fallback applies to network failures only; structure actions of the empty map pause while frozen; the purge of sign-in windows reschedules itself while batches are full; the reset link's `login` is built by the server from the account, not from the request. Kept — once a session reaches its 7-day cap, each `get-session` in its last day rewrites the same expiry (one small write per page load or focus, harmless); an account's username and email count apart (10 attempts a minute instead of 5, documented in the ADR).
- Who: agent (judgement call)

#### Why read the login form from the DOM rather than React state?

- Context: in the browser check, a login typed right after the page loaded failed with « Identifiant ou mot de passe incorrect » while the same credentials worked through the API: the typing landed before hydration, the DOM held it, React state stayed empty. A password manager filling the form does the same, which is A1's scenario.
- Decision: login, reset and forgot forms read their values from `FormData` on submit (#99).
- Who: agent (obvious)

#### Which ADR number?

- Context: U3 and U2 merged ADRs 0029 and 0030 first.
- Decision: the lot's ADR is 0031.
- Who: agent (obvious)
