import React, { useEffect, useRef, useState } from 'react';

interface VisualizerProps {
  audioElement: HTMLAudioElement | null;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  characterImageSrc: string | null;
  onScoreUpdate: (score: number) => void;
}

// --- Game Engine Constants ---
const CANVAS_WIDTH = 480; // Widescreen-ish internal resolution
const CANVAS_HEIGHT = 270;
const GRAVITY = 0.6;
const JUMP_FORCE = -10;
const GROUND_HEIGHT = 40;
const SPAWN_X = CANVAS_WIDTH + 50;

// --- Game Entities ---
type EntityType = 'obstacle' | 'coin';

interface Entity {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: EntityType;
  color: string;
  collected?: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ 
  audioElement, 
  analyser, 
  isPlaying, 
  characterImageSrc,
  onScoreUpdate 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const characterImgRef = useRef<HTMLImageElement | null>(null);

  // --- Game State (Refs for performance loop) ---
  const gameState = useRef({
    // Physics
    playerY: CANVAS_HEIGHT - GROUND_HEIGHT,
    playerVelY: 0,
    isJumping: false,
    groundY: CANVAS_HEIGHT - GROUND_HEIGHT,
    
    // World
    scrollSpeed: 4,
    distance: 0,
    
    // Entities
    entities: [] as Entity[],
    nextId: 0,
    
    // Spawning Logic
    bassCooldown: 0,
    trebleCooldown: 0,
    
    // Meta
    score: 0,
    gameOver: false,
    gameTime: 0
  });

  // --- Image Loader ---
  useEffect(() => {
    if (characterImageSrc) {
        const img = new Image();
        img.src = characterImageSrc;
        img.onload = () => { characterImgRef.current = img; };
    } else {
        characterImgRef.current = null;
    }
  }, [characterImageSrc]);

  // --- Input Handling ---
  useEffect(() => {
    const handleInput = (e: KeyboardEvent | TouchEvent | MouseEvent) => {
        if (!isPlaying || gameState.current.gameOver) return;
        
        // Prevent scrolling on spacebar
        if (e instanceof KeyboardEvent && e.code === 'Space') {
            e.preventDefault();
        }

        // Jump Logic
        const state = gameState.current;
        if (!state.isJumping) {
            state.playerVelY = JUMP_FORCE;
            state.isJumping = true;
        } else if (state.playerY > state.groundY - 50) {
            // Double jump allowance if near ground (forgiveness)
            // state.playerVelY = JUMP_FORCE * 0.8;
        }
    };

    window.addEventListener('keydown', handleInput);
    window.addEventListener('touchstart', handleInput);
    window.addEventListener('mousedown', handleInput);

    return () => {
        window.removeEventListener('keydown', handleInput);
        window.removeEventListener('touchstart', handleInput);
        window.removeEventListener('mousedown', handleInput);
    };
  }, [isPlaying]);

  // --- Reset Game on Song Change/Play ---
  useEffect(() => {
      const state = gameState.current;
      if (!isPlaying) {
          // Pause or Stop
          return;
      }
      
      // Reset if game over or starting fresh
      if (state.gameOver || state.gameTime === 0) {
        state.playerY = CANVAS_HEIGHT - GROUND_HEIGHT;
        state.playerVelY = 0;
        state.isJumping = false;
        state.entities = [];
        state.score = 0;
        state.gameOver = false;
        state.gameTime = 0;
        onScoreUpdate(0);
      }
  }, [isPlaying, onScoreUpdate]);


  // --- Main Game Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    // Audio Data Buffers
    const bufferLength = analyser ? analyser.frequencyBinCount : 0;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      const state = gameState.current;

      // 1. Audio Analysis (Driving the Game)
      let bass = 0;
      let treble = 0;
      let volume = 0;

