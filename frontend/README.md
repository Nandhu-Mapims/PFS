
# Patient Feedback Management System

This project now includes:

- A patient feedback form (frontend)
- A Node/Express API (`../backend/`)
- MongoDB persistence
- An admin page (`/admin`) to view feedback from MongoDB
- Docker setup for MongoDB

## 1) Start MongoDB with Docker

From workspace root (`feedbacksystem`), run:

```bash
docker compose up -d
```

## 2) Run backend API

```bash
cd ../backend
npm install
cp .env.example .env
npm run dev
```

Backend runs on `http://localhost:5000`.

## 3) Run frontend

In another terminal (inside this frontend folder):

```bash
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Routes

- `/feedback-form` -> patient submission form
- `/admin` -> admin table showing all saved feedback
  