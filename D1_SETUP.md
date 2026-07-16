# Cloudflare D1 setup

This project now uses a Cloudflare Worker API plus a D1 database.

## 1. Create the database

In Cloudflare Dashboard:

1. Open **Storage & Databases**.
2. Open **D1 SQL Database**.
3. Click **Create database**.
4. Use this database name:

```text
my-blog-forum-db
```

5. Copy the database ID.

## 2. Update Wrangler config

Open `wrangler.jsonc` and replace:

```text
REPLACE_WITH_YOUR_D1_DATABASE_ID
```

with your real D1 database ID.

## 3. Create tables

Open the new D1 database in Cloudflare Dashboard, go to **Console**, paste all SQL from `schema.sql`, and run it.

The SQL creates:

- users
- sessions
- topics
- posts
- comments

It also inserts the default topic categories.

## 4. Deploy command

Use this deploy command in Cloudflare Builds:

```text
npx wrangler deploy
```

Keep the build command:

```text
npm run build
```
