// /Users/aaronobeng/Web Project/Connect Four/server.js
const WebSocket = require('ws'); // Import the WebSocket library for creating a WebSocket server

// --- Constants ---
// Define player identifiers
const PLAYER1 = "Player1";
const PLAYER2 = "Player2";
const MAX_PLAYERS = 2; // Maximum number of players allowed in a game

// Define message types for communication between server and clients
const MESSAGE_TYPES = {
  PLAYER_ASSIGNMENT: "player-assignment", // Sent to a client when they are assigned a player ID
  GAME_STATE: "game-state",             // General game state update (can be consolidated with UPDATE)
  GAME_FULL: "game-full",               // Sent to a client if they try to join a full game
  MOVE: "move",                         // Sent by a client when they make a move
  UPDATE: "update",                     // Sent to clients to update the game board and current player
  GAME_OVER: "game-over",               // Sent to clients when the game has ended (win, draw, abandoned)
  RESET_GAME: "reset-game",              // Sent by a client to request a game reset
  CHAT: "chat",                         // Sent by a client with a chat message
  CHAT_MESSAGE: "chat-message"          // Sent to clients with an incoming chat message from another player
};

// Define possible game statuses
const GAME_STATUS = {
  WAITING: "waiting",     // Server is waiting for players to join
  ONGOING: "ongoing",     // Game is currently in progress
  WIN: "win",             // Game has ended with a winner
  DRAW: "draw",           // Game has ended in a draw
  ABANDONED: "abandoned"  // Game was abandoned (e.g., a player disconnected)
};

// --- Game State ---
// Global object to hold the current state of the game
let game = {
  board: createEmptyBoard(), // The 6x7 game board, initialized as empty
  currentPlayer: PLAYER1,    // Tracks whose turn it is, starts with Player1
  status: GAME_STATUS.WAITING, // Initial game status
  players: [],               // Array to store connected player objects ({id, ws})
  winner: null               // Stores the ID of the winning player, or null
};

// --- WebSocket Server Initialization ---
// Create a new WebSocket server instance.
// It listens on port 8080 on all available network interfaces ('0.0.0.0').
const wss = new WebSocket.Server({ port: 8080, host: '0.0.0.0' });
console.log('Connect Four server started on port 8080');

// --- Game Logic Functions ---

/**
 * Creates an empty 6x7 game board.
 * @returns {Array<Array<null>>} A 2D array representing the board, with all cells initially null.
 */
function createEmptyBoard() {
  return Array(6).fill(null).map(() => Array(7).fill(null));
}

/**
 * Checks if a move is valid in the given column.
 * A move is valid if the column is within bounds (0-6) and the top cell of the column is empty.
 * @param {number} column - The column index to check.
 * @returns {boolean} True if the move is valid, false otherwise.
 */
function isValidMove(column) {
  if (column < 0 || column >= 7) return false; // Check column bounds
  return game.board[0][column] === null; // Check if the top cell in the column is empty
}

/**
 * Places a player's piece in the specified column on the game board.
 * The piece "drops" to the lowest available row in that column.
 * @param {number} column - The column index where the move is made.
 * @param {string} player - The ID of the player making the move (PLAYER1 or PLAYER2).
 * @returns {boolean} True if the move was successfully made, false otherwise (should not happen if isValidMove was called).
 */
function makeMove(column, player) {
  for (let row = 5; row >= 0; row--) { // Iterate from the bottom row upwards
    if (game.board[row][column] === null) {
      game.board[row][column] = player; // Place the player's piece
      return true;
    }
  }
  return false; // Should ideally not be reached if isValidMove is checked first
}

/**
 * Checks the game board for a win condition or a draw.
 * Updates `game.status` and `game.winner` if a win or draw is detected.
 */
function checkWinCondition() {
  const directions = [ // Define directions to check for four-in-a-row
    [0, 1],  // Horizontal
    [1, 0],  // Vertical
    [1, 1],  // Diagonal (down-right)
    [1, -1]  // Diagonal (down-left)
  ];
  const ROWS = 6;
  const COLS = 7;

  // Iterate through each cell on the board
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const player = game.board[r][c]; // Get the player in the current cell
      if (player) { // If the cell is not empty
        // Check in all defined directions
        for (let [dr, dc] of directions) {
          let count = 1; // Count of consecutive pieces
          // Check up to 3 more cells in the current direction
          for (let i = 1; i < 4; i++) {
            const nr = r + dr * i; // Next row
            const nc = c + dc * i; // Next column

            // Check if the next cell is within bounds and belongs to the same player
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && game.board[nr][nc] === player) {
              count++;
            } else {
              break; // Break if out of bounds or different player
            }
          }
          if (count >= 4) { // If four or more consecutive pieces are found
            game.status = GAME_STATUS.WIN;
            game.winner = player;
            return; // Win condition met, no need to check further
          }
        }
      }
    }
  }

  // Check for a draw condition (all cells are filled, and no winner was found)
  if (game.board.every(row => row.every(cell => cell !== null))) {
    game.status = GAME_STATUS.DRAW;
    game.winner = null;
  }
}

