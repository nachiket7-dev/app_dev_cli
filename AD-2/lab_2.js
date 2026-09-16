const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Resolves correctly whether run from root or inside AD-2/
const SONGS_DIR = fs.existsSync(path.join(__dirname, "songs"))
  ? path.join(__dirname, "songs")
  : path.join(__dirname, "..", "songs");

let songs = [];
let currentPlayer = null;

function listSongs(directory_path) {
  const scanner = spawn("ls", [directory_path]);
  let output = "";

  scanner.stdout.on("data", (data) => {
    output += data.toString();
  });

  scanner.stderr.on("data", (err) => {
    console.error("Error reading directory:", err.toString().trim());
  });

  scanner.on("close", (code) => {
    if (code !== 0 || !output.trim()) {
      console.log("No songs found in directory.");
      return;
    }
    songs = output.trim().split("\n");
    console.log("\nAvailable songs:");
    songs.forEach((song, index) => {
      console.log(`[${index}] ${song}`);
    });
    console.log("\nEnter song number to play (or 'q' to quit):");
  });
}

function playSong(song_path) {
  // Stop previously playing audio before starting a new one
  if (currentPlayer) {
    currentPlayer.kill();
  }

  currentPlayer = spawn("afplay", [song_path]);

  currentPlayer.on("error", (err) => {
    console.error("Failed to start player:", err.message);
  });

  currentPlayer.on("close", () => {
    currentPlayer = null;
  });
}

listSongs(SONGS_DIR);

process.stdin.on("data", (data) => {
  const input = data.toString().trim();

  if (input.toLowerCase() === "q") {
    if (currentPlayer) currentPlayer.kill();
    process.exit(0);
  }

  // Ensure songs are loaded
  if (!songs || songs.length === 0) {
    console.log("Songs list is still loading or empty. Please wait...");
    return;
  }

  // Validate numeric input
  const userChoice = parseInt(input, 10);
  if (isNaN(userChoice) || userChoice < 0 || userChoice >= songs.length) {
    console.log(`Invalid choice. Please enter a number between 0 and ${songs.length - 1}.`);
    return;
  }

  const selectedSong = songs[userChoice];
  console.log(`Now playing: ${selectedSong}`);
  playSong(path.join(SONGS_DIR, selectedSong));
});