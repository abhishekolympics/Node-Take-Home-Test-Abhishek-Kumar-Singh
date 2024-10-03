const net = require("net"); // Import the net module for TCP networking
const fs = require("fs");   // Import the fs module for file system operations

const SERVER_HOST = "localhost"; // Define server host
const SERVER_PORT = 3000;         // Define server port

// Initialize variables to manage packet information
let packets = [];                 // Array to store received packets
let missedSequences = new Set();  // Set to track missed sequences
let firstSequence = Infinity;     // Variable to track the first received sequence
let lastSequence = 0;             // Variable to track the last received sequence
let receivedSequences = new Set(); // Set to store all received sequences
let maxSequenceExpected = 14;     // Assume 14 is the total number of sequences expected

// Function to create a payload to send to the server
function createPayload(callType, resendSeq = 0) {
  const buffer = Buffer.alloc(2); // Allocate a buffer of 2 bytes
  buffer.writeUInt8(callType, 0);  // Write the call type to the buffer
  buffer.writeUInt8(resendSeq, 1);  // Write the sequence number to the buffer
  return buffer;                    // Return the created buffer
}

// Function to parse received packet data
function parsePacket(data) {
  const symbol = data.slice(0, 4).toString("ascii");    // Extract the symbol from the data
  const buySellIndicator = data.slice(4, 5).toString("ascii"); // Extract buy/sell indicator
  const quantity = data.readInt32BE(5);                   // Extract quantity (big-endian format)
  const price = data.readInt32BE(9);                      // Extract price (big-endian format)
  const sequence = data.readInt32BE(13);                  // Extract sequence number (big-endian format)

  return { symbol, buySellIndicator, quantity, price, sequence }; // Return an object with the extracted data
}

// Function to request all packets from the server
function requestAllPackets() {
  return new Promise((resolve, reject) => {
    const client = new net.Socket(); // Create a new TCP socket

    // Connect to the server
    client.connect(SERVER_PORT, SERVER_HOST, () => {
      console.log("Connected to server");
      client.write(createPayload(1)); // Send request for all packets
    });

    // Handle incoming data
    client.on("data", (data) => {
      for (let i = 0; i < data.length; i += 17) { // Iterate over received data in chunks of 17 bytes
        const packet = parsePacket(data.slice(i, i + 17)); // Parse each packet
        packets.push(packet); // Store packet in packets array
        receivedSequences.add(packet.sequence); // Add sequence number to the set

        console.log(`Received sequence: ${packet.sequence}`); // Log received sequence

        // Update the first and last received sequences
        firstSequence = Math.min(firstSequence, packet.sequence);
        lastSequence = Math.max(lastSequence, packet.sequence);
      }
    });

    // Handle socket closure
    client.on("close", () => {
      console.log("Connection closed");
      console.log(
        `Received sequences: ${[...receivedSequences]
          .sort((a, b) => a - b)
          .join(", ")}`
      ); // Log all received sequences
      console.log(`Total unique sequences received: ${receivedSequences.size}`); // Log count of unique sequences
      resolve(); // Resolve the promise
    });

    // Handle errors
    client.on("error", (err) => {
      console.error("Error:", err);
      reject(err); // Reject the promise in case of error
    });
  });
}

// Function to request a specific packet from the server
function requestPacket(sequence) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket(); // Create a new TCP socket
    let timeout; // Variable to hold the timeout ID

    // Connect to the server
    client.connect(SERVER_PORT, SERVER_HOST, () => {
      console.log(`Requesting packet with sequence ${sequence}`);
      client.write(createPayload(2, sequence)); // Send request for the specific packet
    });

    // Handle incoming data
    client.on("data", (data) => {
      clearTimeout(timeout); // Clear timeout if data is received
      const packet = parsePacket(data); // Parse the received packet
      packets.push(packet); // Store packet in packets array
      receivedSequences.add(packet.sequence); // Add sequence number to the set
      firstSequence = Math.min(firstSequence, packet.sequence); // Update first sequence
      lastSequence = Math.max(lastSequence, packet.sequence); // Update last sequence
      console.log(`Received missing sequence: ${packet.sequence}`); // Log received sequence
      client.destroy(); // Close the socket
      resolve(); // Resolve the promise
    });

    // Handle errors
    client.on("error", (err) => {
      clearTimeout(timeout); // Clear timeout if an error occurs
      console.error("Error:", err);
      reject(err); // Reject the promise in case of error
    });

    // Set a timeout for the request
    timeout = setTimeout(() => {
      console.error(`Request for sequence ${sequence} timed out`);
      client.destroy(); // Close the socket on timeout
      reject(new Error(`Request for sequence ${sequence} timed out`)); // Reject the promise
    }, 2000); // 2 seconds timeout
  });
}

