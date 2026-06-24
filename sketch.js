// =====================================================================
//  HEAR NO EVIL  —  a flashlight horror escape
//  The player is deaf: music is muffled & quiet, the vampire's whisper
//  only grows audible as it closes in.
// =====================================================================

const CANVAS_W = 800;
const CANVAS_H = 800;
const WORLD_W = 2000;
const WORLD_H = 1600;
const PLAYER_SPEED = 3.2;
const PLAYER_RADIUS = 25;
const FLASHLIGHT_DISTANCE = 300;
const FLASHLIGHT_ANGLE = Math.PI / 2;
const CAM_SMOOTHING = 0.08;

const TITLE_FONT = "Creepster, Nosifer, cursive";

let player;
let camera;
let walls = [];
let tables = [];
let keyItem;
let door;
let gameState; // "start" | "tutorial" | "play" | "win" | "gameover"
let pressedKeys = {};
let fogLayer;
let vampire;
let vampireImg, playerImg, keyImg, tableImg, deathImg, doorImg;
let shakeX = 0, shakeY = 0;

// Tile map
let tileWallImg, tileCornerImg, tileFloorImg;
let tileMapData;
let TILE_SIZE = 40;
let mapCols = 50;
let mapRows = 40;

// Tutorial / intro
let tutorialStartX = 0, tutorialStartY = 0;
let tutorialIntroDismissed = false;

// Smooth room-to-room fade transition
let fadeActive = false;
let fadePhase = "";      // "out" | "in"
let fadeAlpha = 0;
let fadeCallback = null;

// Flashlight flicker
let lightOn = true;
let flickering = false;
let flickerStart = 0;
let flickerDur = 0;
let nextFlickerAt = 0;
let nextStrobe = 0;

// Audio
let bgMusic, whisperSound, musicFilter, whisperFilter;
let seenSound, gameoverSound;
let musicReady = false, whisperReady = false;
let seenReady = false, gameoverReady = false;
let wantAudio = false;
let whisperVol = 0;

// ---------------------------------------------------------------------
function preload() {
  tileWallImg   = loadImage("assets/images/wall.png",   () => {}, () => {});
  tileCornerImg = loadImage("assets/images/corner.png", () => {}, () => {});
  tileFloorImg  = loadImage("assets/images/floor.png",  () => {}, () => {});
  playerImg     = loadImage("assets/images/mainguy2.png", () => {}, () => {});
  vampireImg    = loadImage("assets/images/Vampire.png", () => {}, () => {});
  keyImg        = loadImage("assets/images/key.png",     () => {}, () => {});
  tableImg      = loadImage("assets/images/table.png",   () => {}, () => {});
  deathImg      = loadImage("assets/images/death.png",   () => {}, () => {});
  doorImg       = loadImage("assets/images/Door.png",     () => {}, () => {});
  tileMapData   = loadJSON("data/blocks.json");
}

function setup() {
  createCanvas(CANVAS_W, CANVAS_H);
  fogLayer = createGraphics(CANVAS_W, CANVAS_H);
  textFont("monospace");
  noCursor();
  camera = { x: 0, y: 0 };

  if (tileMapData) {
    TILE_SIZE = tileMapData.tileSize || TILE_SIZE;
    mapCols = tileMapData.cols || mapCols;
    mapRows = tileMapData.rows || mapRows;
  }

  loadAudio();
  nextFlickerAt = millis() + random(8000, 16000);

  gameState = "start";
}

// ---------------------------------------------------------------------
//  AUDIO
// ---------------------------------------------------------------------
function loadAudio() {
  if (typeof loadSound !== "function") return;
  try {
    bgMusic = loadSound(
      "assets/sounds/scarymusic.mp3",
      () => { musicReady = true; setupMusic(); maybeStartAudio(); },
      () => console.warn("scarymusic.mp3 not found — music disabled.")
    );
    whisperSound = loadSound(
      "assets/sounds/whisper.mp3",
      () => { whisperReady = true; setupWhisper(); maybeStartAudio(); },
      () => console.warn("whisper.mp3 not found — whisper disabled.")
    );
    // One-shot scare stings (kept clear/unmuffled on purpose)
    seenSound = loadSound(
      "assets/sounds/seen.mp3",
      () => { seenReady = true; },
      () => console.warn("seen.mp3 not found — disabled.")
    );
    gameoverSound = loadSound(
      "assets/sounds/gameover.mp3",
      () => { gameoverReady = true; },
      () => console.warn("gameover.mp3 not found — disabled.")
    );
  } catch (e) {
    console.warn("p5.sound unavailable:", e);
  }
}

function setupMusic() {
  try {
    musicFilter = new p5.LowPass();   // muffle (deaf perspective)
    musicFilter.freq(480);
    musicFilter.res(2);
    bgMusic.disconnect();
    bgMusic.connect(musicFilter);
    bgMusic.setVolume(0.0);
  } catch (e) { /* filter optional */ }
}

