// /Users/aaronobeng/Web Project/Connect Four/client.js

// --- Global Variables ---
let localPlayerId = null; // Stores the ID assigned to this client by the server (e.g., "Player1" or "Player2")
let currentBoard = [];    // Holds the local representation of the game board, updated from server messages

// --- WebSocket Connection ---
// Establishes a WebSocket connection to the server.
// IMPORTANT: Ensure "ws://192.168.5.101:8080" is the correct IP address and port of your server.
// If the server is running on the same machine as the client, "ws://localhost:8080" can be used.
const socket = new WebSocket("ws://192.168.5.101:8080"); // Adjust IP/port as needed

// --- DOM Element References ---
// Gets references to HTML elements to interact with them (display messages, render board, etc.)
const gameBoard = document.getElementById("game-board");       // The main container for the game cells
const statusDiv = document.getElementById("status");           // Displays game status messages (e.g., "Your turn", "Waiting for opponent")
const winMessageDiv = document.getElementById("win-message");  // Displays the win/draw message at the end of the game
const winnerName = document.getElementById("winner-name");     // A span within winMessageDiv to show the winner's ID
const resetButton = document.getElementById("reset-button");   // The "Play Again?" button

// Chat DOM Elements - Get references to chat-related HTML elements
const chatBox = document.getElementById("chat-box");           // The div where chat messages are displayed
const chatInput = document.getElementById("chat-input");       // The input field for typing messages
const sendChatButton = document.getElementById("send-chat");   // The button to send chat messages

// --- Utility Functions ---

/**
 * Creates an empty 6x7 game board array, initialized with null values.
 * @returns {Array<Array<null>>} A 2D array representing the empty board.
 */
function createEmptyBoard() {
  return Array(6).fill(null).map(() => Array(7).fill(null)); // 6 rows, 7 columns
}

/**
 * Renders the game board in the HTML based on the provided board state.
 * @param {Array<Array<string|null>>} board - The 2D array representing the game board state.
 */
function renderBoard(board) {
  gameBoard.innerHTML = ""; // Clear the previous board content
  currentBoard = board;     // Update the local copy of the board

  // Iterate over each row and column to create and style cells
  board.forEach((row, rowIndex) => {
    row.forEach((player, colIndex) => {
      const cell = document.createElement("div"); // Create a new div for each cell
      cell.className = "cell";                    // Assign a class for styling
      cell.dataset.column = colIndex;             // Store the column index as a data attribute for click handling
      cell.dataset.player = player || "";         // Store the player occupying the cell (or empty string if null)

      // Set the background color of the cell based on the player
      if (player !== null) {
        cell.style.backgroundColor =
          player === "Player1" ? "#e63946" : "#2a9d8f"; // Red for Player1, Teal for Player2
      }
      gameBoard.appendChild(cell); // Add the newly created cell to the game board element
    });
  });
}

// --- WebSocket Event Handlers ---

/**
 * Handles messages received from the WebSocket server.
 * This is the primary way the client receives game state updates and chat messages.
 * @param {MessageEvent} event - The event object containing the server's message.
 */
socket.onmessage = (event) => {
  const data = JSON.parse(event.data); // Parse the JSON message from the server

  // Handle different message types from the server
  if (data.type === "player-assignment") {
    // Received when the player is first assigned an ID by the server
    localPlayerId = data.playerId;
    console.log("Assigned Player ID:", localPlayerId);
    renderBoard(data.board); // Render the initial board state
    updateStatus(data.currentPlayer, data.status); // Update the status message
    toggleBoardInteractivity(data.currentPlayer, data.status); // Enable/disable board based on turn
  } else if (data.type === "game-state" || data.type === "update") {
    // Received for general game state updates (e.g., after a move, or when a player joins)
    renderBoard(data.board);
    updateStatus(data.currentPlayer, data.status);
    toggleBoardInteractivity(data.currentPlayer, data.status);
  } else if (data.type === "game-over") {
    // Received when the game ends (win, draw, or abandoned)
    renderBoard(data.board);
    showWinMessage(data.winner, data.status); // Display the win/draw/abandoned message
    toggleBoardInteractivity(null, data.status); // Disable the board as the game is over
  } else if (data.type === "game-full") {
    // Received if a player tries to join when the game is already full
    statusDiv.textContent = "Game is full. Please try again later.";
    winMessageDiv.classList.add("hidden");    // Hide win message
    resetButton.classList.add("hidden");      // Ensure reset button is hidden
    statusDiv.classList.remove("hidden");     // Show status message
    gameBoard.style.pointerEvents = "none";   // Disable board interaction
  } else if (data.type === "error") {
    // Received if the server sends an error message (e.g., invalid move)
    console.error("Server error:", data.message);
    statusDiv.textContent = `Error: ${data.message}`;
    statusDiv.classList.remove("hidden");
  } else if (data.type === "chat-message") { // Handle incoming chat messages
    displayChatMessage(data.sender, data.text); // Display the received chat message
  }
};

