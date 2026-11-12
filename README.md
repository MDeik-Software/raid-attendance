# Raid Roster

Raid night availability for the raid team. Officers build the team from the guild's Battle.net roster;
players sign in with Battle.net, tick the characters they raid on, and mark each raid night **yes**, **no**
or **-** for them. Officers can change everything and set the schedule.

Next.js 16 (App Router, server actions) on SQLite through `@libsql/client`: a hosted [Turso](https://turso.tech)
database in production (required on Vercel), or a plain local file for development and Docker.

## Building the raid team (officers)

On *Roster & settings*:

1. **Guild:** pick the region and realm, enter the guild name and *Fetch guild*. The app reads the guild
   roster from Blizzard's API with its own client credentials. *Fetch again* any time to pick up new members,
   level-ups and rank changes. Fetching a **different** guild starts over: the old team and all answers go.
2. **Ranks:** Blizzard only reports rank numbers (0 is the Guild Master), so name them if that helps. Tick the
   ranks the raid team comes from and set the max level (90 in Midnight).
3. **Raid team:** every max-level member of a ticked rank is on the team. Untick anyone who is not; the grid
   shows exactly the ticked characters. Only choices that differ from the rank rule are stored, so promotions
   into a raid rank join the team on the next fetch. The block number groups rows on the grid.

Members who leave the guild drop off at the next fetch, unless an officer explicitly kept them on the team.
The app also fetches the roster again by itself: at a sign-in when the stored copy is over 15 minutes old,
and in the background while people use the grid when it is over 6 hours old. A failed or empty answer from
Battle.net keeps the stored roster.

## Who can see the grid

Only the raid team: officers (`ADMIN_BATTLETAGS`) and players with at least one raid team character on their
Battle.net account (ticked or not). Anyone else who signs in is turned away with an explanation; no session is
started and nothing about their account is stored. The check runs on every page and every change, so a player
who drops off the team (left the guild, rank or level change, an officer unticked them) is signed out on their
next request. Until an officer imports the guild, only officers can sign in.

Battle.net keeps people signed in, so signing in again after a refusal would bring back the same account. The
refusal page names the BattleTag and offers *Use a different Battle.net account* (also linked under the normal
sign-in button): it sends the player to Battle.net's sign-out (`account.battle.net/login/logout`) with `ref`
set to Battle.net's sign-in page for this app, so Battle.net signs them out and then asks which account to use.
Battle.net only continues to its own sites this way, which is why the app cannot return straight to itself.

## Claiming characters (players)

On every sign-in the app asks Blizzard's Profile API (`/profile/user/wow`, scope `wow.profile`) for the
characters on the player's Battle.net account, in the guild's region.

- *My characters* lists the player's max-level characters. Ticking one marks it active; an active raid team
  character is **claimed**: the player can mark nights on its row. Players with no active character land on
  *My characters* after signing in.
- Claims follow the exact character (realm and Blizzard id), so names never collide. A character belongs to
  one account: if it moves to another account, the new owner's sign-in takes it over, and the old owner's
  claim ends when it leaves their account.
- Raid team characters nobody has claimed show a **!** next to their name on the grid.

Players only see character names. BattleTags are shown to officers only; Battle.net never shares emails.

## Home page

After signing in, players land on a character sheet for their claimed raid team character (chips switch
between several). Officers can open any team member's sheet, from the picker or by clicking a name on the grid.

- **Gear, stats, talents** come from Blizzard's Profile API with the app's own credentials, cached for
  30 minutes. Blizzard updates a character after it logs out in-game.
- **Raid readiness** flags missing enchants, empty gem sockets, slots 10 or more item levels below the
  character's average, and an unanswered next raid night; it also shows tier set bonuses and the item level
  against the team average. Which slots take an enchant is judged from the team's own gear (a slot counts when
  most of the team has it enchanted), so it follows the game without a hand-kept list. Team sheets refresh in
  the background every 6 hours.
- **Run Droptimizer** opens Raidbots in a new tab with the character filled in; the sim runs on the player's
  own Raidbots account. Raidbots has no public API for starting sims.

## Rules

- Players can change the rows they claimed from today on. Past nights are locked for them (officers can still edit).
- Cells nobody has answered show the schedule default: nights ticked under *Nights that start as yes*
  show **yes**, the rest show **-**. Changing those defaults changes every unanswered cell.
- Clicking a cell walks yes → no → - → yes.
- A thick vertical line marks Wednesday, the EU weekly reset; a thick horizontal line separates team blocks.

## Setup

1. Create an API client at <https://develop.battle.net/access/clients> and add the redirect URL
   `APP_URL/api/auth/callback`, e.g. `https://roster.example.com/api/auth/callback`
   (and `http://localhost:3020/api/auth/callback` for local testing).
2. `cp .env.example .env` and fill in `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET` and `ADMIN_BATTLETAGS`.
   Quote the BattleTags (`ADMIN_BATTLETAGS="Name#1234,Other#5678"`): an unquoted `#` starts a comment.

The first start creates the tables (in Turso, or in `data/raid-roster.db` when `TURSO_DATABASE_URL` is empty)
and seeds the schedule (Wed, Thu, Sun, Mon, Tue from 2026-11-12 to 2027-01-12; Thursdays and Mondays start
as yes). The team comes from the guild import above.

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
BattleTag and the character names its account should hold. A name that matches an imported guild member
(`Name`, or `Name-realm` to pick the realm) becomes that exact character, so test sign-ins can claim real
team rows; other names become max-level characters on the realm `dev`. Use it only against a local
database, never the live one.

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
| `BNET_REGION` | `eu` | Region of players' characters until a guild is imported; then the guild's region counts |
| `ADMIN_BATTLETAGS` | – | Comma-separated BattleTags with full access |
| `APP_TIMEZONE` | `Europe/Athens` | When a night counts as past |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | – | Turso database; when empty, a local file is used |
| `DATA_DIR` | `./data` | Local SQLite file location (no Turso) |
| `DEV_LOGIN` | – | `1` enables the local test sign-in (never in production) |
