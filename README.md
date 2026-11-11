# Raid Roster

Raid night availability for the roster. Players sign in with Battle.net and mark each raid night
**yes**, **no** or **-** for their own characters; officers can change everything, manage the roster
and set the schedule.

Next.js 16 (App Router, server actions) on SQLite through `@libsql/client`: a hosted [Turso](https://turso.tech)
database in production (required on Vercel), or a plain local file for development and Docker.

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

The first start creates the tables (in Turso, or in `data/raid-roster.db` when `TURSO_DATABASE_URL` is empty)
and seeds the 23-character roster and the schedule (Wed, Thu, Sun, Mon, Tue from 2026-11-12 to 2027-01-12;
Thursdays and Mondays start as yes).

## Deploy on Vercel (free Hobby plan)

Vercel's servers keep no files between requests, so the database must be Turso there.

1. **Turso:** sign up at <https://turso.tech> (free plan), create a database in an EU location close to
   Frankfurt, and create a token for it. Note the database URL (`libsql://…turso.io`) and the token.
   Installing the Turso integration from the Vercel Marketplace instead fills in both variables for you.
2. **Vercel:** *Add New → Project*, import `MDeik-Software/raid-attendance` (the Hobby plan only deploys
   organization repos that are public). Framework preset: Next.js; no build settings to change.
3. **Environment variables** (Project Settings → Environment Variables, Production):
   `APP_URL` (e.g. `https://raid-attendance.vercel.app`), `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET`,
   `BNET_REGION=eu`, `ADMIN_BATTLETAGS` (no quotes needed here), `APP_TIMEZONE=Europe/Athens`,
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Do not set `DEV_LOGIN`.
4. **Deploy**, then add `APP_URL/api/auth/callback` as a redirect URL on the Battle.net client. Use the
   production address only: preview deployments get other URLs that Battle.net will not accept.

`vercel.json` pins the functions to Frankfurt (`fra1`) so they sit next to an EU database.

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

Without Turso variables the database lives in the `roster-data` volume. Put the app behind HTTPS in
production and set `APP_URL` to that address; session cookies are marked secure when `APP_URL` starts
with `https://`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:3020` | Public address; builds the Battle.net redirect URL |
| `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET` | – | Battle.net API client |
| `BNET_REGION` | `eu` | Region of the characters (`eu`, `us`, `kr`, `tw`) |
| `ADMIN_BATTLETAGS` | – | Comma-separated BattleTags with full access |
| `APP_TIMEZONE` | `Europe/Athens` | When a night counts as past |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | – | Turso database; when empty, a local file is used |
| `DATA_DIR` | `./data` | Local SQLite file location (no Turso) |
| `DEV_LOGIN` | – | `1` enables the local test sign-in (never in production) |
