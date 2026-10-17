
const createTicketBtn = document.querySelector("#new-ticket-btn");
const inProgressBox = document.querySelector("#in-progress-box");
const completedBox = document.querySelector("#completed-box");


createTicketBtn.addEventListener("click", ()=> createTicket());

function createTicket() {
    console.log("Creating new ticket");
    const newTicket = document.createElement("div");
    newTicket.className = "ticket";
    newTicket.textContent  = "Ticket 3";
    inProgressBox.appendChild(newTicket);

}