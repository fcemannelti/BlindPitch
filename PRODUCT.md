# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three roles, all authenticated, all served from the same origin by a Node server.

**Participante** — a student who has a scientific idea and wants it judged on its merits. They arrive from a login or a short signup, draft a proposal through a step-by-step form, submit it, and then want to know where it stands and what it scored. They are not expected to know anything about rubric mechanics or blinding. Their success is submitting a complete proposal once, and later reading an honest status or result.

**Avaliador** — a judge or teacher assessing proposals. They need the scientific content and nothing else. In the anonymous condition they must not be able to obtain the author's identity, and this is a hard product rule, not a display preference. They work through a queue of assignments, score a six-criterion rubric, save a draft, and finalize once.

**Organizador** — the person running the edition. They configure the event, approve the scientific version of each submitted proposal (a mandatory human pass before any assignment), distribute proposals to reviewers, monitor progress, and control when authorship may be released. They are the only role that can reveal identity, and they are accountable for the blinding actually holding.

## Product Purpose

BlindPitch is a web application for the first, blinded stage of scientific project evaluation, built for Ceará Faz Ciência 2026 under the theme "Ciência Delas".

It exists to investigate one question: does identifying the author influence how a scientific idea is evaluated? The working hypothesis is that temporarily withholding personal information during the first evaluation stage may reduce the influence of factors external to the scientific content and increase the weight of objective criteria.

Success means a reviewer can score a proposal using only problem, objective, methodology, solution, impact and clarity — and an organizer can later compare the anonymous and identified conditions on aggregate metrics, without ever exposing an individual.

**Current primary situation (confirmed):** live demonstration at a school fair, on a local machine, following the eight-step `Roteiro da feira` in `README.md`, with seeded demonstration data. Real student collection is a supported path but is not the present operating mode.

## Positioning

The mechanism is separation, not decoration. Author identity lives in `users` / `participant_profiles` / `project_authors`, never in the object the reviewer reads. The reviewer-facing API routes build an explicit DTO field by field and never include an `author` key, even when `reveal_identity` is on. Submitted proposals are machine-scrubbed for known identifiers, emails, links and identifying numeric sequences, and then pass a mandatory organizer review of every field before the proposal can be assigned. Reviewers are bound to a proposal with a private UUID that has no relationship to identity.

A neighbouring evaluation tool could claim to hide names. This one is structured so that hiding them is enforced by the schema and the route contract rather than by the interface.

## Operating Context

- **Deployment:** Node 24+, SQLite on disk, no external services, no CDN, no npm install required at runtime. Served on `http://127.0.0.1:3000` for a fair; `HOST=0.0.0.0` plus `COOKIE_SECURE=false` for laptop-to-device access on fair Wi-Fi. Production build in `dist/` still requires the server.
- **Fair demonstration:** a presenter walks the flow across three different accounts (participant, organizer, reviewer). Tabs in the same browser share a login, so simultaneous sessions need separate browsers or devices. Progress made in another device is picked up by refreshing.
- **Seeded demonstration data:** one organizer, two reviewers, three participants, six full proposals (~5,000 characters each, with methods, controls, schedules, materials, limitations and references), and assignments in pending, in-progress and finalized states. Every results view is labelled "Dados ilustrativos — resultados reais ainda serão coletados."
- **Demo accounts:** `organizador@blindpitch.demo`, `avaliador1@blindpitch.demo`, `avaliador2@blindpitch.demo`, `participante{1,2,3}@blindpitch.demo`, all with password `BlindPitch2026!`.
- **Real collection** uses a separate database (`DEMO_MODE=false`, new `DATABASE_PATH`, own admin credentials, HTTPS, restricted machine access, backups). A real database refuses to initialize if it contains demonstration editions.
- **Language:** the entire product is in Brazilian Portuguese. Status values, rubric criteria, roles and scientific areas are all Portuguese-facing, including friendly labels for the internal state machine.

