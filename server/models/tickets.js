//Tickets hold information about the tickets created by customers.
//Each ticket is ascociated with a customer, an agent, and a tenant. The ticket has a status  (opened, in-progress, completed, waiting for customer input, and closed)
//Timestamps are recored for when the ticketed is opened and closed.
//Each ticket has a priority (low, medium, high), a description, and a category (assigned by the company)

// Fields used, from the agreed schema:
// ticket
//   ticket comments: tenantId, ticketId, authorId, isInternal, createdAt
// Response time = first public comment by someone other than the customer.
// All dates are grouped in UTC.

/*
customerId
phoneNumber
email
fName
lName
ticketId
agentId
tenantId
status
openedAt
closedAt
priority
description
category
*/