# Raid Roster

Raid night availability for the roster. Players sign in with Battle.net and mark each raid night
**yes**, **no** or **-** for their own characters; officers can change everything, manage the roster
and set the schedule.

Next.js 16 (App Router, server actions) with a single SQLite file through Node's built-in `node:sqlite`.
No separate database server.

## How players are matched to rows

On every sign-in the app asks Blizzard's Profile API (`/profile/user/wow`, scope `wow.profile`) for the
characters on the player's Battle.net account.

- A roster row nobody has claimed yet matches a character **by name** (case-insensitive, accents count).
  The first match binds the row to that character's realm and Blizzard id.
- A claimed row matches **only** that exact character from then on, so a same-named character on another
  realm cannot take it over. Renaming the character in-game keeps the claim.
- If the character leaves the account, the next sign-in releases it.
- Officers can reset a claim on the *Roster & settings* page.

Players only see character names. BattleTags are shown to officers only; Battle.net never shares emails.

## Rules

- Players can change their own rows from today on. Past nights are locked for them (officers can still edit).
- Cells nobody has answered show the schedule default: nights ticked under *Nights that start as yes*
  show **yes**, the rest show **-**. Changing those defaults changes every unanswered cell.
- Clicking a cell walks yes → no → - → yes.
- A thick vertical line marks Wednesday, the EU weekly reset; a thick horizontal line separates roster blocks.

## Setup

1. Create an API client at <https://develop.battle.net/access/clients> and add the redirect URL
   `APP_URL/api/auth/callback`, e.g. `https://roster.example.com/api/auth/callback`
   (and `http://localhost:3020/api/auth/callback` for local testing).
2. `cp .env.example .env` and fill in `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET` and `ADMIN_BATTLETAGS`.
   Quote the BattleTags (`ADMIN_BATTLETAGS="Name#1234,Other#5678"`): an unquoted `#` starts a comment.

The first start creates `data/raid-roster.db` and seeds the 23-character roster and the schedule
(Wed, Thu, Sun, Mon, Tue from 2026-11-12 to 2027-01-12; Thursdays and Mondays start as yes).

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3020>. With `DEV_LOGIN=1` the sign-in page also has a local test form: enter any
BattleTag and the character names it should own. Those claims are bound to the realm `dev`; reset them
(or delete `data/`) before real players sign in.

## Run with Docker

```bash
docker compose up -d --build
```

The database lives in the `roster-data` volume. Put the app behind HTTPS in production and set `APP_URL`
to that address; session cookies are marked secure when `APP_URL` starts with `https://`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:3020` | Public address; builds the Battle.net redirect URL |
| `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET` | – | Battle.net API client |
| `BNET_REGION` | `eu` | Region of the characters (`eu`, `us`, `kr`, `tw`) |
| `ADMIN_BATTLETAGS` | – | Comma-separated BattleTags with full access |
| `APP_TIMEZONE` | `Europe/Athens` | When a night counts as past |
| `DATA_DIR` | `./data` | SQLite location |
| `DEV_LOGIN` | – | `1` enables the local test sign-in (never in production) |