      if (isPlaying && analyser && !state.gameOver) {
        analyser.getByteFrequencyData(dataArray);

        // Calculate Bass (Low freqs)
        const bassEnd = Math.floor(bufferLength * 0.15);
        let bassSum = 0;
        for (let i = 0; i < bassEnd; i++) bassSum += dataArray[i];
        bass = bassSum / bassEnd;

        // Calculate Treble (High freqs)
        const trebleStart = Math.floor(bufferLength * 0.7);
        let trebleSum = 0;
        for (let i = trebleStart; i < bufferLength; i++) trebleSum += dataArray[i];
        treble = trebleSum / (bufferLength - trebleStart);

        // Volume (for speed modulation)
        let total = 0;
        for(let i = 0; i < bufferLength; i++) total += dataArray[i];
        volume = total / bufferLength / 255; 

        // Modulate Speed
        state.scrollSpeed = 3 + (volume * 4); // Speed ranges from 3 to 7
      }

      // 2. Physics & Logic (Only if playing)
      if (isPlaying && !state.gameOver) {
        state.gameTime++;
        
        // Gravity
        state.playerVelY += GRAVITY;
        state.playerY += state.playerVelY;

        // Ground Collision
        if (state.playerY >= state.groundY) {
            state.playerY = state.groundY;
            state.playerVelY = 0;
            state.isJumping = false;
        }

        // Spawning Logic
        if (state.bassCooldown > 0) state.bassCooldown--;
        if (state.trebleCooldown > 0) state.trebleCooldown--;

        // Spawn Obstacle on Bass Beat
        // Threshold needs to be tuned. 140-160 is a decent distinct beat.
        if (bass > 155 && state.bassCooldown === 0) {
            state.entities.push({
                id: state.nextId++,
                x: SPAWN_X,
                y: state.groundY - 30,
                w: 24,
                h: 30,
                type: 'obstacle',
                color: '#ff4081' // Hot Pink Spike
            });
            state.bassCooldown = 25; // Frames between spawns
        }

        // Spawn Coin on Treble Beat
        if (treble > 100 && state.trebleCooldown === 0) {
            // Random height for coins
            const height = Math.random() > 0.5 ? 80 : 140; 
            state.entities.push({
                id: state.nextId++,
                x: SPAWN_X,
                y: state.groundY - height,
                w: 20,
                h: 20,
                type: 'coin',
                color: '#ffff00' // Yellow Coin
            });
            state.trebleCooldown = 15;
        }

        // Update Entities
        for (let i = state.entities.length - 1; i >= 0; i--) {
            const ent = state.entities[i];
            ent.x -= state.scrollSpeed;

            // Collision Detection (AABB)
            const playerW = 30;
            const playerH = 40;
            // Player hitbox is centered horizontally around CANVAS_WIDTH/4
            const playerX = CANVAS_WIDTH / 4 - playerW/2;
            const playerY_Top = state.playerY - playerH;

            if (!ent.collected && 
                playerX < ent.x + ent.w &&
                playerX + playerW > ent.x &&
                playerY_Top < ent.y + ent.h &&
                playerY_Top + playerH > ent.y) {
                
                if (ent.type === 'coin') {
                    ent.collected = true;
                    state.score += 50;
                    onScoreUpdate(state.score);
                } else if (ent.type === 'obstacle') {
                    state.gameOver = true;
                    // Game Over Effect?
                }
            }

            // Remove off-screen
            if (ent.x < -50 || ent.collected) {
                state.entities.splice(i, 1);
            }
        }
        
        // Passive Score
        if (state.gameTime % 10 === 0) {
            state.score += 1;
            onScoreUpdate(state.score);
        }
      }

      // 3. Drawing
      
      // Clear Background (Sky)
      ctx.fillStyle = '#b2ebf2'; 
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Spectrum (Sky Visualization)
      if (analyser) {
          drawSkySpectrum(ctx, dataArray, bufferLength);
      }

      // Draw Ground
      // Create a scrolling grid effect on ground
      const groundOffset = (state.gameTime * state.scrollSpeed) % 40;
      ctx.fillStyle = '#80deea';
      ctx.fillRect(0, state.groundY, CANVAS_WIDTH, GROUND_HEIGHT);
      