function setupWhisper() {
  try {
    whisperFilter = new p5.LowPass();
    whisperFilter.freq(820);
    whisperSound.disconnect();
    whisperSound.connect(whisperFilter);
    whisperSound.setVolume(0.0);
  } catch (e) { /* filter optional */ }
}

function playOneShot(snd, ready, vol) {
  if (!ready || !snd) return;
  try { snd.setVolume(vol); snd.play(); } catch (e) {}
}

function startAudio() {
  wantAudio = true;
  try { if (typeof userStartAudio === "function") userStartAudio(); } catch (e) {}
  maybeStartAudio();
}

function maybeStartAudio() {
  if (!wantAudio) return;
  if (musicReady && bgMusic && !bgMusic.isPlaying()) {
    try { bgMusic.setVolume(0.18); bgMusic.loop(); } catch (e) {}
  }
  if (whisperReady && whisperSound && !whisperSound.isPlaying()) {
    try { whisperSound.setVolume(0.0); whisperSound.loop(); } catch (e) {}
  }
}

// Proximity whisper: faintly audible even far off, ramping up sharply
// the closer the vampire gets, loud when it's right beside you.
function updateWhisper() {
  if (!whisperReady || !whisperSound) return;
  const near = 45, far = 800, maxV = 0.85;
  let d = dist(player.x, player.y, vampire.x, vampire.y);
  let v;
  if (d >= far) {
    v = 0;
  } else {
    let t = constrain(1 - (d - near) / (far - near), 0, 1); // 1 close -> 0 far
    let proximity = maxV * pow(t, 1.5);          // steep ramp = noticeable
    let floorFade = constrain((far - d) / 140, 0, 1);
    let floorVol = 0.14 * floorFade;             // still hear it a bit when far
    v = max(floorVol, proximity);
  }
  whisperVol = lerp(whisperVol, v, 0.15);
  try { whisperSound.setVolume(whisperVol); } catch (e) {}
}

// ---------------------------------------------------------------------
//  LEVEL SETUP
// ---------------------------------------------------------------------
function initTutorial() {
  const rx = 100, ry = 140;
  const cols = 15, rows = 13;

  player = {
    x: rx + 2 * TILE_SIZE + TILE_SIZE / 2,
    y: ry + floor(rows / 2) * TILE_SIZE + TILE_SIZE / 2,
    r: PLAYER_RADIUS,
    hasKey: false,
  };

  camera = { x: 0, y: 0 };
  walls = [];
  tables = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let isWall = (row === 0 || row === rows - 1 || col === 0);
      let isDoorOpening = (col === cols - 1 && row >= 5 && row <= 7);
      if (col === cols - 1 && !isDoorOpening) isWall = true;
      if (isWall) {
        walls.push({ x: rx + col * TILE_SIZE, y: ry + row * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
      }
    }
  }

  // Tutorial desk, flush below the top wall
  let tutTableX = rx + 7 * TILE_SIZE;
  let tutTableY = ry + 1 * TILE_SIZE;
  walls.push({ x: tutTableX, y: tutTableY, w: TILE_SIZE, h: TILE_SIZE });
  tables.push({ x: tutTableX, y: tutTableY, w: TILE_SIZE, h: TILE_SIZE });

  door = {
    x: rx + (cols - 1) * TILE_SIZE,
    y: ry + 5 * TILE_SIZE,
    w: TILE_SIZE,
    h: 3 * TILE_SIZE,
    isOpen: false,
  };

  keyItem = {
    x: rx + 11 * TILE_SIZE + TILE_SIZE / 2,
    y: ry + floor(rows / 2) * TILE_SIZE + TILE_SIZE / 2,
    r: 14,
    collected: false,
  };

  tutorialStartX = player.x;
  tutorialStartY = player.y;
  tutorialIntroDismissed = false;
  gameState = "tutorial";
}

