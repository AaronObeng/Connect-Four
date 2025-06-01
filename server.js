const WebSocket = require('ws');

// --- Constants ---
const PLAYER1 = "Player1";
const PLAYER2 = "Player2";
const MAX_PLAYERS = 2;

const MESSAGE_TYPES = {
  PLAYER_ASSIGNMENT: "player-assignment", // For client to know its ID
  GAME_STATE: "game-state",             // Initial state for reconnecting or new player
  GAME_FULL: "game-full",
  MOVE: "move",
  UPDATE: "update",                     // Regular game update
  GAME_OVER: "game-over"                // Game has ended
};

const GAME_STATUS = {
  WAITING: "waiting", // Waiting for players
  ONGOING: "ongoing",
  WIN: "win",
  DRAW: "draw",
  ABANDONED: "abandoned"
};

// --- Game State ---
let game = {
  board: createEmptyBoard(),
  currentPlayer: PLAYER1,
  status: GAME_STATUS.WAITING, // Initial status
  players: [], // Array of player IDs {id: string, ws: WebSocket}
  winner: null
};

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: 8080, host: '0.0.0.0' });
console.log('Connect Four server started on port 8080');

// --- Game Logic Functions ---
function createEmptyBoard() {
  return Array(6).fill(null).map(() => Array(7).fill(null));
}

function isValidMove(column) {
  if (column < 0 || column >= 7) return false;
  return game.board[0][column] === null;
}

function makeMove(column, player) {
  for (let row = 5; row >= 0; row--) {
    if (game.board[row][column] === null) {
      game.board[row][column] = player;
      return true; // Move successful
    }
  }
  return false; // Should not happen if isValidMove is checked
}

function checkWinCondition() {
  const directions = [
    [0, 1], [1, 0], [1, 1], [1, -1] // Horizontal, Vertical, Diagonal (down-right), Diagonal (down-left)
  ];
  const ROWS = 6;
  const COLS = 7;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const player = game.board[r][c];
      if (player) {
        for (let [dr, dc] of directions) {
          let count = 1;
          for (let i = 1; i < 4; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && game.board[nr][nc] === player) {
              count++;
            } else {
              break;
            }
          }
          if (count >= 4) {
            game.status = GAME_STATUS.WIN;
            game.winner = player;
            return;
          }
        }
      }
    }
  }

  // Check for draw (board full and no winner)
  if (game.board.every(row => row.every(cell => cell !== null))) {
    game.status = GAME_STATUS.DRAW;
    game.winner = null; // Explicitly no winner
  }
}

function resetGame() {
  console.log("Resetting game state.");
  game.board = createEmptyBoard();
  game.currentPlayer = PLAYER1;
  game.status = GAME_STATUS.WAITING;
  game.players = []; // Clear players list
  game.winner = null;
  // playerConnections are managed by actual disconnections
}