      // Ground Grid Lines
      ctx.fillStyle = '#4dd0e1';
      for (let i = -groundOffset; i < CANVAS_WIDTH; i += 40) {
          ctx.fillRect(i, state.groundY, 2, GROUND_HEIGHT);
      }
      ctx.fillRect(0, state.groundY, CANVAS_WIDTH, 4); // Top border line

      // Draw Entities
      state.entities.forEach(ent => {
          if (ent.collected) return;
          if (ent.type === 'obstacle') {
              // Draw Spike
              ctx.fillStyle = ent.color;
              ctx.beginPath();
              ctx.moveTo(ent.x, ent.y + ent.h);
              ctx.lineTo(ent.x + ent.w/2, ent.y);
              ctx.lineTo(ent.x + ent.w, ent.y + ent.h);
              ctx.fill();
          } else {
              // Draw Coin (Star shape)
              drawPixelStar(ctx, ent.x + ent.w/2, ent.y + ent.h/2, ent.w, ent.color);
          }
      });

      // Draw Player
      const pX = CANVAS_WIDTH / 4;
      const pY = state.playerY;
      
      if (state.gameOver) {
          // Dead Animation (Spin or fall)
           ctx.save();
           ctx.translate(pX, pY - 20);
           ctx.rotate(Math.PI / 4);
           drawSnowman(ctx, 0, 0, 0, 0, true);
           ctx.restore();
           
           // Draw Game Over Text
           ctx.fillStyle = 'rgba(0,0,0,0.5)';
           ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
           
           ctx.fillStyle = '#fff';
           ctx.font = '30px "VT323", monospace';
           ctx.textAlign = 'center';
           ctx.fillText("GAME OVER", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 - 10);
           ctx.font = '20px "VT323", monospace';
           ctx.fillText("Reload Song or Click Play to Retry", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 20);

      } else {
          // Normal Draw
          if (characterImgRef.current) {
              drawCustomCharacter(ctx, characterImgRef.current, pX, pY, state.isJumping, state.gameTime);
          } else {
              drawSnowman(ctx, pX, pY, volume, state.gameTime, false);
          }
      }

