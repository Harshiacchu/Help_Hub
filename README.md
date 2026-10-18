# HelpHub, Multi-Tenant Service Desk

A help desk that many companies can share, where an AI reads each new support ticket and sorts it by that company's own rules, so agents always know what to work on first.

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

Build a service desk that any company can sign up for, keep every company's data separate, and use AI to triage tickets by each company's own rules instead of one fixed list.

- **Sign up and login:** a company registers and gets a one-time share code for its first admin. Everyone else joins with a share code that sets their role (admin, agent or customer) and their company. Five wrong passwords lock an account for 30 minutes.
- **Customer portal:** customers describe a problem in a sentence or two, follow their tickets, reply to agents and close a ticket when it is solved.
- **Agent dashboard:** agents work a queue sorted by priority or date, reply to customers, add internal notes, escalate tickets to the admins and mark them completed.
- **Admin dashboard:** ticket counts, response and resolution times, escalated tickets and agent workload, plus analytics with filters and CSV export, API keys, team invites and company settings.
- **Three ways in:** tickets come from the customer portal, from other systems with an API key, and from email sent to the company's support address.

## Screenshot

![Scrolling demo of the HelpHub admin dashboard](images/helphub-dashboard.svg)

Scrolling demo of the admin dashboard

## Video Demo

A short narrated walkthrough: _add the video link_

## Presentation Slides

Our project presentation: [view on Google Slides](https://docs.google.com/presentation/d/1iZrqhBoNJAfLOAxgOx_fOEmiZ-YZD_CyT_7NZDAvyTA/edit?usp=sharing)

## Design Document

[design.pdf](design.pdf) covers the project description, user personas, user stories and design mockups.

## Design

**Color:** Bootstrap's default palette, with blue (#0d6efd) for primary actions and one color per ticket status on the admin dashboard. The agent and customer pages use soft lavender cards.
**Type:** the system font stack (Segoe UI, Roboto and similar), so pages load fast and look native on each device.
**Accessibility:** every action is a real button or link, every input has a label, and messages use `role="alert"`.

## Tech Stack

| Layer      | Technologies                                            |
| ---------- | ------------------------------------------------------- |
| Markup     | HTML5                                                   |
| Styling    | CSS3 (organized by modules), Bootstrap 5.3.8            |
| Scripting  | Vanilla JavaScript (ES6 modules), client-side rendering |
| Backend    | Node.js, Express, cookie-session, bcryptjs              |
| Database   | MongoDB Atlas with the native driver (no Mongoose)      |
| AI         | Groq API                                                |
| Tooling    | ESLint, Prettier                                        |
| Deployment | Vercel                                                  |

## Project Structure

```
.
├── app.js                     # Entry point for Vercel
├── server/
│   ├── index.js               # Starts the server locally
│   ├── app.js                 # Express app: middleware and routes
│   ├── config/                # MongoDB connection, indexes and login cookie
│   ├── middleware/            # Login, role, company and API key checks
│   ├── models/                # Collections: tenants, shareCodes, users, apikeys, tickets, ticketComments
│   ├── routes/                # Auth, team, admin, API keys, tickets and email
│   ├── controllers/           # Dashboard numbers, analytics and CSV
│   ├── services/              # Opening tickets, AI triage and prompt files
│   ├── prompts/               # Each company's AI rules
│   ├── scripts/               # npm run seed, reset and prompts
│   └── utils/                 # Shared input checks
├── public/
│   ├── pages/                 # One HTML file per page
│   ├── js/                    # One ES module per page, plus shared helpers
│   └── css/                   # Base styles, components and page styles
├── images/
│   └── helphub-dashboard.svg  # Scrolling demo shown in this README
├── design.pdf                 # Personas, user stories and mockups
├── eslint.config.js           # Class ESLint config
├── package.json               # Dependencies and npm scripts
├── package-lock.json          # Exact installed versions
├── LICENSE
└── README.md
```

## How a ticket is handled

1. **It arrives.** A customer submits it on the portal, another system sends it with an API key, or an email reaches the company's support address. The login, the key or the support address tells HelpHub which company it belongs to.
2. **The AI sorts it.** The ticket and the company's prompt file (`server/prompts/<company>.md`) go to the Groq API, which picks a category and priority from that company's own labels. If the AI is unavailable, the ticket gets General and Medium.
3. **It is assigned** to the active agent with the fewest open tickets.
4. **It is worked.** The ticket stays Opened until the agent's first reply to the customer, then moves to In Progress. The agent can escalate it to the admins with a reason and a note.
5. **It is finished.** The agent marks it Completed or the customer closes it, and it accepts no more comments.

Every query is filtered by the company from the login session or API key, so companies never see each other's data.

## Instructions to Build

Requires Node.js 18 or newer and a MongoDB Atlas database.

### 1. Clone and install

```
git clone https://github.com/SharthiAbhinay/Help_Hub.git
cd Help_Hub
npm install
```

### 2. Create a `.env` file

```
MONGODB_URI=<your MongoDB Atlas connection string>
SESSION_SECRET=<a long random string>
GROQ_API_KEY=<your Groq API key>
GROQ_MODEL=<a Groq model ID, e.g. openai/gpt-oss-20b>
INBOUND_EMAIL_SECRET=<a long random string for the email endpoint>
```

The last three are optional. Without Groq, new tickets get the category General and the priority Medium; without the email secret, the email endpoint is off.

### 3. Load the demo data

```
npm run seed
```

This creates two demo companies, each with an admin, 3 agents, 500 customers and 50 tickets (about 1,200 records). Every demo password is `Password123`.

| Organization          | Admin                         | Agent                              | Customer                          |
| --------------------- | ----------------------------- | ---------------------------------- | --------------------------------- |
| `acme-demo`           | `admin@acme.example`          | `ava.agent1@acme.example`          | `ava.anderson.1@customer.example` |
| `cascade-health-demo` | `admin@cascadehealth.example` | `ava.agent1@cascadehealth.example` | `ava.anderson.1@customer.example` |

`npm run reset` empties the database and seeds it again.

### 4. Start the server

```
npm start
```

Then open http://localhost:3000.

### 5. Lint and format (optional)

```
npm run lint
npm run format
```

## GenAI Usage

### Sharthi Abhinay

Tool: Claude by Anthropic (claude.ai), model Claude Opus 5.5

Prompts used:

- "Check the code for any bugs, ensure smooth flow in every option, remove unnecessary code, and check the database schemas."
- "Check the rubric, except for the docs, README file, or Google Form."
- "Check and ensure that after any operation, such as Mark as completed, the Opened, In Progress, and other data stay consistent and render on the page."
- "Above is the error I am getting during deployment on Vercel; please say what changes are required to solve it"
- "Create some demo data for a healthcare company"
- "Use the same template as my Project 1 README, remove unnecessary text and sections, and put the SVG in the Screenshot section."

### Emily Huang

Tool: _Emily, add the AI tool you used (or "None")_

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