// Function to identify missed sequences
function identifyMissedSequences() {
  missedSequences.clear(); // Clear previously missed sequences
  for (let i = firstSequence; i <= lastSequence; i++) {
    if (!receivedSequences.has(i)) {
      missedSequences.add(i); // Add missed sequence to the set
    }
  }
}

// Function to request next sequences after the last known sequence
async function requestNextSequences() {
  let nextSequence = lastSequence + 1; // Start from the last known sequence
  let foundNextSequence = true; // Flag to track if the next sequence was found

  while (foundNextSequence && nextSequence <= 14) { // Loop until no more sequences are found
    try {
      foundNextSequence = await requestPacket(nextSequence); // Request the next sequence
      if (foundNextSequence) {
        nextSequence++; // Increment to check the next sequence if found
      }
    } catch (error) {
      console.log(`sequence ${nextSequence} is not found.`); // Log if sequence is not found
      foundNextSequence = false; // Stop if there is an error
    }
  }

  console.log("No more sequences found."); // Log when no more sequences are found
}

// Function to request previous sequences before the first known sequence
async function requestPreviousSequences() {
  let previousSequence = firstSequence - 1; // Start from the first known sequence - 1
  let foundPreviousSequence = true; // Flag to track if the previous sequence was found

  while (foundPreviousSequence && previousSequence >= 1) { // Loop until no more previous sequences are found
    try {
      foundPreviousSequence = await requestPacket(previousSequence); // Request the previous sequence
      if (foundPreviousSequence) {
        console.log(`Successfully retrieved previous sequence: ${previousSequence}`); // Log successful retrieval
        previousSequence--; // Decrement to check the previous one
      }
    } catch (error) {
      console.log(`sequence ${previousSequence} is not found.`); // Log if sequence is not found
      foundPreviousSequence = false; // Stop if there is an error
    }
  }

  console.log("No more previous sequences found."); // Log when no more previous sequences are found
}

// Main function to run the client
async function runClient() {
  try {
    await requestAllPackets(); // Request all packets from the server

    identifyMissedSequences(); // Identify any missed sequences
    console.log(
      `Potentially missed sequences: ${[...missedSequences].join(", ")}` // Log potentially missed sequences
    );

    let attempts = 0; // Counter for attempts to retrieve missing sequences
    const maxAttempts = 5; // Maximum number of attempts to retrieve missing sequences

    // Loop until all expected sequences are received or max attempts are reached
    while (
      receivedSequences.size < maxSequenceExpected &&
      attempts < maxAttempts
    ) {
      for (const seq of missedSequences) {
        try {
          await requestPacket(seq); // Request each missed sequence
        } catch (error) {
          console.error(`Failed to retrieve sequence ${seq}:`, error); // Log failure to retrieve sequence
        }
      }
      identifyMissedSequences(); // Identify missed sequences after each attempt
      attempts++; // Increment attempts counter
      console.log(
        `Attempt ${attempts}: Missing sequences: ${[...missedSequences].join(", ")}` // Log missing sequences after each attempt
      );
    }

    // Check for additional sequences after the known last one
    while (firstSequence != 1) await requestPreviousSequences(); // Request previous sequences if the first sequence is not 1
    while (lastSequence != 14) await requestNextSequences(); // Request next sequences if the last known sequence is not 14

    packets.sort((a, b) => a.sequence - b.sequence); // Sort packets by sequence number

    console.log("\nFinal sequence check:");
    packets.forEach((packet) => console.log(`Sequence: ${packet.sequence}`)); // Log final sequence check
    console.log(`\nTotal sequences received: ${packets.length}`); // Log total received sequences

    // Save packets to a file
    const filePath = "output.json"; // Define the file path to save packets
    fs.writeFileSync(filePath, JSON.stringify(packets, null, 2)); // Write packets to file in JSON format
    console.log(`Packets saved to ${filePath}`); // Log file save confirmation
  } catch (error) {
    console.error("Error running client:", error); // Log any errors during client execution
  }
}

// Start the client
runClient();
