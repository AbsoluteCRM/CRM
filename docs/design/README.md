# AbsoluteCRM design

This folder is the design record for AbsoluteCRM: what every screen looks
like, why, and the decisions the user made along the way. When an issue, a
review, an agent's memory, or a Claude artifact disagrees with this folder or
a feature's `ui.md`, **the repo wins**. Either fix the other thing, or change
the design deliberately with a new entry in [decisions.md](decisions.md).

## Why this lives in the repo

Designs often start somewhere else, such as a Claude Design canvas, an
artifact, or a screenshot in a chat. Those are private to their owner, can
change without notice, and aren't versioned with the code. A spec that only
its author can open isn't a spec. Everything needed to understand and build
a screen is copied here, and an external link is cited as origin only.

## What is here

| Path                         | What it is                                                  |
| ---------------------------- | ----------------------------------------------------------- |
| [decisions.md](decisions.md) | Dated log of every user design decision and its reason      |
| `docs/<feature>/ui.md`       | Per-feature screen specs, next to that feature's other docs |
| `docs/<feature>/shots/`      | PNG shots for that feature's screens (Git LFS)              |

The visual system is shadcn/ui (new-york style, zinc base, lucide icons) on
Tailwind v4. Its tokens are in `src/styles.css`.

## Feature specs

| Spec                          | Covers                                 | Screens                           |
| ----------------------------- | -------------------------------------- | --------------------------------- |
| [Calendar](../calendar/ui.md) | Weekly schedule and selected-day route | Calendar                          |
| [Requests](../requests/ui.md) | Public request portal                  | Request portal                    |
| [Quotes](../quotes/ui.md)     | Quote delivery and conversation        | Staff send dialog, customer quote |

Other existing `_authed/*` pages predate this record. Each one gets its
`ui.md` the next time a feature changes it.

## How to write a screen section

Each screen in a `docs/<feature>/ui.md` gets a `##` section titled with the
screen's name, then its shot(s), then these fields:

- **Route**: the path, for example `/clients/$clientId`, or "overlay on
  `/clients`".
- **Roles**: who can see the screen and who can act on it (owner, admin,
  dispatcher, worker), and what each one sees differently.
- **Layout**: what is on the screen, top to bottom, and which shadcn
  components are used.
- **States**: loading, empty, error, populated, and any others such as
  filtered-empty or read-only.
- **Interactions**: what each control does and what it opens; links to other
  screens.
- **Data**: the tRPC procedures the screen reads and writes.
- **Origin**: the mock it was built from (a Claude Design link, cited as
  origin only), or "built without a mock".
- **Code**: the route file and main components.

Start each `ui.md` with a one-line pointer back to this README, and a table
of its screens (screen, route, what it shows).

## Shots

- **What**: shots of the implemented UI, captured while verifying the feature
  in the running app. When the feature started from a mock, also commit the
  mock, as `<screen>-mock.png`.
- **How**: Playwright (or the `run` skill) at device scale factor 2.
  - Desktop shots at 1440×900, and phone shots at 390×844 when the screen has
    a phone layout.
  - Seeded demo data, signed in as the test user.
- **Names**: `docs/<feature>/shots/<screen>-<desktop|phone>[-<state>].png`,
  in lowercase kebab-case.
- **In docs**: embed each shot with an `<img>` and real alt text describing
  what it shows, for example
  `<img src="shots/client-list-desktop.png" alt="Client list with search, three clients, and the Add client button" width="620">`.
- **When**: in the same PR as the code they show, so they never drift. A PR
  that changes a screen re-captures its shots.

## Git LFS

Binaries under `docs/` (png, jpg, jpeg, gif, webp, pdf, mp4) are stored with
Git LFS; see [.gitattributes](../../.gitattributes). Nothing outside `docs/`
uses LFS, so builds and deploys don't need it.

- The devenv shell provides `git-lfs` and runs `git lfs install --local` on
  entry.
- Without devenv, install `git-lfs` and run `git lfs install` once per clone.
  Otherwise the shots are committed as raw files, or checked out as pointer
  files.
- GitHub's LFS storage and bandwidth quotas apply. Keep shots to the screens
  and states the spec actually describes.