## Capabilities and Constraints

**Project lifecycle.** `draft → submitted → assigned → under_review → reviewed → results_available`, plus `archived`. Submitting locks normal editing and generates the anonymous code `BP-2026-XXXX`, allocated in a transaction from a per-year sequence with a UNIQUE constraint that spans editions. The organizer may reopen a submitted proposal only while it has no assignments; the code survives and the anonymization must be re-reviewed. Proposals with pending reviews cannot be archived.

**Separation of identity.** The reviewer route contract exposes exactly the scientific fields plus the anonymous code: title, scientific area, problem, objective, methodology, proposed solution, expected impact, keywords, and the reviewer's own results. No project ID, no participant ID, no timestamps, no authorship relation. Known-identifier removal is re-applied to reviewer responses, including the reviewer's own comments.

**Organizer approval gate.** Automatic scrubbing cannot recognize every identifiable hint in free text. A human pass over every field of the scientific version is mandatory before assignment, and the reviewed version is frozen once assigned.

**Rubric.** Configurable per edition; default six criteria (Problema, Inovação, Metodologia, Viabilidade, Impacto, Clareza), 0–10, with weights. Locked after the first assignment. Total = `Σ(score × weight)`; normalized score = `100 − (total − Σ(min × weight)) / Σ((max − min) × weight)`. Scores outside the range are rejected. A reviewer cannot receive the same proposal in two different conditions (prevents recognition by memory), and finalization is single-shot in the backend.

**Experimental conditions (confirmed).** The `identified` condition exists in the code but **will not be used for real collection now**; the plan is anonymous-only. Keep the capability intact and assume the comparison screen will be exercised only on demonstration data. Identified mode requires protocol enabled plus specific per-edition consent; refusing consent does not block anonymous participation.

**Ambiguity handling (confirmed).** When a proposal may still leak identity or its scientific content is unclear, the product errs toward stopping the review and asking the organizer rather than letting the evaluator continue.

**Metrics and reporting.** Means, medians, score distribution, per-criterion means, review duration and reviewer counts use finalized reviews only, compared by condition, aggregate only. The CSV export carries no names and no individual codes. No public dashboard exposes individual data, and the product never concludes on its own that a difference proves bias or discrimination.

**Consent.** Per edition, tied to the exact protocol text. Optional and revocable in scope.

**Known limits of this MVP.** No password recovery by email, no notifications, no uploads, no self-service deletion. SQLite suits a single local instance or a single server; multiple replicas need a different database and edge rate limiting. The backend is not fully statically typed, though the frontend JavaScript is type-checked.

## Brand Commitments

- **Name:** BlindPitch. **Slogan:** "Primeiro a ideia. Depois, quem a criou."
- **Provided assets are mandatory, not decorative.** The application uses exactly the six supplied scientific-owl images (Química, Física, Matemática, Biologia, Astronomia, Tecnologia) as transparent PNG and lossless WebP with verified alpha. They are the landing hero, rotated in trios on a 5-second cycle; they are also the sole source for empty states, login, signup, dashboards, the anonymous-review state and dialogs. No CSS-drawn mascot, no replacement illustration.
- **Aesthetic commitment (from the specification, recorded without expansion):** technology + science + trust + neutrality; dark blue, blue, purple, magenta used only as small accents. Scientific, technological, young, professional, accessible. Explicitly not decorative or childish.
- **Scientific register (confirmed).** The product investigates, seeks to reduce possible bias, may contribute, will be analysed experimentally. It never asserts that discrimination exists or that the system eliminates prejudice.
- **Visual world (recorded 2026-10-08).** A scientific instrument rendered as an editorial publication. Cool near-white ground on the navy axis (never a reflex cream/beige), near-black ink, one blue reserved for interaction, purple reserved for the anonymous/identified dimension where colour carries meaning, and gold as the medal colour — drawn from the owls' own star-trimmed hats, and spent only on progress, ranking and the masthead rule. Structure comes from hairlines and open areas, not stacked boxes: panels carry a top rule and breathing room instead of a surface and shadow. Depth is declared once — shadow only on what genuinely floats (dialog, toast). Three radii (4/6/10px). Two self-hosted variable faces: Source Sans 3 for interface, Newsreader for display. Motion only where it communicates state.
- **Hero composition (binding).** Six owls, cycle intact. The composition must always present a protagonist: the centre owl is the largest subject (about 1.5fr against 1fr for each side), the two flanking owls are secondary (roughly 65–75% of the centre), offset on a diagonal, slightly rotated, overlapping inward, and separated by depth via z-index. Both trios must satisfy this because the animation swaps which trio is visible. Two hairline orbital rings sit behind the cast as a quiet celestial body.

