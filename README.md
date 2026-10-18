# HelpHub, Multi-Tenant Service Desk

A help desk that many companies can share, where an AI reads each new support ticket and sorts it using that company's own rules, so agents always know what to work on first.

Live site: https://help-hub-xtqe.vercel.app

## Authors

Sharthi Abhinay
sharthiabhinay@gmail.com

Emily Huang

## Class

CS 5610 Web Development, Northeastern University.
Instructor: John Alexis Guerra Gomez.
Course page: https://johnguerra.co/classes/webDevelopment_online_fall_2026/

## Project Objective

Build a service desk that any company can sign up for, keep every company's data completely separate, and use AI to triage tickets by each company's own rules instead of one fixed list.

- **Register organization** creates a company and gives back a one-time share code for its first admin.
- **Create account** is one sign-up page for everyone. The share code decides whether the new account is an admin, an agent or a customer, and which company it joins.
- **Login** takes an organization, email and password. Five wrong passwords in a row lock the account for 30 minutes.
- **Customer dashboard** lets a customer describe a problem in a sentence or two. The AI chooses the category and priority from the company's prompt file, and the ticket goes to the agent with the fewest open tickets. Customers follow their tickets, reply to comments and close a ticket when it is resolved. Once a ticket is completed or closed, it accepts no more comments.
- **Agent dashboard** shows an agent's queue with summary counts, sorting by priority or by date, and a page per ticket for replying, adding internal notes the customer never sees, marking the ticket completed, and escalating it to the admins with a reason and a note. An agent's first reply moves a ticket from Opened to In Progress.
- **Admin dashboard** has five tabs: Dashboard (ticket counts, response and resolution times, tickets by priority, top categories, agent workload and the tickets agents escalated), Analytics (filters by date, priority and category, plus CSV export), API Keys, Team (invites, deactivating and reactivating staff) and Configuration (company name and support email).
- **API keys** let a company's other systems, such as an order system or a website form, open tickets with an `X-API-Key` header.
- **Email** sent to a company's support address becomes a ticket for that company, linked to the customer who sent it.

## Screenshot

![HelpHub admin dashboard](images/screenshot.png)

## Video Demo

A short narrated walkthrough: _add the video link_

## Presentation Slides