      animationRef.current = requestAnimationFrame(update);
    };

    update();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [analyser, isPlaying, onScoreUpdate]);

  // --- Drawing Helpers ---

  const drawSkySpectrum = (ctx: CanvasRenderingContext2D, data: Uint8Array, length: number) => {
    if (length === 0) return;
    const bars = 16;
    const step = Math.floor(length / bars);
    const width = CANVAS_WIDTH / bars;
    
    for (let i = 0; i < bars; i++) {
        let val = 0;
        for (let j = 0; j < step; j++) {
            val = Math.max(val, data[i * step + j]);
        }
        
        const height = (val / 255) * (CANVAS_HEIGHT / 2);
        
        // Draw hanging bars from top
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(i * width + 2, 0, width - 4, height);
        
        // Draw visualizer blocks in sky
        if (val > 100) {
             ctx.fillStyle = i % 2 === 0 ? '#ff80ab' : '#ffff8d';
             ctx.fillRect(i * width + 4, height + 5, width - 8, 4);
        }
    }
  };

  const drawCustomCharacter = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, isJumping: boolean, time: number) => {
    ctx.save();
    ctx.translate(x, y);
    
    // Bounce if running
    if (!isJumping) {
        ctx.translate(0, Math.sin(time * 0.5) * 3);
    }
    
    const size = 50;
    const ratio = Math.min(size / img.width, size / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    
    // Anchor at bottom center
    ctx.drawImage(img, -w/2, -h, w, h);
    ctx.restore();
  };

  const drawSnowman = (ctx: CanvasRenderingContext2D, x: number, y: number, volume: number, time: number, isDead: boolean) => {
    ctx.save();
    ctx.translate(x, y); // x,y is bottom center feet position

    // Running bounce
    if (!isDead && y >= CANVAS_HEIGHT - GROUND_HEIGHT) {
        ctx.translate(0, Math.sin(time * 0.4) * 2);
    }

    const scale = 0.6;
    ctx.scale(scale, scale);

    const drawSnowball = (yOffset: number, size: number) => {
        const s = size;
        const corner = 4; 
        ctx.fillStyle = '#FFFFFF';
        // Main block
        ctx.fillRect(-s/2 + corner, yOffset - s/2, s - 2*corner, s);
        ctx.fillRect(-s/2, yOffset - s/2 + corner, s, s - 2*corner);
        ctx.fillRect(-s/2 + 2, yOffset - s/2 + 2, s - 4, s - 4);
        
        // Shading
        ctx.fillStyle = '#80cbc4'; 
        ctx.fillRect(-s/2 + 6, yOffset + s/2 - 6, s - 12, 2);
    };

    // Body
    drawSnowball(-37, 74); 

    // Buttons
    ctx.fillStyle = '#7e57c2';
    ctx.fillRect(-3, -47, 6, 6);
    ctx.fillRect(-3, -22, 6, 6);

    // Head
    const headY = -92;
    drawSnowball(headY, 56); 

    // Face
    ctx.fillStyle = '#7e57c2';
    if (isDead) {
        // X eyes
        ctx.strokeStyle = '#7e57c2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Left eye
        ctx.moveTo(-18, headY - 8); ctx.lineTo(-10, headY);
        ctx.moveTo(-10, headY - 8); ctx.lineTo(-18, headY);
        // Right eye
        ctx.moveTo(10, headY - 8); ctx.lineTo(18, headY);
        ctx.moveTo(18, headY - 8); ctx.lineTo(10, headY);
        ctx.stroke();
    } else {
        ctx.fillRect(-14, headY - 8, 8, 8);
        ctx.fillRect(6, headY - 8, 8, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-12, headY - 6, 2, 2);
        ctx.fillRect(8, headY - 6, 2, 2);
    }

    // Nose
    ctx.fillStyle = '#ffb74d';
    ctx.beginPath();
    ctx.moveTo(0, headY + 4);
    ctx.lineTo(16, headY + 6); 
    ctx.lineTo(0, headY + 10);
    ctx.fill();

    // Scarf
    ctx.fillStyle = '#ff4081';
    const neckY = -65;
    ctx.fillRect(-20, neckY - 4, 40, 10); 
    
    // Scarf Tail (Flowing back)
    ctx.fillRect(-25, neckY, 15, 6);
    
    // Arms (Running swing)
    ctx.strokeStyle = '#8d6e63'; 
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    const armSwing = Math.sin(time * 0.4);
    
    ctx.beginPath();
    ctx.moveTo(-28, -45); 
    ctx.lineTo(-28 + Math.cos(armSwing + 2) * 30, -45 + Math.sin(armSwing + 2) * 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(28, -45); 
    ctx.lineTo(28 + Math.cos(-armSwing - 1) * 30, -45 + Math.sin(-armSwing - 1) * 30);
    ctx.stroke();

    // Hat
    ctx.translate(0, headY - 26);
    ctx.fillStyle = '#3f51b5';
    ctx.fillRect(-22, 0, 44, 5); 
    ctx.fillRect(-15, -24, 30, 24); 
    ctx.fillStyle = '#80deea'; 
    ctx.fillRect(-15, -6, 30, 4);

    ctx.restore();
  };

  const drawPixelStar = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
    ctx.fillStyle = color;
    const s = size / 5;
    ctx.fillRect(x - s*0.5, y - s*2.5, s, s*5); 
    ctx.fillRect(x - s*2.5, y - s*0.5, s*5, s);
    ctx.fillRect(x - s*1.5, y - s*1.5, s*3, s*3);
  };

  return (
    <canvas 
      ref={canvasRef} 
      width={CANVAS_WIDTH} 
      height={CANVAS_HEIGHT} 
      className="w-full h-full object-contain"
    />
  );
};

export default Visualizer;