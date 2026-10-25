# DriveFlow AI

DriveFlow AI is a dealership assistant that helps customers explore vehicle inventory, check test-drive availability, and submit enquiries or book appointments through a conversational interface.

## Features

- Search available vehicles by make, model, or price.
- Check test-drive availability and request an appointment.
- Save customer enquiries against a vehicle or as a general enquiry.
- Review and confirm an action before it is saved.

## Tech stack

- **Frontend:** React 19, TypeScript, and Vite
- **Backend:** Node.js, TypeScript, and Express
- **Data:** PostgreSQL
- **AI:** Nebius API, accessed through the OpenAI SDK

## Run locally

### Prerequisites

- Node.js and npm
- PostgreSQL
- A Nebius API key

### 1. Set up the database

Create a PostgreSQL database, then run [`backend/src/db/schema.sql`](backend/src/db/schema.sql) against it. This creates the tables and inserts sample vehicles.

### 2. Configure environment variables

Create `backend/.env`:

```env
NEBIUS_API_KEY=your-nebius-api-key
DATABASE_URL=postgresql://username:password@localhost:5432/your_database
PORT=3000
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000
```

### 3. Install dependencies and start the apps

In one terminal:

```sh
cd backend
npm ci
npm run dev
```

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite in your browser. The backend runs on port `3000` by default.
