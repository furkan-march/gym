# Gym — Personal Training PWA

A local-first, offline-capable training tracker built for one user (Furkan), designed for one-hand use on an iPhone during workouts. No backend, no accounts: **all data lives in your browser's IndexedDB** and belongs to you.

Core loop: open **Today** → start the scheduled workout → log sets with one tap → get transparent progressive-overload recommendations next session.

## Stack

React 19 · TypeScript (strict) · Vite · Tailwind CSS 4 · Dexie (IndexedDB) · Zod · Recharts · date-fns · vite-plugin-pwa · Vitest + React Testing Library

## Development

```bash
npm install
npm run dev        # local dev server
npm run test       # unit + integration tests (Vitest)
npm run typecheck  # strict TypeScript check
npm run build      # production build (runs tsc first)
npm run preview    # serve the production build locally
```

Node 22 LTS or newer is required.

## Current deployment

Live at **https://furkan-march.github.io/gym/** (GitHub Pages, `gh-pages` branch).

To redeploy after changes:

```bash
npm run deploy
```

## Alternative: deploying to Vercel

1. Push this folder to a Git repository (GitHub/GitLab).
2. In Vercel: **Add New Project** → import the repo.
3. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output `dist`.
4. Deploy. The site is served over HTTPS, which the service worker requires.

Any static host works (Netlify, Cloudflare Pages…) — the app is a plain static bundle.

## Installing on iPhone

1. Open the deployed URL in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch from the home-screen icon. After the first successful load the app works fully **offline**.

### Updates

When a new version is deployed, the app shows **"A new version is available."** Tap **Update** — during an active workout the banner waits until you save, and never interrupts a session.

## Backups — read this

Your data exists **only on this device**, inside the browser storage of the installed web app.

- **Export**: Settings → Data → **Export full backup**. On iPhone this opens the share sheet — choose **Save to Files** (or iCloud Drive/AirDrop). Do this regularly; the app shows a gentle reminder when a backup is overdue.
- **Restore**: Settings → Data → **Import backup** → pick the JSON file → review the preview → confirm. Import **replaces** all current data and is transactional: it either fully succeeds or nothing changes.
- **Danger zone**: Deleting the home-screen app, clearing Safari website data, or restoring the phone **destroys all local data**. Export a backup first.

The app requests durable storage (`navigator.storage.persist()`) and shows the persistence status plus approximate usage in Settings → Data.

## Known iOS/browser limitations

- **Rest-timer alerts cannot fire while the screen is off or the app is backgrounded** — iOS suspends all JavaScript. The app therefore keeps the screen awake during workouts (Wake Lock, iOS 16.4+; reliable in installed apps from iOS 18.4). If the timer expires while suspended, you'll see "Rest finished N:SS ago" and hear the chime on return.
- **No vibration**: iOS Safari has never implemented `navigator.vibrate`.
- **No notifications** in V1: scheduled local notifications don't exist on the web, and push requires a server this app deliberately doesn't have.
- **Sound**: the chime plays through an HTML audio element (so the ring/silent switch doesn't mute it) and is primed by your set-completion tap. It cannot play while the phone is locked.
- **File export**: uses the share sheet (`navigator.share`) because programmatic downloads are unreliable in installed iOS web apps. On desktop it falls back to a normal download.

## Manual device checklist

These can only be verified on a real iPhone (everything else is covered by the automated tests):

1. Rest timer recovers correctly after locking the phone mid-rest, including the "Rest finished N:SS ago" state; the screen stays awake during a workout.
2. The app loads and logs workouts with airplane mode on (after installation).
3. No horizontal overflow anywhere.
4. Backup export via share sheet → Save to Files, then re-import, works in the installed app.

## Architecture

```
src/
  lib/
    types.ts        # data model: sessions snapshot prescription, bodyweight,
    db.ts           #   and load convention so history is never reinterpreted
    dates.ts        # local-date (dateKey) conventions — never UTC grouping
    seed/           # default program (Upper A/B, Lower), posture, meals, demo data
    data/           # data-access layer — every write goes through here,
                    #   so a future sync engine can slot in behind it (V2)
    engines/        # pure, tested logic: schedule, adherence, progression
                    #   (double progression + stall detection), records, body
                    #   metrics, weekly check-in, rest-timer math, duration
    backup/         # Zod-validated JSON backup, CSV export, share-sheet helper
  ui/
    components/     # design system (dark charcoal, one accent, 44px targets)
    hooks/          # settings, wake lock, ticking clock, PWA update prompt
    screens/        # Today, ActiveWorkout, History, Progress, Plan, Settings
```

Key invariants:

- **IndexedDB is the source of truth**; React state is never the only copy.
- **Sessions snapshot everything they depend on** (prescription, bodyweight, dumbbell convention) — editing your plan or logging a new weight never rewrites history.
- **Recommendations are computed, not stored** — only your accept/edit/dismiss responses persist, keyed to the source session and content hash, so history edits invalidate them automatically.
- **Timers use absolute timestamps** — suspension can't desync them.
- Warm-up sets never count toward progression, records, or adherence.
