# Hear No Evil

A flashlight horror escape. You play a deaf man trapped in a building stalked by
a vampire. Because you can't hear well, the world's sound is muffled and quiet —
the vampire's whisper only rises as it draws near. Aim your flashlight to freeze
it, find the key, and escape.

## Setup and Interaction Instructions

Open `index.html` in Google Chrome using Live Server (audio requires a click or
key press to start, which the start screen handles).

**Controls:**

- Move: WASD or Arrow keys
- Look / aim flashlight: move the cursor
- Begin / advance prompts: Spacebar or click
- Restart (after win or game over): R

Press SPACE on the title screen, read the warning, then play the short tutorial
room. Walking out the tutorial door fades you straight into the main building.
Find the key (it glows in your light), watch your back, and reach the door on the
far side. Catch the vampire in your flashlight beam to stun it. The beam flickers
out very rarely — when it does, you are blind for a moment.

## File / asset layout

```
index.html
sketch.js
style.css
libraries/p5.js
libraries/p5.sound.min.js
data/blocks.json
assets/images/  (wall.png, corner.png, floor.png, mainguy2.png, Vampire.png, key.png, table.png, death.png, Door.png)
assets/sounds/  (scarymusic.mp3, whisper.mp3, seen.mp3, gameover.mp3, footstep1.mp3, footstep2.mp3, breathing.mp3)
```

Directional audio: the vampire's whisper is panned to the side he's actually on,
and the left ear only hears about 60% of it (that ear is more deaf). Use
headphones to feel it. Panning is left/right only, so it tells you his side, not
whether he's above or below you.

| File                           | Purpose                                                    | Source                                           |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------ |
| `assets/sounds/scarymusic.mp3` | Quiet, muffled background score (looped).                  | https://youtu.be/7ifWmw6U2dE?si=sjZFYGp-G1oG_V4K |
| `assets/sounds/whisper.mp3`    | Vampire whisper, looped, proximity + directional volume.   | https://www.youtube.com/watch?v=7JOEKMiHJn0      |
| `assets/sounds/seen.mp3`       | Metal-shriek sting when the vampire is caught in the beam. | https://www.youtube.com/watch?v=A9eHuIJ5M3o      |
| `assets/sounds/gameover.mp3`   | Quick lose sting when you're caught / game over.           | https://www.youtube.com/watch?v=A9eHuIJ5M3o      |
| `assets/sounds/footstep1.mp3`  | Footstep A, alternates with B while moving.                | (add source)                                     |
| `assets/sounds/footstep2.mp3`  | Footstep B, alternates with A while moving.                | (add source)                                     |
| `assets/sounds/breathing.mp3`  | Scared breathing, looped, louder while moving.             | (add source)                                     |

Drop your own `.mp3` files into `assets/sounds/`. If any are missing the game
still runs — it just plays without that sound. The door art goes in
`assets/images/Door.png`.
