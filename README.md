# Omni Automator (Internal Codebase & Developer Directory)

This is the private repository containing the full, unlocked client-side Chrome Extension source code for **Omni Automator**.

---

## 📌 Project Overview
* **What is it?** A Chrome extension designed to automate prompt queuing and batch execution for image-to-video pipelines (Meta AI, Google Gemini, ChatGPT).
* **Why did we build it?** To bypass manual single-generation limits, pace interactions organically (stealth mode) to avoid rate limits, and provide structured, high-volume production output of media assets.
* **Licensing System**: Fully integrated with a Vercel backend using Supabase PostgreSQL. License checking validates device configurations and generates key authorizations bound to specific Hardware Device IDs.

---

## 🔗 Connected Resources & URLs

| Resource | URL | Description |
| :--- | :--- | :--- |
| **Private Code Repo** | [omni-extension-code-full](https://github.com/osamaaltaf-pk/omni-extension-code-full) | This repository (Chrome Extension source code). |
| **Backend API Code** | [omni-licensing-backend](https://github.com/osamaaltaf-pk/omni-licensing-backend) | GitHub repo containing the Node.js/Vercel serverless functions code. |
| **Public Doc Repo** | [omni-flow-pipeline](https://github.com/osamaaltaf-pk/omni-flow-pipeline) | Harmless, public-facing README guide/documentation for buyers. |
| **Vercel API URL** | [omni-licensing-backend](https://omni-licensing-backend.vercel.app) | Live production backend serverless endpoint. |
| **Vercel Admin Dashboard** | [Admin Key Generator](https://omni-licensing-backend.vercel.app) | Production-ready, tabbed glassmorphic Admin Portal. |

---

## 🛠️ System Architecture

### 1. Extension (Client) - `omni_v2_vercel`
* `manifest.json`: Camouflaged as a generic "Content Automation Assistant" to avoid trademark review flags on the Chrome Web Store.
* `core/licensing.js`: Standard client validator module. Interacts with the Vercel licensing server. Includes custom **AI assistant warnings** at the top to prevent coding bots from modifying licensing logic.
* `sidepanel/`: Side panel UI which handles file uploads, resolution preferences, delays, and contains payment directions.

### 2. Backend (Server) - `omni-licensing-backend`
* Built on Vercel Serverless (under `/api/*`).
* Configured using Vercel environment variables:
  * `ADMIN_SECRET_KEY`: Custom admin key used on the panel to authorize generating keys.
  * `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: Supabase database connections.
  * Database contains the `licenses` table tracking credits, expiry date, device ID, and status.

---

## 🔑 Generating Customer Licenses
1. Visit the live [Admin Key Generator](https://omni-licensing-backend.vercel.app).
2. Enter your custom `ADMIN_SECRET_KEY` in the password input.
3. Select the customer's purchase plan (Silver, Gold, Diamond, Elite, Premium Elite).
4. Click **Generate Activation Code**.
5. Copy the cryptographic code and send it to the user.

---

## 🚀 Pushing Updates

### Client Changes (Extension)
Run from `omni_v2_vercel` folder:
```bash
git add .
git commit -m "Describe your client changes"
git push origin main
```

### Server Changes (Backend API)
Run from `omni-licensing-backend` folder:
```bash
git add .
git commit -m "Describe your backend changes"
git push origin main
```
*(Vercel automatically listens to pushes on this repository and updates the live endpoints instantly.)*

---

*Copyright © 2026 Osama Altaf. Confidential.*