Our project presentation: [Google Slides](https://docs.google.com/presentation/d/1iZrqhBoNJAfLOAxgOx_fOEmiZ-YZD_CyT_7NZDAvyTA/edit?usp=sharing)

## Design Document

[design.pdf](design.pdf) covers the project description, user personas, user stories and design mockups.

## Design

**Color:** Bootstrap 5's default palette, with blue (#0d6efd) for primary actions and one color per ticket status on the admin dashboard tiles. The agent and customer pages use soft lavender cards with an orange outline on hover.
**Type:** the system font stack (Segoe UI, Roboto and similar), so every page loads fast and looks native on each device.
**Accessibility:** every action is a real `<button>` or link, every input has a `<label>`, messages use `role="alert"`, and all pages adapt to phone screens.

## How the AI triage works

1. Each company has a prompt file in `server/prompts/`, named after its organization slug (for example `cascade-health-demo.md`). It lists the company's categories and its priority labels, from most to least urgent, in plain language.
2. `npm run prompts` links each file to its company. The company's database record stores only the file name.
3. When a ticket arrives, `server/services/triage.js` sends the description and that company's rules to the Groq API and stores the category and priority the AI chooses.
4. Companies without their own file use `server/prompts/default.md`. If the AI is not configured or fails, the ticket is saved with the category General and the priority Medium, so creating tickets never breaks.

Because the rules live in the prompt file, two companies can triage completely differently. The demo online store uses High, Medium and Low; the demo health insurer uses Urgent Care Access, Time-Sensitive, Standard, Low and General Inquiry.

## How escalation works

1. Only the agent assigned to a ticket can escalate it, once, while it is open. They choose a reason (for example "Needs an admin's approval") and write a note for the admins.
2. The ticket keeps its whole conversation, and the reason and note are added to it as an internal note.
3. The admin dashboard lists every open escalated ticket with who escalated it, the reason and the note. Admins open the ticket to reply, add notes or complete it, and it leaves the list once it is finished.
4. Customers never see an escalation or its note.

## How tickets arrive (three channels)

Tickets come from three places, and all three end up in the same agent queue. Each channel first works out **which company** the ticket belongs to; after that, every ticket goes through the same steps.

```mermaid
flowchart TD
    W["Customer portal<br/>company = the customer's login"] --> O
    A["Another system<br/>POST /api/v1/tickets + X-API-Key<br/>company = the key's company"] --> O
    E["Email to a support address<br/>forwarded to POST /api/v1/email/inbound"] --> R
    R{"Which company?<br/>the 'to' address = its support email"} --> L
    L["Which customer?<br/>the 'from' address, if it matches one"] --> O
    O["Open the ticket<br/>(services/tickets.js)"] --> T
    T["AI triage<br/>category + priority from the company's prompt file"] --> G
    G["Assign<br/>the active agent with the fewest open tickets"] --> Q
    Q["Agent's queue<br/>each ticket shows 'via Web', 'via API' or 'via Email'"]
```

### Email in detail

1. **Which company?** Every company gives a support email when it registers (for example `support@acme.example`), and no two companies can share one. An email is routed to the company whose support email it was sent to.
2. **Which customer?** If the sender's address matches one of that company's customers, the ticket is linked to them and also appears on their dashboard. Otherwise the ticket keeps the sender's address, so the agent knows who wrote.
3. **Into the queue.** The subject and body become the ticket's description, and the ticket gets AI triage and an agent like every other ticket. The agent's ticket page shows "Received via: Email (from ...)".

The endpoint only accepts requests that carry the `INBOUND_EMAIL_SECRET` from `.env` in an `X-Inbound-Secret` header, so only your email service can create email tickets. To connect a real mailbox, use an email service or automation tool that forwards each incoming email to `POST /api/v1/email/inbound` as JSON with the fields `from`, `to`, `subject` and `text`.

To try it without a mailbox, send the endpoint exactly what an email service would (PowerShell, with the server running):

```powershell
$secret = "the INBOUND_EMAIL_SECRET from your .env"
$email = @{
  from    = "Ava Anderson <ava.anderson.1@customer.example>"
  to      = "support@cascadehealth.example"
  subject = "Claim denied"
  text    = "My claim for last month's MRI was denied. Please help."
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/email/inbound `
  -Headers @{ "X-Inbound-Secret" = $secret } -ContentType "application/json" -Body $email
```

The reply names the company and the new ticket, which appears in a Cascade agent's queue marked "via Email" and on Ava Anderson's customer dashboard.

## How a ticket moves

| Status          | Meaning                                   | How it gets there                                                  |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| **Opened**      | New; nobody has answered the customer yet | A customer, another system with an API key, or an email creates it |
| **In Progress** | The agent is working on it                | The agent (or an admin) sends the first reply the customer can see |
| **Completed**   | The agent finished it                     | The agent clicks **Mark this ticket as completed**                 |
| **Closed**      | The customer ended it                     | The customer clicks **Close Ticket** and gives a reason            |

Internal notes and customer comments don't change the status, and priority has no effect on it. Completed and closed tickets accept no more comments. Every dashboard refreshes its numbers when you come back to it, so all pages stay consistent after any change.

## Security

- Every query is filtered by the company taken from the login session or a validated API key, never from the URL or request body, so one company can never see another's data.
- Passwords are hashed with bcrypt, and API keys are stored only as SHA-256 hashes.
- The login cookie is signed, `HttpOnly` and `SameSite=strict`, and it ends when the browser closes.
- Page scripts insert text with `textContent` or escape it first, so ticket text can't run as code.
- No secrets are in the code. They live in `.env`, which Git ignores.

## Database

MongoDB with the native driver (no Mongoose). Each model file in `server/models/` defines its collection's fields; `server/config/db.js` creates the indexes when the server starts.

| Collection     | Holds                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| tenants        | Companies, their support email (incoming email is routed by it) and prompt file name             |
| users          | Admins, agents and customers                                                                     |
| shareCodes     | Single-use invite codes that expire after 24 hours                                               |
| apikeys        | API keys for other systems (create, list, rotate, revoke)                                        |
| tickets        | Support tickets, with status, priority, category, channel (web, API or email) and any escalation |
| ticketComments | Replies and internal notes on tickets                                                            |

## Tech Stack

| Layer      | Technologies                                            |
| ---------- | ------------------------------------------------------- |
| Markup     | HTML5                                                   |
| Styling    | CSS3 (organized by modules), Bootstrap 5.3              |
| Scripting  | Vanilla JavaScript (ES6 modules), client-side rendering |
| Backend    | Node.js, Express, cookie-session, bcryptjs              |
| Database   | MongoDB Atlas with the native MongoDB driver            |
| AI         | Groq API                                                |
| Tooling    | ESLint, Prettier                                        |
| Deployment | Vercel                                                  |

## Project Structure

```
.
├── app.js                         # Entry point for Vercel (exports the Express app)
├── server/
│   ├── index.js                   # Starts the server locally (npm start)
│   ├── app.js                     # The Express app: middleware and routes
│   ├── config/
│   │   ├── db.js                  # MongoDB connection and indexes
│   │   └── session.js             # Login session cookie
│   ├── middleware/
│   │   ├── auth.js                # requireAuth and requireRole
│   │   ├── tenantResolution.js    # The user and company from the session
│   │   └── apiKeyAuth.js          # X-API-Key check for other systems
│   ├── models/                    # One file per collection: fields and queries
│   │   ├── tenant.js              # tenants and shareCodes
│   │   ├── user.js
│   │   ├── apiKey.js
│   │   ├── tickets.js
│   │   └── ticketComments.js
│   ├── routes/
│   │   ├── auth.js                # Register organization, sign up, login, logout
│   │   ├── tenants.js             # Invites, team and organization settings
│   │   ├── admin.js               # Dashboard, analytics and CSV export
│   │   ├── apiKeys.js             # Create, list, rotate and revoke API keys
│   │   ├── email.js               # Tickets that arrive by email
│   │   └── tickets.js             # Tickets, comments and escalation
│   ├── controllers/
│   │   └── analyticsController.js # Dashboard numbers, analytics and CSV
│   ├── services/
│   │   ├── tickets.js             # Opens a ticket the same way for every channel
│   │   ├── triage.js              # AI category and priority (Groq)
│   │   └── prompts.js             # Reads and links company prompt files
│   ├── prompts/                   # Each company's AI rules
│   │   ├── default.md
│   │   ├── acme-demo.md
│   │   └── cascade-health-demo.md
│   ├── scripts/
│   │   ├── seed.js                # npm run seed: demo data
│   │   ├── reset.js               # npm run reset: empties the database, then seeds
│   │   └── load-prompts.js        # npm run prompts: links prompt files
│   └── utils/
│       └── validators.js          # Shared input checks
├── public/
│   ├── pages/                     # One HTML file per page
│   ├── js/
│   │   ├── common/                # api.js and ui.js, shared by every page
│   │   ├── auth/                  # Login, sign-up and register organization
│   │   ├── admin/                 # Admin dashboard
│   │   ├── agent/                 # Agent dashboard and ticket view
│   │   └── customer/              # Customer dashboard and ticket view
│   └── css/
│       ├── base.css               # Shared colors and defaults
│       ├── components/            # Alerts, buttons, cards, forms, lists, navbar, tables, tabs
│       └── pages/                 # One stylesheet per page group
├── eslint.config.js               # Class ESLint config
├── design.pdf                     # Design document: personas, stories, mockups
├── package.json                   # Dependencies and npm scripts
├── package-lock.json              # Exact installed versions
├── LICENSE
└── README.md
```

## Instructions to Build

Requires Node.js 18 or newer and a MongoDB Atlas database.

### 1. Clone the repository

```
git clone https://github.com/SharthiAbhinay/Help_Hub.git
cd Help_Hub
```

### 2. Install the dependencies

```
npm install
```

### 3. Create a `.env` file

Create `.env` in the project folder with these variables. Never commit this file.

```
MONGODB_URI=<your MongoDB Atlas connection string>
SESSION_SECRET=<a long random string>
GROQ_API_KEY=<your Groq API key>
GROQ_MODEL=<a model ID from Groq's Models page, e.g. openai/gpt-oss-20b>
INBOUND_EMAIL_SECRET=<a long random string, shared only with your email service>
```

`GROQ_API_KEY` and `GROQ_MODEL` are optional. Without them, new tickets get the category General and the priority Medium. `INBOUND_EMAIL_SECRET` is optional too: without it, the email endpoint is switched off. Groq retires models from time to time: if the server logs `Groq returned HTTP 404`, the model ID no longer exists, so pick a current one from Groq's Models page and restart the server.

### 4. Load the demo data

```
npm run seed
```

This creates two demo companies, about 1,200 records in total. Each company has an admin, 3 agents, 500 customers and 50 tickets with replies. The tickets are the same on every run, so a live demo can be rehearsed, and new tickets created during a demo go to the agent Ava. Every demo user's password is `Password123`.

| Company                  | Organization          | Admin                         | Agent (example)                    |
| ------------------------ | --------------------- | ----------------------------- | ---------------------------------- |
| Acme Corp (online store) | `acme-demo`           | `admin@acme.example`          | `ava.agent1@acme.example`          |
| Cascade Health Insurance | `cascade-health-demo` | `admin@cascadehealth.example` | `ava.agent1@cascadehealth.example` |

Customers log in as, for example, `ava.anderson.1@customer.example`.

To start over with a completely empty database, run `npm run reset`. It deletes everything in the database (including companies registered through the app), then runs the seed again.

### 5. Start the server

```
npm start
```

Then open http://localhost:3000. For development, `npm run dev` restarts the server whenever a file changes.

### 6. Lint and format (optional)

```
npm run lint
npm run format
```

### 7. Deploy to Vercel (optional)

Import the repository in Vercel, which detects the Express app on its own. Add the same variables (including `INBOUND_EMAIL_SECRET` if you use email tickets) under Settings, Environment Variables. In MongoDB Atlas, under Network Access, allow `0.0.0.0/0`, because Vercel has no fixed IP addresses.

## GenAI Usage

### Sharthi Abhinay

Tool: Claude by Anthropic (claude.ai), model Claude Opus 5.5

Prompts used:

- "Email function endpoint is not created please create it, a code is give for you reference"
- "Check for bugs and ensure the smooth flow and no hiccups, if there are any please make changes."
- "Check the rubric, except for the docs, README file or Google Form."
- "Add a README file similar to this same template."
- "I am getting this error while deploying, Tell me the how to remove it or solve it."

### Emily Huang

Tool: Claude by Anthropic (claude.ai), model Claude Opus 5.5

Prompts used:

- _Emily, add your prompts here_

## Sources and References

- Express documentation: https://expressjs.com
- MongoDB Node.js driver documentation: https://www.mongodb.com/docs/drivers/node/current/
- Bootstrap 5 documentation: https://getbootstrap.com/docs/5.3/
- MDN Web Docs: https://developer.mozilla.org
- Groq API documentation: https://console.groq.com/docs
- Express on Vercel: https://vercel.com/docs/frameworks/backend/express

## License

MIT License. See the LICENSE file for details.