/**
 * Resets the game state completely, as if the server just started.
 * Used typically when all players have disconnected.
 */
function fullGameReset() {
  console.log("Full game reset (e.g., all players left).");
  game.board = createEmptyBoard();
  game.currentPlayer = PLAYER1;
  game.status = GAME_STATUS.WAITING;
  game.players = []; // Clear the list of players
  game.winner = null;
}

/**
 * Resets the game for a new round, typically initiated by a player.
 * Keeps existing players if they are still connected.
 */
function playerInitiatedReset() {
  console.log("Player initiated game reset.");
  game.board = createEmptyBoard();
  game.currentPlayer = PLAYER1; // Player1 always starts a new game
  game.winner = null;

  // If both players are still present, start a new game immediately.
  // Otherwise, set the status to waiting for more players.
  if (game.players.length === MAX_PLAYERS) {
    game.status = GAME_STATUS.ONGOING;
    console.log("Two players present, starting new game immediately.");
  } else {
    game.status = GAME_STATUS.WAITING;
    console.log("Less than two players, going to waiting state.");
  }
  broadcastGameState(); // Notify all connected clients about the reset and new game state.
}

/**
 * Broadcasts a chat message to all connected clients.
 * @param {string} senderId - The ID of the player who sent the message.
 * @param {string} text - The chat message text.
 */
function broadcastChatMessage(senderId, text) {
    const message = {
        type: MESSAGE_TYPES.CHAT_MESSAGE, // Use the specific chat message type for clients
        sender: senderId,
        text: text
    };

    console.log(`Broadcasting chat message from ${senderId}: "${text}"`);

    // Iterate over all connected players and send them the chat message
    game.players.forEach(player => {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(JSON.stringify(message));
            } catch (e) {
                console.error("Failed to send chat message to player:", player.id, e);
            }
        }
    });
}


// --- WebSocket Event Handlers ---

// Event listener for new client connections
wss.on('connection', (ws) => {
  console.log('Client connected');

  // If the game is already full and not in a waiting state, reject the new connection.
  if (game.players.length >= MAX_PLAYERS && game.status !== GAME_STATUS.WAITING) {
    ws.send(JSON.stringify({ type: MESSAGE_TYPES.GAME_FULL }));
    // ws.close(); // Optionally close the connection immediately
    return;
  }

  // Assign a player ID (Player1 or Player2) to the new client
  const playerId = game.players.length === 0 ? PLAYER1 : PLAYER2;
  ws.playerId = playerId; // Attach the playerId to the WebSocket connection object for easy access

  // Create a player object and add it to the game's player list
  const newPlayer = { id: playerId, ws: ws };
  game.players.push(newPlayer);

  console.log(`Player ${playerId} connected. Total players: ${game.players.length}`);

  // Send player assignment and initial game state to the newly connected client
  ws.send(JSON.stringify({
    type: MESSAGE_TYPES.PLAYER_ASSIGNMENT,
    playerId: playerId,
    board: game.board,
    currentPlayer: game.currentPlayer,
    status: game.status
  }));

  // If two players are now connected and the game was waiting, start the game
  if (game.players.length === MAX_PLAYERS && game.status === GAME_STATUS.WAITING) {
    game.status = GAME_STATUS.ONGOING;
    broadcastGameState(); // Notify both players that the game has started
  } else if (game.players.length < MAX_PLAYERS) {
    // If still waiting for more players, broadcast the current (waiting) state
    broadcastGameState();
  }

  // Event listener for messages received from this specific client
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message); // Attempt to parse the incoming message as JSON
    } catch (error) {
      console.error('Failed to parse message or invalid message format:', message, error);
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format." }));
      return;
    }

    // Handle "move" messages
    if (data.type === MESSAGE_TYPES.MOVE &&
        data.player === ws.playerId && // Ensure the move is from the correct player
        game.currentPlayer === ws.playerId && // Ensure it's this player's turn
        game.status === GAME_STATUS.ONGOING) { // Ensure the game is ongoing

      const column = data.column;
      if (isValidMove(column)) {
        makeMove(column, ws.playerId); // Make the move on the board
        checkWinCondition();           // Check if this move resulted in a win or draw

        // If the game is still ongoing after the move, switch to the other player
        if (game.status === GAME_STATUS.ONGOING) {
          game.currentPlayer = game.currentPlayer === PLAYER1 ? PLAYER2 : PLAYER1;
        }
        broadcastGameState(); // Send the updated game state to all clients
      } else {
        // Send an error message back to the client if the move was invalid
        ws.send(JSON.stringify({ type: "error", message: "Invalid move." }));
      }
    } else if (data.type === MESSAGE_TYPES.RESET_GAME) { // Handle "reset-game" messages
      // Allow reset only if the game is over (win, draw, or abandoned)
      if (game.status === GAME_STATUS.WIN || game.status === GAME_STATUS.DRAW || game.status === GAME_STATUS.ABANDONED) {
        console.log(`Player ${ws.playerId} requested game reset.`);
        playerInitiatedReset(); // Perform the player-initiated reset logic
      } else {
        // Send an error if reset is requested at an inappropriate time
        console.log(`Player ${ws.playerId} requested reset, but game not over. Status: ${game.status}`);
        ws.send(JSON.stringify({ type: "error", message: "Game can only be reset when it's over." }));
      }
    } else if (data.type === MESSAGE_TYPES.CHAT) { // Handle incoming chat messages from a client
        // Validate the chat message data
        if (data.text && typeof data.text === 'string' && data.text.trim().length > 0 && data.player === ws.playerId) {
            // Broadcast the chat message to all connected clients
            broadcastChatMessage(data.player, data.text.trim());
        } else {
            // Optionally send an error back if the chat message was invalid
            console.warn(`Received invalid chat message from ${ws.playerId || 'unknown'}:`, data);
            // ws.send(JSON.stringify({ type: "error", message: "Invalid chat message." }));
        }
    }
    // Other message types could be handled here with more `else if` blocks
  });

  // Event listener for when this client's connection is closed
  ws.on('close', () => {
    console.log(`Client disconnected (Player: ${ws.playerId || 'unknown'})`);
    handlePlayerDisconnect(ws.playerId); // Handle the logic for a player disconnecting
  });

  // Event listener for errors on this client's WebSocket connection
  ws.on('error', (error) => {
    console.error(`WebSocket error for player ${ws.playerId || 'unknown'}:`, error);
    // Optionally, you might want to also treat this as a disconnect:
    // handlePlayerDisconnect(ws.playerId);
  });
});