## Evidence on Hand

- Specification, architecture, interface, proposals, audit, redesign and acceptance reports in `docs/`; original instructions PDF in `docs/BlindPitch_Instrucoes_para_Gerar_Aplicativo.pdf`.
- Six full fictional proposals, including the reference project `BP-2026-017` "Sistema inteligente para reduzir desperdício de energia na escola".
- Automated coverage: HTTP + SQLite tests in `tests/`, an end-to-end API test, a headless-Chrome experience test (`npm run test:browser`), and a 26-screen layout renderer (`node scripts/visual-qa.mjs`) with reports and screenshots in `test-results/`.
- **No real results, participants, testimonials, customers or press exist.** No scientific outcome has been collected. No production deployment claim, pricing or licence commitment is confirmed. Future work must not fabricate any of these.

## Product Principles

1. **Blinding is structural, never presentational.** A reviewer who cannot reach identity through the API is a stronger guarantee than a reviewer who cannot see it on screen. Any change that moves identity into the reviewer-facing object breaks the product's reason to exist.
2. **Science first, and say so plainly.** When in doubt about leaking identity or scientific clarity, stop and ask the organizer. A stalled review is recoverable; a contaminated dataset is not.
3. **Aggregate reporting only.** Never expose individual notes, individual scores or individual identities in any shared view, including exports. Compare conditions in aggregate and let the research speak.
4. **Never overclaim.** The product measures and compares; it does not conclude that bias exists or that it has been removed. Demonstration data is always labelled as illustrative.
5. **Demo-honest and install-free.** The app must run and demonstrate end to end on a fair laptop with no install step, no network dependency and no external service, while keeping the real-collection path honest and separate.

## Accessibility & Inclusion

Required: keyboard navigation throughout, labels on all form fields, adequate contrast, visible focus, alternative text, state communicated without relying on colour alone, and responsive behaviour on phone, tablet and desktop. Reduced-motion is honoured — the owl trio stays static and page, card and button animations are dropped.

Target audience is secondary-school students in Ceará, including the "Ciência Delas" theme. Scientific writing quality varies widely, so comprehension aids and plain-language errors matter more than technical precision in reviewer's-facing copy. Automated tests do not replace testing with assistive-technology users.

**Audit coverage is part of the accessibility contract.** An audit that skips a route is a passing test pointed at the wrong target: the critique run of 2026-10-09 found an `h1 → h3` jump on `/` and a two-tracks-for-three-items wrap defect in the 900–940px band that no sweep reported, because `scripts/ux-qa.mjs` visited only authenticated pages and only 390px and 1440px. Therefore: every route of every role, including the logged-out landing, must be in a sweep; and the width list must include at least one value inside each responsive band, not only the extremes.

**Exactly one skip link, and activating it must not change the route.** The app is hash-routed, so a skip link whose handler does not `preventDefault()` silently becomes navigation — a defect measured in this run, where the static `.skip` link in `index.html` sent logged-out visitors to `#/login`. There must be a single skip link in the DOM, it must carry `data-skip-link`, and activating it must leave `location.hash` untouched with focus on `#main`.