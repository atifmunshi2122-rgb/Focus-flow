# FocusFlow & Finance — Environment Variables Reference

This document provides a comprehensive catalog of all environment configuration variables used across the server runtime and the client bundle.

> [!WARNING]
> **Secret Confidentiality Rule:** Never commit real secrets, private keys, or API tokens to source control. Variables prefixed with `VITE_` are compiled into the client-side bundle and are publicly inspectable by browser visitors. All backend tokens and service account keys must remain strictly server-side.

---

## 1. Backend Server Environment Variables

These variables are consumed exclusively by the Express backend running in Node.js (`server.ts`, `server/auth.ts`, `server/security.ts`).

| Variable Name | Required | Default Value | Security Level | Purpose |
| :--- | :---: | :---: | :---: | :--- |
| `NODE_ENV` | **Yes** | `development` | Public | Environment indicator (`production` enables security headers, disables stack traces, and serves `dist/`). |
| `PORT` | No | `3000` | Public | HTTP listening port for Express. In Cloud Run or Heroku, this is injected automatically. |
| `APP_URL` | **Yes** | `http://localhost:3000` | Public | Canonical URL of the application. Used for CORS matching and OAuth callbacks. |
| `REQUIRE_AUTH` | **Yes** (in Prod) | `false` | Internal | When set to `true`, strictly mandates valid cryptographically verified Firebase ID Bearer tokens on all `/api` routes. |
| `ALLOWED_ORIGINS` | No | Match `APP_URL` | Public | Comma-separated list of allowed origins for cross-origin requests (e.g. `https://focusflow.yourdomain.com`). |
| `FIREBASE_PROJECT_ID` | **Yes** | Auto-detected | Public | Firebase Project ID used to verify JWT audience (`aud`) and issuer (`iss`) signatures. |
| `RATE_LIMIT_MAX_REQUESTS` | No | `300` | Internal | Maximum allowed API requests per IP within the rate-limit window. |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Internal | Sliding window duration in milliseconds (default: 60,000 ms = 1 minute). |

---

## 2. Frontend / Vite Client Environment Variables

These variables are prefixed with `VITE_` and are embedded into the client-side JavaScript bundle at build time (`npm run build`).

| Variable Name | Required | Fallback Source | Purpose |
| :--- | :---: | :---: | :--- |
| `VITE_FIREBASE_API_KEY` | No | `firebase-applet-config.json` | Firebase Web API key used by the Firebase JS SDK for client initialization. |
| `VITE_FIREBASE_AUTH_DOMAIN` | No | `firebase-applet-config.json` | Firebase Authentication domain (e.g., `project-id.firebaseapp.com`). |
| `VITE_FIREBASE_PROJECT_ID` | No | `firebase-applet-config.json` | Target Firebase project ID for client SDK routing. |
| `VITE_FIREBASE_STORAGE_BUCKET` | No | `firebase-applet-config.json` | Cloud Storage bucket URL for user profile assets. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | No | `firebase-applet-config.json` | Project messaging sender ID for push notifications. |
| `VITE_FIREBASE_APP_ID` | No | `firebase-applet-config.json` | Web App ID registered in the Firebase console. |
| `VITE_FIREBASE_DATABASE_ID` | No | `(default)` | Firestore database ID (supports custom named databases or default). |

---

## 3. Environment Profiles Comparison

### Development (`.env.local`)
```env
NODE_ENV="development"
PORT="3000"
APP_URL="http://localhost:3000"
REQUIRE_AUTH="false"
ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
RATE_LIMIT_MAX_REQUESTS="1000"
RATE_LIMIT_WINDOW_MS="60000"
```

### Production (`.env` or Cloud Secret Manager)
```env
NODE_ENV="production"
PORT="8080"
APP_URL="https://focusflow.yourdomain.com"
REQUIRE_AUTH="true"
ALLOWED_ORIGINS="https://focusflow.yourdomain.com"
FIREBASE_PROJECT_ID="your-production-firebase-project-id"
RATE_LIMIT_MAX_REQUESTS="300"
RATE_LIMIT_WINDOW_MS="60000"
VITE_FIREBASE_API_KEY="AIzaSyYourProductionApiKey"
VITE_FIREBASE_AUTH_DOMAIN="your-production-firebase-project-id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-production-firebase-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-production-firebase-project-id.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789012"
VITE_FIREBASE_APP_ID="1:123456789012:web:abcdef1234567890"
VITE_FIREBASE_DATABASE_ID="(default)"
```

---

## 4. Secret Management Best Practices

1. **Google Secret Manager (GCP / Cloud Run):**
   - Store sensitive backend parameters in Secret Manager and mount them directly as environment variables in Cloud Run:
     ```bash
     gcloud run services update focusflow-app \
       --set-secrets=FIREBASE_PROJECT_ID=firebase-project-id:latest
     ```
2. **GitHub Actions CI/CD:**
   - Store deployment variables as GitHub Repository Secrets (`Settings > Secrets and variables > Actions`).
   - Inject variables into the build container during `npm run build`.
3. **Local Machine Security:**
   - Ensure `.env*` files remain in `.gitignore`.
   - Never commit API keys or service account `.json` keyfiles to git repositories.

