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
