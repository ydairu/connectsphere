# ConnectSphere

ConnectSphere is the foundation for a full-stack event management platform for attendees and event employees. This first iteration includes Firebase email/password authentication, Firestore-backed user roles, protected frontend routing, and a token-protected Express API. Event management features are intentionally not included yet.

## Technology stack

- React 19, Vite, and React Router
- Node.js and Express
- Firebase Authentication and Cloud Firestore
- Firebase Admin SDK for backend token verification
- Custom responsive CSS

## Project structure

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
└── package.json
```

## Installation

Requires Node.js 20.19+ or 22.12+.

Install each application independently:

```bash
cd frontend
npm install

cd ../backend
npm install
```

To use the combined root development command, also install the root dependency:

```bash
cd ..
npm install
```

Alternatively, install everything from the repository root:

```bash
npm run install:all
```

## Firebase configuration

1. Create a Firebase project in the Firebase console.
2. Add a web app and copy its configuration values.
3. Enable **Email/Password** under Authentication > Sign-in method.
4. Create a Cloud Firestore database.
5. Create a Firebase service account and copy its project ID, client email, and private key.
6. Copy `.env.example` to `.env` at the repository root and replace every placeholder.

Only one root `.env` is used. Vite loads it through `frontend/vite.config.js`, while the backend loads the same file through `dotenv`. Never prefix backend secrets with `VITE_`; Vite-prefixed values are exposed to the browser bundle.

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

The private key may contain escaped newlines (`\\n`); the backend converts these to real newline characters before initializing Firebase Admin.

## Run locally

Start both applications from the repository root:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:frontend
npm run dev:backend
```

The frontend runs at `http://localhost:5173` and the API defaults to `http://localhost:5000`. Verify the API with `GET http://localhost:5000/api/health`.

## Authentication and roles

Registration creates a Firebase Authentication account and a matching `users/{uid}` Firestore document containing `name`, `email`, `role`, and `createdAt`. The supported roles are `attendee` and `employee`.

`AuthContext` listens for persisted Firebase sessions and loads the authenticated user's Firestore profile before protected routes render. Frontend role helpers are intended for presentation and routing only; they are not a security boundary.

For backend requests, `frontend/src/services/api.js` obtains the current user's Firebase ID token and sends it as `Authorization: Bearer <firebase-id-token>`. The authentication middleware verifies the token using Firebase Admin, retrieves `users/{uid}`, and places the trusted UID and Firestore role on `req.user`. Future protected endpoints can combine `authenticate` with `requireRole('employee')` or `requireRole('attendee')`.

For this prototype, users may self-register as employees. In production, employee accounts should normally be provisioned or approved by an administrator.

## Firestore rules

Start with rules that allow users to create and read only their own profile. Role-based data access for future event collections should be enforced separately in Firestore rules and in backend middleware.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow create: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.data.role in ['attendee', 'employee'];
      allow read: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.data.role == resource.data.role;
    }
  }
}
```

The backend never trusts a role supplied with an API request. It always reads the role from the authenticated user's Firestore document.