function initGame() {
  // Original-map positions (JSON may override spawn/vampire).
  const spawn = (tileMapData && tileMapData.spawn) || { x: 200, y: 200 };
  const vampPos = (tileMapData && tileMapData.vampire) || { x: 1700, y: 1200 };

  player = { x: spawn.x, y: spawn.y, r: PLAYER_RADIUS, hasKey: false };

  walls = [];
  tables = [];
  if (tileMapData && tileMapData.tiles) {
    for (let row = 0; row < mapRows; row++) {
      let line = tileMapData.tiles[row] || "";
      for (let col = 0; col < mapCols; col++) {
        let ch = line[col] || ".";
        if ("LRUBNESWCT".indexOf(ch) !== -1) {
          walls.push({ x: col * TILE_SIZE, y: row * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
        }
        if (ch === "T") {
          tables.push({ x: col * TILE_SIZE, y: row * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
        }
      }
    }
  }

  // Key spawns in a random, reachable spot each game.
  const keyPos = pickRandomKeyTile(spawn.x, spawn.y);
  keyItem = { x: keyPos.x, y: keyPos.y, r: 16, collected: false };

  // Exit door aligned with the opening in the right wall.
  door = { x: WORLD_W - 80, y: 700, w: 50, h: 200, isOpen: false };

  vampire = {
    x: vampPos.x,
    y: vampPos.y,
    r: 25,
    state: "chasing",
    stunTimer: 0,
    shakeStartTime: -Infinity,
    wasInCone: false,
  };

  whisperVol = 0;
  gameState = "play";
}

function restartGame() {
  startAudio();
  initGame();
}

// Flood-fill from the spawn over walkable floor, then pick a random reachable
// tile a fair distance away — guarantees the key is never sealed off.
function pickRandomKeyTile(spawnX, spawnY) {
  if (!(tileMapData && tileMapData.tiles)) return { x: 1300, y: 950 };
  const tiles = tileMapData.tiles;
  const isFloor = (c, r) =>
    r >= 0 && r < mapRows && c >= 0 && c < mapCols && (tiles[r][c] || ".") === ".";

  const startC = floor(spawnX / TILE_SIZE);
  const startR = floor(spawnY / TILE_SIZE);
  const seen = new Set([startC + "," + startR]);
  const queue = [[startC, startR]];
  const reachable = [];

  while (queue.length) {
    const [c, r] = queue.shift();
    reachable.push([c, r]);
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
      const k = nc + "," + nr;
      if (!seen.has(k) && isFloor(nc, nr)) { seen.add(k); queue.push([nc, nr]); }
    }
  }

  const candidates = reachable.filter(([c, r]) => {
    const cx = c * TILE_SIZE + TILE_SIZE / 2;
    const cy = r * TILE_SIZE + TILE_SIZE / 2;
    return c < 47 && dist(cx, cy, spawnX, spawnY) > 350; // not in exit, not on top of you
  });

  const pool = candidates.length ? candidates : reachable;
  const pick = pool[floor(random(pool.length))];
  return { x: pick[0] * TILE_SIZE + TILE_SIZE / 2, y: pick[1] * TILE_SIZE + TILE_SIZE / 2 };
}

// ---------------------------------------------------------------------
//  MAIN LOOP
// ---------------------------------------------------------------------
function draw() {
  background(0);

  if (gameState === "start") {
    drawStartScreen();
    return;
  }

  updateFlicker();

  const frozen = fadeActive || (gameState === "tutorial" && !tutorialIntroDismissed);

  if (!frozen) {
    if (gameState === "tutorial") {
      updatePlayer();
      checkKeyPickup();
      checkTutorialCompletion();
    } else if (gameState === "play") {
      updatePlayer();
      updateVampire();
      checkKeyPickup();
      checkWinCondition();
      checkVampireCatch();
      updateWhisper();
    }
  }

  updateCamera();
  computeShake();

  // World (tiles) first
  push();
  translate(-camera.x + shakeX, -camera.y + shakeY);
  if (gameState === "tutorial") drawTutorialRoom();
  else drawRoom();
  pop();

  drawFog();

  // Entities above fog
  push();
  translate(-camera.x + shakeX, -camera.y + shakeY);
  drawDoor();
  drawPlayer();
  drawKey();
  if (gameState === "play") drawVampire();
  pop();

  // HUD
  if (gameState === "tutorial") drawTutorialUI();
  else if (gameState === "play") drawUI();

  if (gameState === "win") drawWinScreen();
  if (gameState === "gameover") drawGameOverScreen();

  if (gameState === "tutorial" && !tutorialIntroDismissed) drawTutorialIntro();

  drawFade();
}

function computeShake() {
  shakeX = 0;
  shakeY = 0;
  if (gameState !== "play") return;

  if (millis() - vampire.shakeStartTime < 500) {
    shakeX = random(-11, 11);
    shakeY = random(-11, 11);
  }
  if (vampire.state === "chasing") {
    let d = dist(player.x, player.y, vampire.x, vampire.y);
    if (d < 150) {
      let intensity = map(d, 150, 50, 1.5, 4.5, true);
      shakeX += random(-intensity, intensity);
      shakeY += random(-intensity, intensity);
    }
  }
}

function updateCamera() {
  let targetX = constrain(player.x - CANVAS_W / 2, 0, WORLD_W - CANVAS_W);
  let targetY = constrain(player.y - CANVAS_H / 2, 0, WORLD_H - CANVAS_H);
  camera.x = lerp(camera.x, targetX, CAM_SMOOTHING);
  camera.y = lerp(camera.y, targetY, CAM_SMOOTHING);
}

// ---------------------------------------------------------------------
//  FLICKER
// ---------------------------------------------------------------------
function updateFlicker() {
  let t = millis();
  if (!flickering) {
    if (t >= nextFlickerAt) {
      flickering = true;
      flickerStart = t;
      flickerDur = random(220, 650);
      nextStrobe = 0;
    } else {
      lightOn = true;
    }
  }
  if (flickering) {
    if (t - flickerStart >= flickerDur) {
      flickering = false;
      lightOn = true;
      nextFlickerAt = t + random(12000, 28000); // very rare
    } else if (t >= nextStrobe) {
      nextStrobe = t + random(35, 75);
      lightOn = random() < 0.4; // mostly dark during a flicker
    }
  }
}

// ---------------------------------------------------------------------
//  PLAYER MOVEMENT
// ---------------------------------------------------------------------
function updatePlayer() {
  let moveX = 0, moveY = 0;

  if (keyIsDown(LEFT_ARROW)) moveX -= PLAYER_SPEED;
  if (keyIsDown(RIGHT_ARROW)) moveX += PLAYER_SPEED;
  if (keyIsDown(UP_ARROW)) moveY -= PLAYER_SPEED;
  if (keyIsDown(DOWN_ARROW)) moveY += PLAYER_SPEED;

  if (pressedKeys["a"] || pressedKeys["A"]) moveX -= PLAYER_SPEED;
  if (pressedKeys["d"] || pressedKeys["D"]) moveX += PLAYER_SPEED;
  if (pressedKeys["w"] || pressedKeys["W"]) moveY -= PLAYER_SPEED;
  if (pressedKeys["s"] || pressedKeys["S"]) moveY += PLAYER_SPEED;

  movePlayer(moveX, 0);
  movePlayer(0, moveY);
}

function movePlayer(dx, dy) {
  const nextX = player.x + dx;
  const nextY = player.y + dy;

  if (!collidesWithWalls(nextX, player.y) && !collidesWithDoor(nextX, player.y)) {
    player.x = nextX;
  }
  if (!collidesWithWalls(player.x, nextY) && !collidesWithDoor(player.x, nextY)) {
    player.y = nextY;
  }

  player.x = constrain(player.x, player.r, WORLD_W - player.r);
  player.y = constrain(player.y, player.r, WORLD_H - player.r);
}

function collidesWithWalls(cx, cy) {
  if (gameState !== "tutorial" && tileMapData && tileMapData.tiles) {
    let colLeft = constrain(floor((cx - player.r) / TILE_SIZE), 0, mapCols - 1);
    let colRight = constrain(floor((cx + player.r) / TILE_SIZE), 0, mapCols - 1);
    let rowTop = constrain(floor((cy - player.r) / TILE_SIZE), 0, mapRows - 1);
    let rowBottom = constrain(floor((cy + player.r) / TILE_SIZE), 0, mapRows - 1);

    for (let r = rowTop; r <= rowBottom; r++) {
      let line = tileMapData.tiles[r] || "";
      for (let c = colLeft; c <= colRight; c++) {
        let ch = line[c] || ".";
        if ("LRUBNESWCT".indexOf(ch) !== -1) {
          if (circleRectCollision(cx, cy, player.r, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  for (let wall of walls) {
    if (circleRectCollision(cx, cy, player.r, wall.x, wall.y, wall.w, wall.h)) return true;
  }
  return false;
}

function collidesWithDoor(cx, cy) {
  if (door.isOpen) return false;
  return circleRectCollision(cx, cy, player.r, door.x, door.y, door.w, door.h);
}

function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
  let closestX = constrain(cx, rx, rx + rw);
  let closestY = constrain(cy, ry, ry + rh);
  let dx = cx - closestX;
  let dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

// ---------------------------------------------------------------------
//  KEY / WIN / VAMPIRE
// ---------------------------------------------------------------------
function checkKeyPickup() {
  if (keyItem.collected) return;
  if (dist(player.x, player.y, keyItem.x, keyItem.y) < player.r + keyItem.r) {
    keyItem.collected = true;
    player.hasKey = true;
    door.isOpen = true;
  }
}

function checkWinCondition() {
  if (!player.hasKey) return;
  if (player.x > door.x + door.w &&
      player.y > door.y - player.r &&
      player.y < door.y + door.h + player.r) {
    gameState = "win";
  }
}

function updateVampire() {
  let inCone = isInFlashlight(vampire.x, vampire.y);

  if (vampire.state === "chasing") {
    if (inCone) {
      if (!vampire.wasInCone) {
        vampire.shakeStartTime = millis();
        playOneShot(seenSound, seenReady, 0.7); // metal shriek scare
      }
      vampire.state = "stunned";
      vampire.stunTimer = millis();
    } else {
      // Phases toward the player (ghostly — ignores walls so it never gets stuck).
      let dx = player.x - vampire.x;
      let dy = player.y - vampire.y;
      let d = sqrt(dx * dx + dy * dy);
      if (d > 0) {
        let vSpeed = PLAYER_SPEED * 0.7;
        vampire.x += (dx / d) * vSpeed;
        vampire.y += (dy / d) * vSpeed;
      }
    }
  } else if (vampire.state === "stunned") {
    if (millis() - vampire.stunTimer >= 2000) vampire.state = "chasing";
  }

  vampire.wasInCone = inCone;
}

function checkVampireCatch() {
  if (dist(player.x, player.y, vampire.x, vampire.y) < 30) {
    gameState = "gameover";
    playOneShot(gameoverSound, gameoverReady, 0.7); // quick lose sting
  }
}

// ---------------------------------------------------------------------
//  DRAWING — WORLD
// ---------------------------------------------------------------------
function drawRoom() {
  if (!(tileMapData && tileMapData.tiles)) return;

  for (let row = 0; row < mapRows; row++) {
    let line = tileMapData.tiles[row] || "";
    for (let col = 0; col < mapCols; col++) {
      let x = col * TILE_SIZE;
      let y = row * TILE_SIZE;
      if (tileFloorImg) image(tileFloorImg, x, y, TILE_SIZE, TILE_SIZE);

      let ch = line[col] || ".";
      let rotationAngle = 0;
      let isWall = false, isCorner = false;

      if (ch === "L" || ch === "B" || ch === "R" || ch === "U") {
        isWall = true;
        if (ch === "L") rotationAngle = 0;
        else if (ch === "U") rotationAngle = HALF_PI;
        else if (ch === "R") rotationAngle = PI;
        else if (ch === "B") rotationAngle = PI + HALF_PI;
      } else if (ch === "N" || ch === "E" || ch === "S" || ch === "W") {
        isCorner = true;
        if (ch === "N") rotationAngle = 0;
        else if (ch === "E") rotationAngle = HALF_PI;
        else if (ch === "S") rotationAngle = PI;
        else if (ch === "W") rotationAngle = PI + HALF_PI;
      } else if (ch === "C") {
        isCorner = true;
        rotationAngle = 0;
      }

      if (isWall) {
        drawTile(tileWallImg, x, y, rotationAngle, color(100, 100, 170));
      } else if (isCorner) {
        drawTile(tileCornerImg, x, y, rotationAngle, color(140, 120, 200));
      } else if (ch === "T") {
        drawTile(tableImg, x, y, 0, color(139, 90, 43));
      }
    }
  }
}

function drawTile(img, x, y, rotationAngle, fallback) {
  push();
  translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
  if (rotationAngle) rotate(rotationAngle);
  if (img && img.width) {
    image(img, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
  } else {
    noStroke();
    fill(fallback);
    rect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
  }
  pop();
}

function drawTutorialRoom() {
  const rx = 100, ry = 140;
  const cols = 15, rows = 13;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let x = rx + col * TILE_SIZE;
      let y = ry + row * TILE_SIZE;
      if (tileFloorImg) image(tileFloorImg, x, y, TILE_SIZE, TILE_SIZE);

      let isWall = (row === 0 || row === rows - 1 || col === 0);
      let isDoorOpening = (col === cols - 1 && row >= 5 && row <= 7);
      if (col === cols - 1 && !isDoorOpening) isWall = true;
      if (isWall) drawTile(tileWallImg, x, y, 0, color(100, 100, 170));
    }
  }
  for (let tbl of tables) drawTile(tableImg, tbl.x, tbl.y, 0, color(139, 90, 43));
}

function drawKey() {
  if (keyItem.collected) return;
  if (!isInFlashlight(keyItem.x, keyItem.y)) return;
  push();
  translate(keyItem.x, keyItem.y);
  // soft pulsing glow so it stands out when the beam sweeps over it
  noStroke();
  let pulse = 0.5 + 0.5 * sin(millis() / 250);
  fill(255, 220, 90, 55 + 55 * pulse);
  ellipse(0, 0, 72 + 12 * pulse);
  imageMode(CENTER);
  if (keyImg && keyImg.width) image(keyImg, 0, 0, 58, 58);
  else { fill(240, 210, 80); ellipse(0, 0, 42); }
  pop();
}

function drawDoor() {
  push();
  let pulse = 0.5 + 0.5 * sin(millis() / 300);

  // Glow aura so the exit is obvious from across the room.
  noStroke();
  if (door.isOpen) fill(70, 220, 130, 70 + 70 * pulse);
  else fill(220, 60, 60, 70 + 70 * pulse);
  rect(door.x - 10, door.y - 10, door.w + 20, door.h + 20, 10);

  if (doorImg && doorImg.width) {
    imageMode(CORNER);
    image(doorImg, door.x, door.y, door.w, door.h);
    // tint shows locked (red) vs unlocked (green)
    noStroke();
    if (door.isOpen) fill(60, 230, 120, 60);
    else fill(220, 50, 50, 75);
    rect(door.x, door.y, door.w, door.h);
  } else {
    fill(door.isOpen ? color(80, 200, 120) : color(200, 80, 80));
    rect(door.x, door.y, door.w, door.h, 4);
    if (!door.isOpen) { fill(120); rect(door.x + 8, door.y + door.h / 2, 8, 36, 4); }
  }
  pop();
}

function drawPlayer() {
  let angle = atan2(mouseY + camera.y - player.y, mouseX + camera.x - player.x);
  imageMode(CENTER);
  push();
  translate(player.x, player.y);
  rotate(angle);
  if (playerImg && playerImg.width) image(playerImg, 0, 0, player.r * 2.4, player.r * 2.4);
  else { noStroke(); fill(220); ellipse(0, 0, player.r * 2); }
  pop();
}

function drawVampire() {
  if (!isInFlashlight(vampire.x, vampire.y)) return;
  let angle = atan2(player.y - vampire.y, player.x - vampire.x);
  imageMode(CENTER);
  push();
  translate(vampire.x, vampire.y);
  rotate(angle);
  if (vampireImg && vampireImg.width) image(vampireImg, 0, 0, vampire.r * 2.4, vampire.r * 2.4);
  else { noStroke(); fill(150, 20, 20); ellipse(0, 0, vampire.r * 2); }
  pop();
}

// ---------------------------------------------------------------------
//  LIGHTING (smooth, corner-aware visibility polygon + soft edge)
// ---------------------------------------------------------------------
function getNearbyOccluders() {
  let list = [];
  let range = FLASHLIGHT_DISTANCE + TILE_SIZE;
  for (let w of walls) {
    let nx = constrain(player.x, w.x, w.x + w.w);
    let ny = constrain(player.y, w.y, w.y + w.h);
    if (dist(player.x, player.y, nx, ny) <= range) list.push(w);
  }
  if (!door.isOpen) {
    let nx = constrain(player.x, door.x, door.x + door.w);
    let ny = constrain(player.y, door.y, door.y + door.h);
    if (dist(player.x, player.y, nx, ny) <= range) list.push(door);
  }
  return list;
}

// Sample angles (relative to aim direction) — a smooth fan plus rays aimed
// just past every nearby corner so the light wraps tightly around desks.
function buildLightDeltas(cx, cy, targetAngle, occluders) {
  let half = FLASHLIGHT_ANGLE / 2;
  let deltas = [-half, half];

  const fan = 56;
  for (let i = 0; i <= fan; i++) deltas.push(-half + FLASHLIGHT_ANGLE * (i / fan));

  const eps = 0.0009;
  for (let o of occluders) {
    let corners = [
      [o.x, o.y], [o.x + o.w, o.y],
      [o.x, o.y + o.h], [o.x + o.w, o.y + o.h],
    ];
    for (let c of corners) {
      if (dist(cx, cy, c[0], c[1]) > FLASHLIGHT_DISTANCE + 4) continue;
      let d = angleDifference(atan2(c[1] - cy, c[0] - cx), targetAngle);
      if (d < -half - 0.02 || d > half + 0.02) continue;
      deltas.push(constrain(d, -half, half));
      deltas.push(constrain(d - eps, -half, half));
      deltas.push(constrain(d + eps, -half, half));
    }
  }
  deltas.sort((a, b) => a - b);
  return deltas;
}

function drawFog() {
  let cxw = player.x, cyw = player.y;
  let targetAngle = atan2(mouseY + camera.y - cyw, mouseX + camera.x - cxw);

  // Darker ambient overall. This stays constant during a flicker so only the
  // flashlight beam drops out — the room doesn't go pitch black.
  const FOG_ALPHA = 236;

  fogLayer.clear();
  fogLayer.noStroke();
  fogLayer.fill(0, FOG_ALPHA);
  fogLayer.rect(0, 0, CANVAS_W, CANVAS_H);

  if (!lightOn) {
    image(fogLayer, 0, 0); // beam flickered off — ambient unchanged
    return;
  }

  let occ = getNearbyOccluders();
  let deltas = buildLightDeltas(cxw, cyw, targetAngle, occ);

  let pts = [];
  for (let d of deltas) {
    let p = traceRay(cxw, cyw, targetAngle + d, occ);
    pts.push({ x: p.x - camera.x, y: p.y - camera.y });
  }
  let cx = cxw - camera.x, cy = cyw - camera.y;

  // Carve the lit cone out of the fog with a soft feathered edge (wrap light).
  let ctx = fogLayer.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.filter = "blur(5px)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  for (let p of pts) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  image(fogLayer, 0, 0);

  // Warm radial glow clipped to the same polygon.
  let g = drawingContext.createRadialGradient(cx, cy, 0, cx, cy, FLASHLIGHT_DISTANCE);
  g.addColorStop(0,   "rgba(255, 226, 150, 0.22)");
  g.addColorStop(0.5, "rgba(255, 210, 120, 0.10)");
  g.addColorStop(1,   "rgba(255, 200, 100, 0.0)");
  drawingContext.save();
  drawingContext.fillStyle = g;
  drawingContext.beginPath();
  drawingContext.moveTo(cx, cy);
  for (let p of pts) drawingContext.lineTo(p.x, p.y);
  drawingContext.closePath();
  drawingContext.fill();
  drawingContext.restore();
}

function traceRay(startX, startY, angle, occluders) {
  let rayX = cos(angle), rayY = sin(angle);
  let closestDist = FLASHLIGHT_DISTANCE;
  let list = occluders || walls;
  for (let wall of list) {
    let hit = rayAABBIntersection(startX, startY, rayX, rayY, wall);
    if (hit && hit.dist < closestDist) closestDist = hit.dist;
  }
  return { x: startX + rayX * closestDist, y: startY + rayY * closestDist };
}

function rayAABBIntersection(startX, startY, dirX, dirY, wall) {
  let tMin = 0, tMax = FLASHLIGHT_DISTANCE;
  if (abs(dirX) > 0.001) {
    let t1 = (wall.x - startX) / dirX;
    let t2 = (wall.x + wall.w - startX) / dirX;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = max(tMin, t1); tMax = min(tMax, t2);
  } else if (startX < wall.x || startX > wall.x + wall.w) {
    return null;
  }
  if (abs(dirY) > 0.001) {
    let t1 = (wall.y - startY) / dirY;
    let t2 = (wall.y + wall.h - startY) / dirY;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = max(tMin, t1); tMax = min(tMax, t2);
  } else if (startY < wall.y || startY > wall.y + wall.h) {
    return null;
  }
  if (tMin <= tMax && tMin > 0.1) return { dist: tMin };
  return null;
}

function isInFlashlight(x, y) {
  if (!lightOn) return false;
  let targetAngle = atan2(mouseY + camera.y - player.y, mouseX + camera.x - player.x);
  let pointAngle = atan2(y - player.y, x - player.x);
  let angleDiff = abs(angleDifference(pointAngle, targetAngle));
  let distance = dist(player.x, player.y, x, y);
  if (distance >= FLASHLIGHT_DISTANCE || angleDiff >= FLASHLIGHT_ANGLE / 2) return false;

  for (let wall of walls) {
    if (isLineRectIntersecting(player.x, player.y, x, y, wall)) return false;
  }
  if (!door.isOpen && isLineRectIntersecting(player.x, player.y, x, y, door)) return false;
  return true;
}

function isLineRectIntersecting(x1, y1, x2, y2, wall) {
  if (lineIntersect(x1, y1, x2, y2, wall.x, wall.y, wall.x + wall.w, wall.y)) return true;
  if (lineIntersect(x1, y1, x2, y2, wall.x, wall.y + wall.h, wall.x + wall.w, wall.y + wall.h)) return true;
  if (lineIntersect(x1, y1, x2, y2, wall.x, wall.y, wall.x, wall.y + wall.h)) return true;
  if (lineIntersect(x1, y1, x2, y2, wall.x + wall.w, wall.y, wall.x + wall.w, wall.y + wall.h)) return true;
  if (x1 >= wall.x && x1 <= wall.x + wall.w && y1 >= wall.y && y1 <= wall.y + wall.h) return true;
  if (x2 >= wall.x && x2 <= wall.x + wall.w && y2 >= wall.y && y2 <= wall.y + wall.h) return true;
  return false;
}

function lineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  let denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (abs(denom) < 0.0001) return false;
  let ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  let ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

function angleDifference(a, b) {
  let diff = a - b;
  while (diff < -PI) diff += TWO_PI;
  while (diff > PI) diff -= TWO_PI;
  return diff;
}

// ---------------------------------------------------------------------
//  SCREENS / UI
// ---------------------------------------------------------------------
function drawStartScreen() {
  background(0);
  // faint blood-mist vignette
  noStroke();
  for (let i = 0; i < 3; i++) {
    fill(40 + i * 10, 0, 0, 18);
    ellipse(width / 2, height / 2 - 40, 700 - i * 140, 460 - i * 90);
  }

  textAlign(CENTER, CENTER);

  // Title — large red vampire font, sized to fit
  textFont(TITLE_FONT);
  let size = 100;
  textSize(size);
  while (textWidth("HEAR NO EVIL") > width - 70 && size > 40) {
    size -= 2; textSize(size);
  }
  fill(35, 0, 0);
  text("HEAR NO EVIL", width / 2 + 5, height / 2 - 86 + 5);
  fill(170, 14, 14);
  text("HEAR NO EVIL", width / 2, height / 2 - 86);

  textFont("monospace");
  fill(150, 30, 30);
  textSize(16);
  text("you cannot hear what hunts you", width / 2, height / 2 - 6);

  let a = 150 + 105 * sin(millis() / 400);
  fill(220, 220, 220, a);
  textSize(22);
  text("press SPACE to begin", width / 2, height / 2 + 70);
  textAlign(LEFT, BASELINE);
}

function drawTutorialIntro() {
  push();
  noStroke();
  fill(0, 150);
  rect(0, 0, width, height);

  let bw = 600, bh = 240;
  let bx = width / 2 - bw / 2, by = height / 2 - bh / 2;
  fill(45);
  stroke(95);
  strokeWeight(2);
  rect(bx, by, bw, bh, 10);
  noStroke();

  textAlign(CENTER, CENTER);
  textFont("monospace");
  fill(255);
  textSize(25);
  text("Find the key to escape", width / 2, by + 58);
  text("and remember to watch your back", width / 2, by + 94);

  fill(190);
  textSize(15);
  text("WASD to move   •   move your cursor to aim the light", width / 2, by + 150);

  let a = 150 + 105 * sin(millis() / 400);
  fill(215, 215, 215, a);
  text("press SPACE or click to continue", width / 2, by + 195);
  pop();
  textAlign(LEFT, BASELINE);
}

function drawTutorialUI() {
  if (!tutorialIntroDismissed) return;
  noStroke();
  textFont("monospace");
  fill(255, 210);
  textSize(22);
  textAlign(CENTER, BASELINE);
  text("WASD to move and cursor to see", width / 2, height - 26);
  textAlign(LEFT, BASELINE);
}

function drawUI() {
  noStroke();
  textFont("monospace");
  fill(240);
  textSize(16);
  textAlign(LEFT, BASELINE);
  text("Move: WASD / Arrows", 18, 28);
  text("Look: cursor", 18, 50);

  textAlign(RIGHT, BASELINE);
  if (player.hasKey) { fill(120, 220, 120); text("Key: obtained", width - 18, 28); }
  else { fill(220, 120, 120); text("Key: missing", width - 18, 28); }

  fill(255, 200);
  textAlign(CENTER, BASELINE);
  textSize(14);
  if (!player.hasKey) text("The locked door glows red until you find the key.", width / 2, height - 24);
  else text("Door unlocked — slip through the green opening to escape.", width / 2, height - 24);
  textAlign(LEFT, BASELINE);
}

function drawWinScreen() {
  push();
  fill(0, 200);
  rect(0, 0, width, height);
  textAlign(CENTER, CENTER);
  fill(220);
  textFont(TITLE_FONT);
  textSize(64);
  text("You Escaped", width / 2, height / 2 - 20);
  textFont("monospace");
  fill(255);
  textSize(20);
  text("Press R to play again", width / 2, height / 2 + 50);
  pop();
  textAlign(LEFT, BASELINE);
}

function drawGameOverScreen() {
  push();
  if (deathImg && deathImg.width) {
    imageMode(CORNER);
    image(deathImg, 0, 0, width, height);
  }
  noStroke();
  fill(0, 160);
  rect(0, 0, width, height);

  textAlign(CENTER, CENTER);
  fill(190, 25, 25);
  textFont(TITLE_FONT);
  textSize(64);
  text("You Were Caught", width / 2, height / 2 - 20);
  textFont("monospace");
  fill(255);
  textSize(20);
  text("Press R to try again", width / 2, height / 2 + 50);
  pop();
  textAlign(LEFT, BASELINE);
}

// ---------------------------------------------------------------------
//  TRANSITION (smooth room-to-room fade)
// ---------------------------------------------------------------------
function checkTutorialCompletion() {
  if (fadeActive || !player.hasKey) return;
  if (player.x > door.x + door.w &&
      player.y > door.y - player.r &&
      player.y < door.y + door.h + player.r) {
    startFade(() => initGame());
  }
}

function startFade(cb) {
  fadeActive = true;
  fadePhase = "out";
  fadeAlpha = 0;
  fadeCallback = cb;
}

function drawFade() {
  if (!fadeActive) return;
  if (fadePhase === "out") {
    fadeAlpha += 12;
    if (fadeAlpha >= 255) {
      fadeAlpha = 255;
      if (fadeCallback) { fadeCallback(); fadeCallback = null; }
      fadePhase = "in";
    }
  } else if (fadePhase === "in") {
    fadeAlpha -= 12;
    if (fadeAlpha <= 0) { fadeAlpha = 0; fadeActive = false; fadePhase = ""; }
  }
  push();
  noStroke();
  fill(0, fadeAlpha);
  rect(0, 0, width, height);
  pop();
}

// ---------------------------------------------------------------------
//  INPUT
// ---------------------------------------------------------------------
function handleAdvance() {
  if (gameState === "start") { startAudio(); initTutorial(); return; }
  if (gameState === "tutorial" && !tutorialIntroDismissed) { tutorialIntroDismissed = true; return; }
}

function keyPressed() {
  if (key && key.length === 1) pressedKeys[key] = true;
  if (key === " " || keyCode === 32) handleAdvance();
  if ((key === "r" || key === "R") && (gameState === "win" || gameState === "gameover")) restartGame();
}

function keyReleased() {
  if (key && key.length === 1) pressedKeys[key] = false;
}

function mousePressed() {
  handleAdvance();
}
