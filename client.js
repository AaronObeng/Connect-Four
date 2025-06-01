// /Users/aaronobeng/Web Project/Connect Four/client.js

let localPlayerId = null; // Declare with let and initialize
let currentBoard = [];

const socket = new WebSocket("ws://192.168.5.171:8080");

// Initialize the board
const gameBoard = document.getElementById("game-board");
const statusDiv = document.getElementById("status");
const winMessageDiv = document.getElementById("win-message");
const winnerName = document.getElementById("winner-name"); // This is the <span> inside winMessageDiv

// Create initial empty board
function createEmptyBoard() {
  return Array(6).fill().map(() => Array(7).fill(null));
}

// Render the board
function renderBoard(board) {
  gameBoard.innerHTML = "";
  currentBoard = board;

  board.forEach((row, rowIndex) => {
    row.forEach((player, colIndex) => {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.column = colIndex;
      cell.dataset.player = player || "";

      // CSS handles the background color based on data-player attribute
      // So, explicit style setting here can be removed if CSS is comprehensive
      // However, keeping it ensures it works even if CSS is minimal.
      if (player !== null) {
        cell.style.backgroundColor =
          player === "Player1" ? "#e63946" : "#2a9d8f";
      }

      gameBoard.appendChild(cell);
    });
  });
}

// Handle game state updates from the server
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "player-assignment") {
    localPlayerId = data.playerId;
    console.log("Assigned Player ID:", localPlayerId);
    renderBoard(data.board);
    updateStatus(data.currentPlayer, data.status);
    toggleBoardInteractivity(data.currentPlayer, data.status);
  } else if (data.type === "game-state") { // Typically for initial state or reconnect
    renderBoard(data.board);
    updateStatus(data.currentPlayer, data.status);
    toggleBoardInteractivity(data.currentPlayer, data.status);
  } else if (data.type === "update") { // Regular game progress
    renderBoard(data.board);
    updateStatus(data.currentPlayer, data.status);
    toggleBoardInteractivity(data.currentPlayer, data.status);
  } else if (data.type === "game-over") {
    renderBoard(data.board);
    showWinMessage(data.winner, data.status);
    // statusDiv is hidden by showWinMessage
    toggleBoardInteractivity(null, data.status); // Disable board
  } else if (data.type === "game-full") {
    statusDiv.textContent = "Game is full. Please try again later.";
    winMessageDiv.classList.add("hidden");
    statusDiv.classList.remove("hidden");
    // Optionally disable board or prevent further interaction
    gameBoard.style.pointerEvents = "none";
  } else if (data.type === "error") { // Handle errors from server
    console.error("Server error:", data.message);
    statusDiv.textContent = `Error: ${data.message}`;
    statusDiv.classList.remove("hidden");
  }
};

// Event listener for clicking on a column
gameBoard.addEventListener("click", (e) => {
  if (!e.target.classList.contains("cell")) return; // Ensure a cell was clicked

  const column = e.target.dataset.column;
  if (column === undefined) return; // Clicked on gap or something without column

  // Check if the cell is already taken (though server validates, good for UX)
  // This check is a bit tricky here as e.target.dataset.player refers to an already placed piece.
  // The primary check should be if it's the player's turn and the column is valid (not full).
  // The server's isValidMove is the ultimate authority.

  // Send the move to the server
  socket.send(
    JSON.stringify({
      type: "move",
      column: parseInt(column),
      player: localPlayerId, // Server will verify if this player is the currentPlayer
    })
  );
});

// Update the status based on current player and game status
function updateStatus(currentPlayer, gameStatus) {
  if (gameStatus === "waiting") {
    statusDiv.textContent = "Waiting for an opponent to join...";
    statusDiv.classList.remove("hidden");
    winMessageDiv.classList.add("hidden");
  } else if (gameStatus === "ongoing") {
    if (currentPlayer === localPlayerId) {
      statusDiv.textContent = "Your turn";
    } else {
      statusDiv.textContent = `Waiting for ${currentPlayer}'s move`;
    }
    statusDiv.classList.remove("hidden");
    winMessageDiv.classList.add("hidden");
  }
  // For "win", "draw", "abandoned", the showWinMessage function handles UI updates,
  // including hiding statusDiv.
}

// Enable or disable board interactivity based on game state
function toggleBoardInteractivity(currentPlayer, gameStatus) {
  const isMyTurn = currentPlayer === localPlayerId;
  const cells = gameBoard.querySelectorAll(".cell"); // Not strictly needed if using gameBoard pointerEvents

  if (gameStatus === "ongoing" && isMyTurn) {
    gameBoard.style.pointerEvents = "auto";
    gameBoard.style.cursor = "pointer"; // Apply to board, cells inherit or use specific cell styling
    // cells.forEach(cell => { // More granular control if needed
    //   cell.style.cursor = "pointer";
    // });
  } else {
    // Disable for "waiting", "opponent's turn", or game over states ("win", "draw", "abandoned")
    gameBoard.style.pointerEvents = "none";
    gameBoard.style.cursor = "not-allowed";
    // cells.forEach(cell => {
    //   cell.style.cursor = "not-allowed";
    // });
  }
}

// Show win/draw/abandoned message
function showWinMessage(winner, gameStatus) {
  winMessageDiv.classList.remove("hidden");
  statusDiv.classList.add("hidden"); // Hide the regular status message

  const winMessageTextNode = winMessageDiv.firstChild; // e.g., "Winner: " text part
  // winnerName is the span: <span id="winner-name"></span>

  if (gameStatus === "win") {
    winMessageTextNode.textContent = "Winner: ";
    winnerName.textContent = winner;
    winnerName.style.display = 'inline';
  } else if (gameStatus === "draw") {
    winMessageTextNode.textContent = "It's a Draw!";
    winnerName.style.display = 'none';
  } else if (gameStatus === "abandoned") {
    if (winner && winner === localPlayerId) { // If I am the winner by abandonment
        winMessageTextNode.textContent = "Opponent disconnected. You win!";
    } else if (winner) { // If the other player won by my (theoretical) abandonment (server handles this)
        winMessageTextNode.textContent = `Game abandoned. ${winner} wins.`;
    }
    else { // General abandonment, or if winner is not specified for some reason
        winMessageTextNode.textContent = "Game abandoned.";
    }
    winnerName.style.display = 'none';
  }
}

// Initial setup
renderBoard(createEmptyBoard());
updateStatus(null, "waiting"); // Initial status before connection or assignment
toggleBoardInteractivity(null, "waiting"); // Initially disable board
