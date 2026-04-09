# Google Calendar Integration Setup

This app can push tasks with due dates to Google Calendar automatically. Setup takes about 5 minutes inside Google Cloud Console.

---

## Step 1 — Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Give it any name (e.g. `My Task Manager`) → **Create**
4. Make sure the new project is selected in the dropdown before continuing

---

## Step 2 — Enable the Google Calendar API

1. In the left sidebar go to **APIs & Services → Library**
2. Search for **Google Calendar API**
3. Click it → **Enable**

---

## Step 3 — Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** → **Create**
3. Fill in the required fields:
   - **App name** — anything you like (e.g. `Task Manager`)
   - **User support email** — your email
   - **Developer contact email** — your email
4. Click **Save and Continue** through the Scopes and Test Users screens (no changes needed there)
5. On the **Test users** screen, click **Add users** and add your Google account email
   - This is required while the app is in "Testing" mode — only added test users can authorize
6. Click **Save and Continue** → **Back to Dashboard**

---

## Step 4 — Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Give it a name (e.g. `Task Manager OAuth`)
5. Under **Authorized redirect URIs**, click **Add URI** and enter:
   ```
   http://localhost:3000/api/google-calendar/callback
   ```
   Replace `localhost:3000` with your actual domain if self-hosting publicly (e.g. `https://yourdomain.com/api/google-calendar/callback`)
6. Click **Create**
7. A dialog shows your **Client ID** and **Client Secret** — copy both

---

## Step 5 — Enter Credentials in the App

1. Open the app and click the **Settings** gear icon
2. Navigate to the **Google Cal** tab
3. Paste your **Client ID** and **Client Secret** into the fields
4. Click **Save credentials**

---

## Step 6 — Connect Your Google Account

1. Still in Settings → **Google Cal**, click **Connect Google Calendar**
2. You'll be redirected to Google's authorization page
3. Sign in with the Google account you added as a test user in Step 3
4. Grant the requested permissions
5. You'll be redirected back to the app with a confirmation

---

## How Sync Works

| Action | What happens |
|--------|-------------|
| Create a task with a due date | Automatically pushed to Google Calendar |
| Edit a task's title, date, or time | Event updated in Google Calendar |
| Complete a task | Event removed from Google Calendar |
| Clear a task's due date | Event removed from Google Calendar |
| "Push to Calendar" button (task detail panel) | Manual push for that task |
| "Sync now" in Settings | Pushes all eligible tasks at once |

**Eligible tasks:** must have a due date, be non-completed, and not be a recurring habit task.

---

## Troubleshooting

**"Google Calendar API has not been used in project … before or it is disabled"**
→ You skipped Step 2. Go to APIs & Services → Library, find Google Calendar API, and click Enable.

**"Access blocked: [App name] has not completed the Google verification process"**
→ You need to add your email as a Test User (Step 3, sub-step 5). The app only needs to be verified if you publish it to other users.

**"Google Calendar is not connected."** when clicking Push to Calendar
→ Complete Step 6 — you need to connect your Google account in Settings.

**Event doesn't appear after "Pushed to Google Calendar."**
→ Check the Google Calendar you're viewing matches the account you authorized. Events go to that account's primary calendar.

**Token expired / stopped syncing after a while**
→ Access tokens are refreshed automatically. If sync stops working, go to Settings → Google Cal → Disconnect, then Connect again.
