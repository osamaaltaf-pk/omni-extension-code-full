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

## 🔑 Key Generator & Vercel Env Configuration

Your licensing keys are secure because the generation script validates a secret admin key that is **never** stored inside the client-side extension. Instead, it is configured directly on your backend.

### ⚙️ Vercel Environment Configuration
* Your Admin password is set as an Environment Variable named **`ADMIN_SECRET_KEY`** inside your Vercel Project Dashboard.
* **How to change it**:
  1. Go to your Vercel Dashboard and select the project: `omni-licensing-backend`.
  2. Navigate to **Settings** -> **Environment Variables**.
  3. Look for the variable `ADMIN_SECRET_KEY`. You can edit this value or see what it is set to.
  4. If you change it, Vercel will automatically redeploy the backend and make the new password active instantly.

### 🛠️ Creating Client Activation Codes
1. Visit the live **[Admin Key Generator Portal](https://omni-licensing-backend.vercel.app)**.
2. In the **Admin Secret Key** field, type your custom password (set in the Vercel `ADMIN_SECRET_KEY` variable).
3. Under **Licensing Plan**, select the plan the customer purchased (Silver, Gold, Diamond, Elite, Premium Elite).
4. The validity days and credits limits will auto-calculate according to your plans checklist, but you can adjust them manually if needed (e.g. for custom orders).
5. Click **⚡ Generate Activation Code**.
6. If the password matches, the backend will return a unique activation code (e.g., `OMNI_XXXXXX_XXXXXX`).
7. Copy the key and send it to the customer. When they paste it in their extension side panel, it will lock to their Device ID and activate their premium features.

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
