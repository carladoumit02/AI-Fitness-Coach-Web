# Feature preservation / parity checklist

## Principle

The original Windows desktop releases are the reference implementation. The web application should **add** cloud accounts, cross-device access, and an online leaderboard, **not replace or silently discard** the existing exercise, program and analytics features. Original ZIP archives remain outside this public repository and must not be overwritten.

Source of truth reviewed:
- Dimitri's `AI_Fitness_Coach_V2_Windows.zip` (especially `config.json`, `coach/ui.py`, `coach/advanced_ui.py`, `coach/engine.py`)
- `AI_Fitness_Coach_V3_Accounts_Leaderboard_Windows.zip`, which layers accounts and rankings onto V2
- Current Vite site in `src/app.js` and `src/scoring.js`

## Preset programs — exact V2 settings

| Program | Description | Squats | Push-ups | Plank | Rest between exercises |
|---|---|---:|---:|---:|---:|
| Beginner | Build a strong foundation | 10 reps | 5 reps | 20 seconds | 30 seconds |
| Intermediate | Increase endurance and control | 15 reps | 10 reps | 40 seconds | 25 seconds |
| Advanced | Challenge strength and consistency | 25 reps | 20 reps | 60 seconds | 20 seconds |

V2 runs all three exercises **in sequence**, with exercise-specific intro, position check, countdown, active exercise, rest/skip-rest, completion summary, and history. The V2 presets were unchanged in V3. Do not substitute three independent exercise buttons for this behavior.

## Feature parity audit (Nov 26, 2026)

| Desktop feature | Current browser state | Porting requirement |
|---|---|---|
| Three preset multi-exercise programs and between-exercise rest | Missing | Recreate exact presets and continuous session workflow |
| Custom program builder (up to 12 sets, reorder, targets, rest, saved per user) | Missing | Add builder, save per account in Supabase |
| Squat / push-up / forearm plank | Present using **web heuristics**, NOT desktop classifiers | Preserve working webcam mode; validate against V2 on real video |
| Stationary lunges / bicep curls / jumping jacks | Missing | Port geometry and per-exercise guidance, with camera directions |
| Auto recognition of squat / push-up / plank / idle | Missing | Port carefully; desktop sequence model was trained on synthetic generated features and must be described as experimental |
| LSTM activity + temporal form prediction | Missing | Evaluate portable `models/sequence.json` and training provenance, port without overstating validation |
| Optional voice coach | Missing | Prefer browser speech synthesis with opt-in switch |
| Personalized calibration | Missing | Port calibrated thresholds conservatively |
| Adaptive targets and extended rest | Missing | Port optional rules, preserve presets as defaults |
| Performance decline detection, tempo/range and analytics | Missing or very basic | Port calculations and personal history charts |
| Replay of landmarks, side-by-side schematic reference | Missing | Recreate local in-memory pose replay only, not raw footage |
| Login / member progress / rankings / admin deletion | Added as web features | Keep RLS, verify privacy and permissions |
| V3 grades and per-user preference storage | Grades present; preferences missing | Complete profile settings without weakening auth |

## Implementation order / acceptance criteria

1. **Preset programs**: Beginner, Intermediate, Advanced appear on home; start from the first exercise; follow targets and rest; show exercise-by-exercise and overall summary. Verify against `config.json`.
2. **Six-exercise library + custom workouts**: keep existing three; add lunge, curl, jack; builder supports up to 12 sets, ordering, rest and saved per-user plans.
3. **Advanced coaching**: optional voice, calibration, adaptive mode, fatigue/tempo/range, sequence recognition and replay. Keep model provenance explicit.
4. **Regression**: webcam, guest mode, signed-in session saving, progress, leaderboard, and admin deletion must continue to work. Test both Mac and Windows browsers.
5. **Do not claim parity until every feature has been demonstrated**. Browser pose tracking currently relies on heuristic angles; it does not load the desktop classifier weights.

## Architectural note

The Tkinter Windows application cannot be run directly inside GitHub Pages; the web version must **port** functions to JavaScript or use a separate server. Keep the desktop ZIP as an independently usable original while porting. Do not publish raw user databases, passwords, training data without permission, or secret keys.
