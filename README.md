# ConnectSphere

ConnectSphere is a full-stack event management foundation for attendees and event employees. It currently provides account registration, login, persistent sessions, Firestore-backed roles, a protected profile page, and an authenticated Express API. Event management features will be added in later iterations.

## Technology Stack

- **Frontend:** React 19, Vite, React Router, and custom responsive CSS
- **Backend:** Node.js and Express
- **Authentication:** Firebase Authentication with email and password
- **Database:** Firebase Cloud Firestore
- **Server authentication:** Firebase Admin SDK

## Project Structure

```text
connectsphere/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## How the App Works

1. A user registers or logs in through Firebase Authentication.
2. The user's Firebase UID identifies their document at `users/{uid}` in Firestore.
3. That document stores their name, email, role, and creation timestamp.
4. `AuthContext` restores sessions and loads the Firestore profile before protected pages render.
5. The frontend can send a Firebase ID token to the Express API.
6. The backend verifies the token and reads the user's trusted role from Firestore.

Supported roles are `attendee` and `employee`. Frontend role checks control presentation only; protected backend operations must enforce roles through authentication middleware.

## Local Setup

Requirements:

- Node.js 20.19+ or 22.12+
- A Firebase project with Email/Password Authentication enabled
- A Cloud Firestore database
- A Firebase service account for the backend

Install all dependencies from the repository root:

```bash
npm run install:all
```

Copy the sample configuration and replace its placeholders locally:

```bash
cp .env.example .env
```

The application uses one root `.env` file. It is ignored by Git and must never be committed.

## Environment Example

```env
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
VITE_API_URL=http://localhost:5000

FIREBASE_PROJECT_ID=xxx
FIREBASE_CLIENT_EMAIL=xxx
FIREBASE_PRIVATE_KEY=xxx

PORT=5000
CLIENT_ORIGIN=http://localhost:5173
```

Only variables prefixed with `VITE_` are available to the browser. Never add the Admin SDK email, private key, passwords, or other server secrets to a `VITE_` variable. If the private key contains line breaks, store them as escaped `\\n` sequences.

## Start the App

Start the frontend and backend together:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- Health check: `http://localhost:5000/api/health`

You can also run either application separately with `npm run dev:frontend` or `npm run dev:backend`.

## Seed Accounts

These credentials are for local prototype testing only:

| Role | Email | Password |
| --- | --- | --- |
| Attendee | `attendee1@gmail.com` | `Password123!` |
| Employee | `employee1@gmail.com` | `Password123!` |

The accounts must exist in Firebase Authentication and have matching Firestore documents at `users/{uid}` with the appropriate `attendee` or `employee` role. Remove or change these shared credentials before any public deployment.
