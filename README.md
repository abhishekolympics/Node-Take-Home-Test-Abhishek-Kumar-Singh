# TCP Client-Server Application

This repository contains a TCP client-server application that demonstrates communication between a client and a server using Node.js.

## Getting Started

Follow the instructions below to set up and run the application on your local machine.

### Prerequisites

- Node.js version 16.17.0 or higher is installed on your machine. You can download it from [Node.js Official Website](https://nodejs.org/).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/abhishekolympics/Node-Take-Home-Test-Abhishek-Kumar-Singh.git
   ```
2. Navigate to the project directory:
   ```bash
   cd betacrew_exchange_server
   ```

### Running the Application

1. Open a terminal to start the server:
   ```bash
   node main.js
   ```
   The terminal will show a message indicating that the server is running on port 3000.

   **Server's Terminal Message:**
   ```bash
   TCP server started on port 3000.
   ```

2. Open a new terminal to start the client:
   ```bash
   node client.js
   ```
   The terminal will show a message indicating that sequences are received and stored in output.json file.



The server will listen on port 3000 by default. The client will connect to the server and send a message. The server will receive the message and send a response back to the client.
