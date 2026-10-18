//Comments made on a ticket by customer, agent, or superior
//Queries are filtered by tenantId
//Internal comments are for agents and superiors to read only 

import { mustObjectId } from "../config/db.js";
import { ROLES, ValidationError, cleanText } from "../utils/validators.js";

class TicketCommentModel {
    constructor(db) {
        this.collection = db.collection("ticketComments");
    }
    
    static newDocument({
        tenantId,
        ticketId,
        authorId,
        authorRole,
        body,
        isInternal = false,
        createdAt = new Date(),
    }) {
        if(!ROLES.includes(authorRole)) throw new ValidationError("Invalid role");
        if (isInternal && authorRole === "customer") {
            throw new ValidationError("Customers cannot post internal notes");
    } 
    return {
      tenantId: mustObjectId(tenantId, "tenant id"),
      ticketId,
      authorId: mustObjectId(authorId, "author id"),
      authorRole,
      body: cleanText(body, "Comment", { min: 1, max: 2000 }),
      isInternal,
      createdAt,
    };
}

//Saves one comment
async createComment(fields) {
    const comment = TicketCommentModel.newDocument(fields);
    const result = await this.collection.insertOne(comment);
    return { ...comment, _id: result.insertedId };
  }

//Gets all comments on a ticket, oldest first
  async findByTicket(tenantId, ticketId, { includeInternal = false } = {}) {
    const filter = {
      tenantId: mustObjectId(tenantId, "tenant id"),
      ticketId: Number(ticketId),
    };
    if (!includeInternal) filter.isInternal = false;
    return this.collection.find(filter).sort({ createdAt: 1 }).toArray();
  }


//Inserts many comments from seed
  async insertMany(comments) {
    if (comments.length === 0) return 0;
    const result = await this.collection.insertMany(comments, { ordered: false });
    return result.insertedCount;
  }
}

export default TicketCommentModel;