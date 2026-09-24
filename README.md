# FormOne VA Time Tracker

A 3D time tracker built with Three.js, Vite, and Appwrite Databases. Employees clock in and out from `/user`; managers can review attendance from `/admin`.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Clocking in creates a live room for that employee, and clocking out closes a persisted session log.

## Appwrite setup

1. Create a project in the [Appwrite Console](https://cloud.appwrite.io/).
2. Add a Web platform with hostname `localhost` (and your production hostname later).
3. Create a database and a `timeSessions` collection.
4. Add these collection attributes: `employee` (string, required), `clockedInAt` (string, required), and `clockedOutAt` (string, optional).
5. Allow the collection's users to create, read, and update documents. The app signs users in anonymously before database access.
6. Copy `.env.example` to `.env.local` and replace the project, database, and collection IDs.
7. Restart Vite after changing `.env.local`.

The app uses the `timeSessions` Appwrite collection. Appwrite project IDs are safe to include in a browser app; never put an Appwrite API key in `.env.local`.

Without `.env.local`, the app uses browser `localStorage` so the UI can still be previewed.