/**
 * Sends the current game state to all connected clients.
 */
function broadcastGameState() {
  // Construct the message payload
  const message = {
    board: game.board,
    currentPlayer: game.currentPlayer,
    status: game.status,
    winner: game.winner
  };

  // Determine the message type based on the game status
  if (game.status === GAME_STATUS.ONGOING || game.status === GAME_STATUS.WAITING) {
    message.type = MESSAGE_TYPES.UPDATE;
  } else { // WIN, DRAW, ABANDONED
    message.type = MESSAGE_TYPES.GAME_OVER;
  }

  console.log("Broadcasting game state:", message.type, "to", game.players.length, "players. Status:", game.status);

  // Iterate over all connected players and send them the message
  game.players.forEach(player => {
    // Check if the WebSocket connection is still open before sending
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      try {
        player.ws.send(JSON.stringify(message));
      } catch (e) {
        console.error("Failed to send message to player:", player.id, e);
        // Potentially handle this error, e.g., by removing the player if send fails repeatedly
      }
    }
  });
}

/**
 * Handles the logic when a player disconnects from the game.
 * @param {string} playerId - The ID of the player who disconnected.
 */
function handlePlayerDisconnect(playerId) {
  if (!playerId) {
    console.warn("Attempted to handle disconnect for a client without a player ID.");
    return;
  }

  // Find the index of the disconnected player in the players array
  const disconnectedPlayerIndex = game.players.findIndex(p => p.id === playerId);

  if (disconnectedPlayerIndex !== -1) {
    // Remove the player from the array
    game.players.splice(disconnectedPlayerIndex, 1);
    console.log(`Player ${playerId} removed. Remaining players: ${game.players.length}`);

    // If the game was ongoing when the player disconnected
    if (game.status === GAME_STATUS.ONGOING) {
      game.status = GAME_STATUS.ABANDONED;
      // If there's one player remaining, they are the winner
      if (game.players.length === 1) {
        game.winner = game.players[0].id;
      } else {
        game.winner = null; // No winner if both disconnected or other scenarios
      }
      broadcastGameState(); // Notify remaining players about the abandonment
    }

    // If all players have disconnected and the game wasn't already waiting, reset the game fully
    if (game.players.length === 0 && game.status !== GAME_STATUS.WAITING) {
      console.log("All players disconnected. Performing full game reset.");
      fullGameReset();
    }
  } else {
    console.warn(`Player ${playerId} not found in active players list during disconnect.`);
  }
}

console.log('WebSocket server setup complete.'); // Confirmation that the server script has run to this point