/**
 * Handles WebSocket connection errors.
 * @param {Event} error - The error event.
 */
socket.onerror = (error) => {
  console.error("WebSocket Error:", error);
  statusDiv.textContent = "Connection error. Please ensure the server is running and refresh.";
  statusDiv.classList.remove("hidden");
  winMessageDiv.classList.add("hidden");
  resetButton.classList.add("hidden");
  gameBoard.style.pointerEvents = "none"; // Disable board interaction on connection error
};

/**
 * Handles WebSocket connection closure.
 */
socket.onclose = () => {
  console.log("WebSocket connection closed.");
  statusDiv.textContent = "Disconnected from server. Please refresh to reconnect.";
  statusDiv.classList.remove("hidden");
  winMessageDiv.classList.add("hidden");
  resetButton.classList.add("hidden");
  gameBoard.style.pointerEvents = "none"; // Disable board interaction on disconnect
};

// --- DOM Event Listeners ---

/**
 * Event listener for clicks on the game board (specifically on cells).
 * Used to detect player moves.
 */
gameBoard.addEventListener("click", (e) => {
  // Check if the clicked element is a cell
  if (!e.target.classList.contains("cell")) return;

  const column = e.target.dataset.column; // Get the column index from the cell's data attribute
  if (column === undefined) return; // Should not happen if cell is properly set up

  // Send a "move" message to the server
  socket.send(
    JSON.stringify({
      type: "move",
      column: parseInt(column), // Ensure column is an integer
      player: localPlayerId,    // Send the local player's ID
    })
  );
});

/**
 * Event listener for the reset button.
 * Sends a request to the server to reset the game.
 */
resetButton.addEventListener("click", () => {
  console.log("Reset button clicked by", localPlayerId);
  // Send a "reset-game" message to the server
  socket.send(JSON.stringify({ type: "reset-game", player: localPlayerId }));
  resetButton.classList.add("hidden"); // Hide the button immediately for better user experience
});

// Chat send functionality - Add event listeners for sending chat messages
if (sendChatButton && chatInput) { // Ensure elements exist before adding listeners
  sendChatButton.addEventListener("click", () => {
    const messageText = chatInput.value.trim(); // Get message text, remove leading/trailing whitespace
    if (messageText && localPlayerId) { // Only send if message is not empty and player ID is assigned
      socket.send(JSON.stringify({
        type: "chat", // Type expected by server for outgoing chat messages
        text: messageText,
        player: localPlayerId // Send localPlayerId as the sender
      }));
      chatInput.value = ""; // Clear input after sending
    }
  });

  // Allow sending message by pressing Enter key in the input field
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent default form submission if input is inside a form
      sendChatButton.click(); // Trigger the click event on the send button
    }
  });
}


// --- UI Update Functions ---

/**
 * Updates the status message displayed to the player.
 * Also manages the visibility of the win message and reset button.
 * @param {string|null} currentPlayer - The ID of the player whose turn it is.
 * @param {string} gameStatus - The current status of the game (e.g., "waiting", "ongoing").
 */
function updateStatus(currentPlayer, gameStatus) {
  winMessageDiv.classList.add("hidden"); // Always hide win message first
  resetButton.classList.add("hidden");   // Always hide reset button first

  if (gameStatus === "waiting") {
    statusDiv.textContent = "Waiting for an opponent to join...";
    statusDiv.classList.remove("hidden");
  } else if (gameStatus === "ongoing") {
    // Display whose turn it is
    statusDiv.textContent = (currentPlayer === localPlayerId) ? "Your turn" : `Waiting for ${currentPlayer}'s move`;
    statusDiv.classList.remove("hidden");
  } else if (gameStatus === "win" || gameStatus === "draw" || gameStatus === "abandoned") {
    // Game over states are handled by showWinMessage, which will also show the reset button.
    // statusDiv will be hidden by showWinMessage.
  }
}

