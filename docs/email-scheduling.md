> Current demo workflow: [Settings → Demo Console](demo-console.md). The three-person live Gmail scenario and age-group policy in that guide supersede historical demo, seeded-reset, and sample-sign-in instructions below.

# Email scheduling setup and demo

MEGA recognizes scheduling emails, adds clear confirmed commitments to the owner's private MEGA calendar when enabled, and checks proposed times against permitted family availability. Selecting a time creates a tentative event on the owner's Google Calendar. A separate reviewed action saves a Gmail reply draft; MEGA does not send it.

The app and backend implementation are ready for Google configuration. Live delivery latency and real account writes must be verified after setup. The automated scenario uses test adapters, not real mailboxes.

## Google project

Use **birving@megacodersllc.com**, project **MEGA**, ID **mega-512814**, project number **20565704145**. These were verified in the Google Cloud console on October 31, 2026. The existing clients are **MEGA web** and **MEGA iOS**. Do not create replacement OAuth clients or change accounts.

Open [MEGA in Google Cloud](https://console.cloud.google.com/home/dashboard?project=mega-512814&authuser=1). The `authuser` index can change; confirm the account email in the top-right menu.

## 1 Enable the APIs

In **APIs & Services → Library**, enable **Gmail API**, **Google Calendar API**, and **Cloud Pub/Sub API** in this project. Leave already enabled APIs alone. If Google requires billing activation, the account owner should complete that step.

## 2 Create the topic

In **Pub/Sub → Topics**, choose **Create topic**.

- Topic ID: `mega-gmail`
- Full name: `projects/mega-512814/topics/mega-gmail`
- Uncheck **Add a default subscription**; the authenticated push subscription is created separately below.
- Create the topic, then open its **Permissions** panel and choose **Grant access**.
- Principal: `gmail-api-push@system.gserviceaccount.com`
- Role: **Pub/Sub Publisher** (`roles/pubsub.publisher`), scoped to this topic.

Gmail needs this topic permission to publish mailbox changes. If the organization rejects the Google service account due to domain restrictions, have the organization administrator approve a narrow exception for that principal. [Google's Gmail push setup](https://developers.google.com/workspace/gmail/api/guides/push).

## 3 Create the delivery identity

In **IAM & Admin → Service Accounts → Create service account**:

- Name and ID: `mega-gmail-push`
- Resulting email: `mega-gmail-push@mega-512814.iam.gserviceaccount.com`
- Do not assign project-wide roles or create/download a private key.

On this service account's **Principals with access** tab, grant **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`) to the Pub/Sub service agent:

`service-20565704145@gcp-sa-pubsub.iam.gserviceaccount.com`

Scope this grant to the `mega-gmail-push` service account. The identity only signs delivery tokens; it does not get Gmail or calendar access. The person creating the subscription also needs `iam.serviceAccounts.actAs` on this identity, commonly through **Service Account User**. The project owner may already have that permission. [Google's authenticated push instructions](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).

## 4 Create the push subscription

In **Pub/Sub → Subscriptions → Create subscription**, enter:

| Field | Value |
| --- | --- |
| Subscription ID | `mega-gmail-push` |
| Topic | `projects/mega-512814/topics/mega-gmail` |
| Delivery type | Push |
| Endpoint URL | `https://colorless-ibis-289.convex.site/google/gmail/push` |
| Enable authentication | Checked |
| Service account | `mega-gmail-push@mega-512814.iam.gserviceaccount.com` |
| Audience | `https://colorless-ibis-289.convex.site/google/gmail/push` |
| Payload unwrapping | Disabled; keep the normal Pub/Sub envelope |

Leave message ordering and exactly-once delivery off. Create the subscription. MEGA validates Google's signature, issuer, audience, and service-account email before accepting a delivery; an unauthenticated request returning 401 is expected.

## 5 Configure the development backend

In the Convex dashboard for **colorless-ibis-289**, open **Settings → Environment Variables**. Add these three values to this development deployment:

```text
GOOGLE_GMAIL_PUBSUB_TOPIC=projects/mega-512814/topics/mega-gmail
GOOGLE_GMAIL_PUSH_AUDIENCE=https://colorless-ibis-289.convex.site/google/gmail/push
GOOGLE_GMAIL_PUSH_SERVICE_ACCOUNT=mega-gmail-push@mega-512814.iam.gserviceaccount.com
```

The variables also exist in `scripts/env.manifest.json` for the repository's existing `.env.secrets` workflow. Do not put client secrets or encryption keys in public Expo variables, screenshots, or chat. Keep the existing Google credentials and `INTEGRATION_TOKEN_KEY`; replacing the encryption key would make existing saved grants unreadable.

For web OAuth, the existing **MEGA web** client must include this authorized redirect URI:

`https://colorless-ibis-289.convex.site/google/oauth/callback`

The backend's `SITE_URL` must point to the web app address being used. For this local web session, that is `http://localhost:8082`; a phone's browser cannot use the computer's localhost. Native account linking uses the existing iOS client. Preserve any other redirect URIs used by sign-in.

## 6 Enable optional write scopes and reconnect

In **Google Auth Platform → Data Access**, add these to the existing read-only integration scopes:

- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/gmail.compose`

Keep `gmail.readonly`, `calendar.readonly`, `openid`, and `email`. The compose permission is broader than saving drafts at Google's level; MEGA's implementation uses only draft creation, never the send endpoint.

If the OAuth app is External and in Testing, list each demo Google account under **Audience → Test users**. Testing grants can expire after seven days. Each participant authorizes their own Gmail/Calendar connection; being the family admin does not connect another person's inbox.

In MEGA, open **Settings → Connected accounts → Email & scheduling**:

1. Turn on **Recognize plans in my email**.
2. Enable **Add confirmed events automatically** if desired.
3. Use **Enable Google holds & reply drafts** and approve the selected Google account and requested scopes.
4. Choose which adults may check your availability. Brandon must allow Lovie for Lovie's MEGA to check Brandon's schedule. The grant reveals availability, not event titles or email contents.
5. Repeat with the other member's own profile and Google account.

After cloud configuration, turn recognition off and on once if it was already enabled. This requests a mailbox watch immediately instead of waiting for the renewal job. **Gmail push detection is active** appears after a watch is registered and a verified notification has reached the backend. Otherwise the screen says periodic checks; the fallback interval is ten minutes.

## 7 Run the two-person demo

Use a future date inside the next 60 days and explicit start/end times and timezone. Ensure the family's clock is set to real time for real inbox testing. If `MEGA_GMAIL_SUBJECT_PREFIX` is configured, include that prefix in both subjects.

1. Send a test email to Brandon's connected inbox: “Confirmed: business meeting on November 3, 2026, 12:00–1:00 PM America/New_York.” Adjust the date if testing later. Open Brandon's chat: the private plan should appear once, and the calendar addition should offer Undo.
2. Send a separate test email to Lovie's connected inbox: “Lovie and Brandon, would lunch on November 3, 2026 work at 12:00–1:00 PM or 1:30–2:30 PM America/New_York? Please choose a time.” Use the members' exact names as stored in MEGA.
3. In Lovie's chat or Today, noon should be unavailable and 1:30 should be available if both calendars are clear. Brandon's meeting title and email must not appear in Lovie's view.
4. Select 1:30, review, and choose **Hold this time**. Confirm a single private tentative event on Lovie's primary Google Calendar. Brandon should receive no calendar invitation.
5. Choose **Save reply draft in Gmail**, review the preview, and save. Open Gmail to inspect the draft. It should remain unsent.
6. Reply to that same lunch email thread with a clear confirmation at 1:30–2:30. The same plan and Google hold should become confirmed. A cancellation in that thread should cancel the owned event. A change to another time asks for review before updating Google Calendar.
7. Repeat the hold/draft button presses and refresh. There must be no duplicate event or draft. Revoke Brandon's availability permission and confirm Lovie sees availability as not checked.

Measure actual email arrival to card appearance. Gmail push is usually fast but can be delayed or dropped; the recovery poll remains enabled. No fixed live latency has been established for this deployment yet. [Gmail delivery limitations](https://developers.google.com/workspace/gmail/api/guides/push#limitations).

## Supported behavior and limits

- One evolving event per email thread. Multiple events, unclear dates, unknown family participants, and unclear confirmations stay in review.
- Missing duration is shown as an estimate; a confirmed event with an assumed duration is not automatically added.
- Automatic capture creates a private MEGA event. Only an explicitly approved hold writes to Google Calendar. Reply drafts are a separate explicit action.
- Google availability uses the primary calendar and a complete refreshed 60-day import. Missing, stale, failed, or truncated data is not treated as free time. Other family members must explicitly allow checking.
- Matching an already imported event uses exact normalized title and timing; semantically similar but differently titled events may still require manual review.
- The app updates through its existing live data subscriptions. Each new plan revision queues an operating-system push through the existing notification system, subject to quiet hours and caps, pointing to the existing chat card. See [family coordination](family-coordination.md).
- Gmail/Calendar processing runs on the backend, including when the app is closed. A phone need not poll continuously or run background animation loops.
- Duplicate mailbox notifications coalesce. Duplicate source messages do not duplicate plans. Stable Google event IDs make hold retries safe. An uncertain draft save is not automatically retried; inspect Gmail first.
- These instructions target the development deployment. A production deployment needs its own endpoint, audience, subscription, and environment configuration.

## Unified Google setup

Chat’s Gmail/Google Calendar connection cards, reconnect cards, and Connected accounts all open the same Email & scheduling setup. It reviews recognition, optional automatic capture, calendar holds/reply drafts, and family availability sharing before one Google authorization flow. Both read services are requested together; write scopes are requested only when the displayed holds/drafts option is selected. A fully authorized connection saves preference changes without opening Google again. Partial consent remains partial and is shown per capability; ungranted services must not retain a stale Connected status.

Private, Family coordination, and Choose people are saved availability policies, separate from OAuth. Family coordination can be selected even when alone and includes current and future adults and parent-approved teens in the same family. Membership and eligibility are checked whenever availability is accessed. Email bodies and event details remain private. Choose people stays limited to explicit selections; existing lists are not silently upgraded to Family. Preferences are saved before the web redirect, so cancelling Google grants no new provider access but retains the reviewed settings.

Teens without approval can open setup and choose Ask my parent. Their parents receive a deduplicated approve/deny choice in their MEGA chat. Approval only permits the teen to complete their own Google consent; it does not connect Google, enable recognition, or share anything. Under-13 connections remain blocked. Push delivery of these requests belongs to the notification workstream; the request is available in chat now.

## Location clues

The synthetic emails include Orlando, Florida context. Only explicit recipient home/base statements qualify for a private location confirmation question; event venues alone do not. The structured email extractor must provide a verbatim supporting excerpt. Nothing is written to memory until the recipient selects Yes, remember privately. Rejection/skip writes no memory; repeated messages do not repeatedly ask the same person. This is city/region context, not a home-address lookup, and it does not change family location or timezone.

## Pending UAT follow-up

- **2026-10-31 — Google setup usability:** The owner finds the “Let MEGA help with your week” screen insufficiently user-friendly. Revisit its wording, choice hierarchy, and explanation of permissions/sharing so a nontechnical family member can confidently complete setup. Keep the unified Google authorization flow. This is a recorded follow-up, not an implemented redesign; defer changes while the owner continues testing the first task.

### Connection awareness in chat

Every agent turn includes the current owner’s Gmail/Calendar status, last sync/failure, recognition and automatic-capture settings. It excludes credentials and other members’ connection data. Connected accounts do not require repeat consent. `google_setup` avoids another setup card when both products are connected; `google_check` requests the existing owner-only sync flow and reports queued/recent status honestly. New findings arrive through normal processing; a queued check must never be described as an empty inbox or a completed scan. Existing sharing and capture consent is preserved.

Explicit chat checks now show a status message that updates on completion: new findings, no new items, incomplete processing, connection failure, or timeout. Repeated completion callbacks are idempotent. Routine background syncs do not produce these status messages.
