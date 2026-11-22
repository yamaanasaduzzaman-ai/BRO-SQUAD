# BRO SQUAD: Complete Shared Room Expense Manager
### Production-Ready Mobile Web Application & Free Cloud Deployment Guide

A fintech-grade, mobile-first shared room expense management application designed for 4 roommates (**Asaduzzaman**, **Abdullah**, **Md Milon**, and **Md Monir**), built with pure Vanilla JavaScript, modular Firebase Web SDK (v10+), Cloud Firestore real-time persistence, and a dark glassmorphic design.

---

## 📁 Complete Project File Structure

```text
BRO-SQUAD/
├── public/
│   ├── index.html            # Main mobile application markup & views
│   ├── style.css             # Dark Glassmorphism CSS & touch-friendly styling
│   ├── app.js                # Core state, integer paisa math & Firestore sync
│   ├── firebase-config.js    # Firebase Web SDK initialization & room defaults
│   ├── manifest.json         # Progressive Web App (PWA) configuration
│   ├── service-worker.js     # Fast offline shell caching
│   └── icons/
│       └── icon.svg          # Emerald glow vector app icon
├── firebase.json             # Firebase Hosting single-page application configuration
├── .firebaserc               # Firebase project alias
├── firestore.rules           # Production security rules (role & membership checks)
├── firestore.indexes.json    # Composite query indexes for sorting
├── .github/
│   └── workflows/
│       └── firebase-hosting-merge.yml  # GitHub Actions automated deploy script
└── README.md                 # Complete documentation & mobile guide
```

---

## 🚀 Complete Step-by-Step Android Smartphone Deployment Guide

You can deploy and run this application without using a computer. Follow these steps on your Android smartphone:

### Step 1: Set Up Free Cloud Backend (Firebase Console)
1. In Chrome on your Android phone, visit: **[https://console.firebase.google.com/](https://console.firebase.google.com/)**
2. Sign in with your Google account.
3. Tap **"Add project"** ➔ Name it `BRO SQUAD` ➔ Turn Google Analytics **OFF** ➔ Tap **Create Project**.
4. Confirm you are on the **Spark Plan ($0/month)**.
5. Tap **Build ➔ Authentication** ➔ Enable **Email/Password**.
6. Under the **Users** tab, tap **Add user** to create the 4 squad accounts:
   - `asaduzzaman@brosquad.local` (or your real Gmail)
   - `abdullah@brosquad.local`
   - `milon@brosquad.local`
   - `monir@brosquad.local`
7. Tap **Build ➔ Firestore Database** ➔ Tap **Create database** ➔ Select region `asia-south1` (Mumbai) ➔ Select **Start in production mode**.
8. Go to the **Rules** tab in Firestore, paste the contents of `firestore.rules`, and tap **Publish**.
9. Tap the Web icon (`</>`) on the project overview page to get your `firebaseConfig` keys.

---

### Step 2: Create Free GitHub Repository
1. Open **[https://github.com/](https://github.com/)** on your Android phone.
2. Sign in or create a free account.
3. Tap **New repository** ➔ Repository name: `BRO-SQUAD` ➔ Set to **Public** or **Private** ➔ Check **Add a README file** ➔ Tap **Create repository**.
4. Tap **Add file ➔ Create new file** directly in your mobile browser to create each file:
   - Type `public/firebase-config.js` and paste your Firebase keys.
   - Type `public/style.css` and paste the CSS code.
   - Type `public/index.html` and paste the HTML markup.
   - Type `public/app.js` and paste the JavaScript controller.
   - Type `public/manifest.json` and paste the manifest.
   - Type `public/service-worker.js` and paste the worker script.
   - Type `public/icons/icon.svg` and paste the SVG icon.
   - Type `firebase.json` and `.firebaserc`.
   - Type `.github/workflows/firebase-hosting-merge.yml`.
5. Tap **Commit changes** after pasting each file.

---

### Step 3: Connect Firebase Hosting to GitHub for Automatic Free Deployment
You can connect your GitHub repository to Firebase Hosting using GitHub Actions:

#### Option A: Firebase GitHub Action (Easiest via GitHub Secret)
1. In your Firebase Console, tap the gear icon ⚙️ ➔ **Project settings** ➔ **Service accounts**.
2. Tap **Generate new private key** (downloads a `.json` file to your phone).
3. Open the downloaded `.json` file in any text viewer on Android and copy its full contents.
4. On GitHub, go to your `BRO-SQUAD` repository ➔ **Settings** ➔ **Secrets and variables** ➔ **Actions**.
5. Tap **New repository secret**:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT_BRO_SQUAD`
   - **Secret**: Paste the full JSON text copied in step 3.
6. Commit any small text edit or push to your `main` branch.
7. GitHub Actions will run automatically and deploy your site to:
   `https://<your-project-id>.web.app`

---

## 📲 How to Install as an Android App (PWA)
1. Open your live website URL in Chrome on your Android phone (e.g., `https://bro-squad-cloud.web.app`).
2. Tap the three dots (`⋮`) in the top-right corner of Chrome.
3. Tap **"Install app"** or **"Add to Home Screen"**.
4. Confirm installation.
5. The **BRO SQUAD** icon will appear on your home screen and open in standalone full-screen mode like a native app.
6. Repeat this on all four roommates' phones.

---

## 💰 Free-Tier Quota & Cost Protection Checklist
- **Firebase Spark Plan**: Always keeps cost at $0.00. No credit card is required.
- **50,000 Free Firestore Reads / Day**: 4 roommates will typically use fewer than 500 reads/day (< 1% of the free limit).
- **20,000 Free Firestore Writes / Day**: Daily room expense logging typically uses under 30 writes/day (< 0.2% of the free limit).
- **Offline / Quota Handling**: If the free daily quota is reached, operations pause until midnight Pacific Time. **Existing data is never deleted.**

---

## 🔄 Future Maintenance from Android
To edit code in the future:
1. Open GitHub on your phone browser.
2. Tap the file you want to edit (e.g. `public/index.html`).
3. Tap the pencil icon (✏️).
4. Edit the text and tap **Commit changes**.
5. GitHub Actions will automatically re-deploy your website within 30 seconds.
6. Your existing transactions and cloud database will remain intact and will not be overwritten.