/**
 * Enables or disables player interaction with the game board.
 * @param {string|null} currentPlayer - The ID of the player whose turn it is.
 * @param {string} gameStatus - The current status of the game.
 */
function toggleBoardInteractivity(currentPlayer, gameStatus) {
  const isMyTurn = currentPlayer === localPlayerId; // Check if it's the local player's turn

  if (gameStatus === "ongoing" && isMyTurn) {
    gameBoard.style.pointerEvents = "auto";   // Allow clicks on the board
    gameBoard.style.cursor = "pointer";       // Change cursor to indicate interactivity
  } else {
    gameBoard.style.pointerEvents = "none";   // Disable clicks on the board
    gameBoard.style.cursor = "not-allowed";   // Change cursor to indicate non-interactivity
  }
}

/**
 * Displays the win, draw, or game abandoned message.
 * Also makes the reset button visible.
 * @param {string|null} winner - The ID of the winning player, or null for a draw/abandonment without a specific winner.
 * @param {string} gameStatus - The final status of the game ("win", "draw", "abandoned").
 */
function showWinMessage(winner, gameStatus) {
  winMessageDiv.classList.remove("hidden"); // Make the win message container visible
  statusDiv.classList.add("hidden");        // Hide the regular status message
  resetButton.classList.remove("hidden");   // Show the "Play Again?" button

  const winMessageTextNode = winMessageDiv.firstChild; // Get the text node (e.g., "Winner: ")

  if (gameStatus === "win") {
    winMessageTextNode.textContent = "Winner: ";
    winnerName.textContent = winner; // Display the winner's name
    winnerName.style.display = 'inline'; // Make the winner name span visible
  } else if (gameStatus === "draw") {
    winMessageTextNode.textContent = "It's a Draw!";
    winnerName.style.display = 'none'; // Hide the winner name span
  } else if (gameStatus === "abandoned") {
    // Handle different abandonment scenarios
    winMessageTextNode.textContent = winner && winner === localPlayerId ? "Opponent disconnected. You win!" :
                                     winner ? `Game abandoned. ${winner} wins.` : "Game abandoned.";
    winnerName.style.display = 'none'; // Hide the winner name span
  }
}

/**
 * Displays a chat message in the chat box with appropriate styling.
 * @param {string} sender - The ID of the player who sent the message (e.g., "Player1", "Player2").
 * @param {string} text - The content of the chat message.
 */
function displayChatMessage(sender, text) {
  if (!chatBox) return; // Ensure the chat box element exists

  const messageElement = document.createElement("div");
  messageElement.classList.add("chat-message"); // General class for all messages

  // Add player-specific class for color styling based on sender ID
  // This assumes sender IDs are "Player1" and "Player2" as defined in server.js and styled in style.css
  if (sender === "Player1") {
    messageElement.classList.add("player1-message");
  } else if (sender === "Player2") {
    messageElement.classList.add("player2-message");
  }
  // If sender IDs might be different or dynamic, consider using data attributes
  // e.g., messageElement.dataset.sender = sender; and style with CSS like [data-sender="Player1"]

  // Create a span for the sender's name (styled by .sender-name in CSS)
  const senderNameElement = document.createElement("span");
  senderNameElement.classList.add("sender-name");
  senderNameElement.textContent = `${sender}: `; // e.g., "Player1: "
  messageElement.appendChild(senderNameElement);

  // Add the actual message text
  const messageTextNode = document.createTextNode(text);
  messageElement.appendChild(messageTextNode);

  chatBox.appendChild(messageElement); // Add the new message element to the chat box
  chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to the latest message to keep it in view
}


// --- Initial Setup ---
// These lines run when the script is first loaded.
renderBoard(createEmptyBoard());        // Render an empty board initially
updateStatus(null, "waiting");          // Set initial status to "waiting"
toggleBoardInteractivity(null, "waiting"); // Disable board interactivity initially