// --- WebSocket Event Handlers ---
wss.on('connection', (ws) => {
  console.log('Client connected');

  if (game.players.length >= MAX_PLAYERS && game.status !== GAME_STATUS.WAITING) {
    // Game is full and ongoing or finished, new connections are spectators or rejected
    ws.send(JSON.stringify({ type: MESSAGE_TYPES.GAME_FULL }));
    // Optionally, you could send the current board for spectating:
    // ws.send(JSON.stringify({ type: MESSAGE_TYPES.GAME_STATE, board: game.board, currentPlayer: game.currentPlayer, status: game.status, isSpectator: true }));
    // ws.close(); // Or close if you don't want spectators
    return;
  }

  // Assign player ID
  const playerId = game.players.length === 0 ? PLAYER1 : PLAYER2;
  ws.playerId = playerId; // Store playerId on the ws object

  const newPlayer = { id: playerId, ws: ws };
  game.players.push(newPlayer);

  console.log(`Player ${playerId} connected. Total players: ${game.players.length}`);

  // Send player assignment and initial game state
  ws.send(JSON.stringify({
    type: MESSAGE_TYPES.PLAYER_ASSIGNMENT,
    playerId: playerId,
    board: game.board,
    currentPlayer: game.currentPlayer,
    status: game.status
  }));

  // If two players are now connected, start the game
  if (game.players.length === MAX_PLAYERS && game.status === GAME_STATUS.WAITING) {
    game.status = GAME_STATUS.ONGOING;
    broadcastGameState(); // Notify both players game is starting
  } else if (game.players.length < MAX_PLAYERS) {
    // Notify existing player(s) that a new player joined (optional)
    broadcastGameState(); // Or a specific "player-joined" message
  }


  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      console.error('Failed to parse message or invalid message format:', message, error);
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format." }));
      return;
    }

    if (data.type === MESSAGE_TYPES.MOVE && data.player === ws.playerId && game.currentPlayer === ws.playerId && game.status === GAME_STATUS.ONGOING) {
      const column = data.column;
      if (isValidMove(column)) {
        makeMove(column, ws.playerId);
        checkWinCondition(); // This will update game.status and game.winner if game ends

        if (game.status === GAME_STATUS.ONGOING) {
          game.currentPlayer = game.currentPlayer === PLAYER1 ? PLAYER2 : PLAYER1;
        }
        broadcastGameState();
      } else {
        // Optional: send an error message for invalid move
        ws.send(JSON.stringify({ type: "error", message: "Invalid move." }));
      }
    }
    // Removed redundant 'disconnect' message type handler
  });

  ws.on('close', () => {
    console.log(`Client disconnected (Player: ${ws.playerId || 'unknown'})`);
    handlePlayerDisconnect(ws.playerId);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for player ${ws.playerId || 'unknown'}:`, error);
    // `ws.on('close')` will usually follow, so disconnect handling happens there.
  });
});

function broadcastGameState() {
  const message = {
    board: game.board,
    currentPlayer: game.currentPlayer,
    status: game.status,
    winner: game.winner // winner will be null if game is ongoing or a draw
  };

  if (game.status === GAME_STATUS.ONGOING || game.status === GAME_STATUS.WAITING) {
    message.type = MESSAGE_TYPES.UPDATE;
  } else { // WIN, DRAW, ABANDONED
    message.type = MESSAGE_TYPES.GAME_OVER;
  }

  console.log("Broadcasting game state:", message.type, "to", game.players.length, "players");
  game.players.forEach(player => {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      try {
        player.ws.send(JSON.stringify(message));
      } catch (e) {
        console.error("Failed to send message to player:", player.id, e);
      }
    }
  });
}

function handlePlayerDisconnect(playerId) {
  if (!playerId) {
    console.warn("Attempted to handle disconnect for a client without a player ID.");
    return;
  }

  const disconnectedPlayerIndex = game.players.findIndex(p => p.id === playerId);
  if (disconnectedPlayerIndex !== -1) {
    game.players.splice(disconnectedPlayerIndex, 1);
    console.log(`Player ${playerId} removed. Remaining players: ${game.players.length}`);

    if (game.status === GAME_STATUS.ONGOING) {
      // If the game was ongoing and a player leaves, the other player wins by abandonment.
      game.status = GAME_STATUS.ABANDONED;
      if (game.players.length === 1) {
        game.winner = game.players[0].id; // The remaining player is the winner
      } else {
        game.winner = null; // Or handle as a general abandonment if both left somehow
      }
      broadcastGameState(); // This will send a GAME_OVER message
    } else if (game.players.length < MAX_PLAYERS && game.status !== GAME_STATUS.WAITING) {
        // If game was already over (WIN/DRAW) or became abandoned, and now less than 2 players
        // we might want to reset if all players are gone.
    }

    if (game.players.length === 0 && game.status !== GAME_STATUS.WAITING) {
      // If all players have disconnected and the game wasn't already in a waiting state
      console.log("All players disconnected. Resetting game for new players.");
      resetGame();
    } else if (game.players.length < MAX_PLAYERS && game.status !== GAME_STATUS.ONGOING && game.status !== GAME_STATUS.WAITING) {
      // If game was over (WIN, DRAW, ABANDONED) and players are leaving,
      // we might want to transition to WAITING if enough slots open up.
      // For now, resetGame() when all are gone is a simple approach.
      // If one player remains after a game_over, they just see the game_over state.
      // If they also disconnect, then resetGame() is called.
    }


  } else {
    console.warn(`Player ${playerId} not found in active players list during disconnect.`);
  }
}

console.log('WebSocket server setup complete.');

// The duplicate ws.on('close') from the original file has been removed
// as its logic is integrated into the main wss.on('connection')'s ws.on('close').
