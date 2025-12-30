import React, { useState, useRef, useEffect, useMemo } from 'react';
import Visualizer from './components/Visualizer';

// --- Sub-components ---

// Y2K Star SVG Component
const ChromeStar: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" fill="currentColor"/>
  </svg>
);

const Y2KBackgroundElements: React.FC = () => {
  const elements = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      scale: 0.5 + Math.random(),
      rotate: Math.random() * 360,
      // Increased duration for slower movement (20s - 40s)
      duration: `${20 + Math.random() * 20}s`,
      delay: `${Math.random() * 5}s`,
      type: Math.random() > 0.6 ? 'star' : 'orb'
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {elements.map((el) => (
        <div
            key={el.id}
            className={`absolute transition-transform ease-in-out ${el.type === 'star' ? 'text-pink-200 animate-twinkle' : 'bg-gradient-to-br from-cyan-100 to-pink-100 blur-xl opacity-60 rounded-full animate-pulse'}`}
            style={{
                left: el.left,
                top: el.top,
                width: el.type === 'star' ? 'auto' : '120px',
                height: el.type === 'star' ? 'auto' : '120px',
                transform: `scale(${el.scale}) rotate(${el.rotate}deg)`,
                animationDuration: el.duration,
                animationDelay: el.delay,
            }}
        >
            {el.type === 'star' && <ChromeStar size={32} />}
        </div>
      ))}
    </div>
  );
};

const TopHUD: React.FC<{ score: number }> = ({ score }) => {
  return (
    <div className="absolute top-0 left-0 w-full p-6 z-20 flex justify-between items-start pointer-events-none">
      <div className="flex flex-col gap-1">
        {/* Y2K Badge Style - Straightened */}
        <div className="bg-white/80 backdrop-blur-md border-2 border-white ring-2 ring-pink-100 px-6 py-2 rounded-full shadow-[4px_4px_0px_rgba(255,128,171,0.2)]">
          <span className="text-2xl text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400 font-bold tracking-widest drop-shadow-sm" style={{ WebkitTextStroke: '0.5px #fff' }}>
            RHYTHM RUNNER
          </span>
        </div>
      </div>
      
      <div className="bg-white/80 backdrop-blur-md border-2 border-white px-6 py-2 rounded-full shadow-sm flex items-center gap-3">
         <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">SCORE</span>
            <span className="text-2xl text-slate-600 font-mono font-bold leading-none">{score.toString().padStart(6, '0')}</span>
         </div>
      </div>
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [characterImage, setCharacterImage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>("INSERT DISK");
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [score, setScore] = useState(0);

  // Audio References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Initialize Audio Context on user gesture
  const initializeAudio = () => {
    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; // Lower fftSize for snappier beat detection
      analyser.smoothingTimeConstant = 0.7;

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
    }
    
    // Resume context if suspended (browser policy)
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }

    setHasStarted(true);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setFileName(file.name);
      setScore(0); // Reset score on new file
      
      if (audioRef.current) {
        // Create object URL
        const url = URL.createObjectURL(file);
        audioRef.current.src = url;
        audioRef.current.load();
        
        // Reset play state
        setIsPlaying(false);
      }
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCharacterImage(url);
    }
  };

  const resetAvatar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCharacterImage(null);
  };

  const togglePlay = () => {
    if (!audioRef.current || !audioFile) return;

    // Ensure connection
    if (audioContextRef.current && !sourceRef.current) {
        const src = audioContextRef.current.createMediaElementSource(audioRef.current);
        src.connect(analyserRef.current!);
        analyserRef.current!.connect(audioContextRef.current.destination);
        sourceRef.current = src;
    }

    if (audioRef.current.paused) {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(e => console.error("Play failed:", e));
      audioContextRef.current?.resume();
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Setup Audio Element listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => setIsPlaying(false);
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#b2ebf2] text-slate-800 select-none font-vt323">
      
      {/* Hidden Audio Element */}
      <audio ref={audioRef} crossOrigin="anonymous" />

      {/* Main Visualizer Layer */}
      <div className="absolute inset-0 z-0 flex items-center justify-center">
         <div className="relative w-full h-full max-w-4xl max-h-[85vh]">
            <Visualizer 
                audioElement={audioRef.current}
                analyser={analyserRef.current}
                characterImageSrc={characterImage}
                isPlaying={isPlaying}
                onScoreUpdate={setScore}
            />
         </div>
      </div>

      {/* Background Decor */}
      <Y2KBackgroundElements />
      <TopHUD score={score} />
      
      {/* Soft Vignette Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(178,235,242,0.3)_100%)]"></div>

      {/* Instructions Overlay while Playing */}
      {isPlaying && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-10 pointer-events-none animate-pulse opacity-60">
             <div className="bg-black/20 text-white px-3 py-1 rounded-full text-sm font-bold tracking-widest backdrop-blur-sm">
                TAP OR SPACE TO JUMP
             </div>
          </div>
      )}

      {/* START OVERLAY (Enforces User Gesture) */}
      {!hasStarted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#b2ebf2]/80 backdrop-blur-sm">
          <button 
            onClick={initializeAudio}
            className="group relative px-12 py-6 bg-white rounded-full shadow-[6px_6px_0px_#ff80ab] hover:translate-y-1 hover:shadow-[3px_3px_0px_#ff80ab] active:translate-y-[6px] active:shadow-none active:scale-y-95 transition-all duration-200 border-2 border-pink-300"
          >
             <div className="flex flex-col items-center gap-2">
                 <span className="text-5xl text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400 font-bold tracking-widest group-hover:from-pink-300 group-hover:to-cyan-300 drop-shadow-sm">
                    START GAME
                 </span>
                 <span className="text-sm text-pink-400 font-bold tracking-wider uppercase">Ready Player One?</span>
             </div>
          </button>
        </div>
      )}

      {/* Cute Y2K UI Controls */}
      <div className={`absolute bottom-10 left-1/2 transform -translate-x-1/2 z-30 w-11/12 max-w-md transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1) ${hasStarted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20 pointer-events-none'}`}>
        
        {/* Frosted Plastic Card - Straightened */}
        <div className="bg-white/80 backdrop-blur-xl border-2 border-white ring-4 ring-pink-100 rounded-3xl shadow-xl overflow-hidden relative">
            {/* Glossy highlight at top */}
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent pointer-events-none"></div>

            <div className="p-6 relative z-10">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-200 to-cyan-200 flex items-center justify-center shadow-inner border-2 border-white text-white">
                           <span className="text-2xl drop-shadow-sm">🎮</span>
                        </div>
                        <div>
                           <h2 className="text-slate-700 text-xl leading-none font-bold tracking-wide">MUSIC ENGINE</h2>
                           <div className="flex items-center gap-1 mt-1">
                                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-300 animate-pulse' : 'bg-slate-300'}`}></div>
                                <p className="text-slate-400 text-xs font-sans font-bold uppercase">{isPlaying ? 'Running' : 'Paused'}</p>
                           </div>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-10 h-10 rounded-full bg-white hover:bg-pink-50 border-2 border-pink-100 flex items-center justify-center transition-colors text-pink-300 shadow-sm active:scale-90"
                    >
                        {isExpanded ? "−" : "+"}
                    </button>
                </div>

                {/* Expanded Controls */}
                {isExpanded && (
                    <div className="flex flex-col gap-4 animate-[fadeIn_0.4s_ease-out]">
                        
                        {/* LCD Display style for filename - Softer colors */}
                        <div className="bg-[#e0f7fa] border-inset border-2 border-[#b2ebf2] rounded-lg p-2 flex items-center gap-3 shadow-inner">
                            <span className="text-cyan-400 text-lg animate-pulse">▶</span>
                            <div className="overflow-hidden whitespace-nowrap w-full">
                                <span className="text-cyan-700 text-lg font-mono tracking-tighter uppercase inline-block animate-[marquee_10s_linear_infinite]">
                                  {fileName} *** {fileName} ***
                                </span>
                            </div>
                        </div>

                        {/* Buttons Grid */}
                        <div className="grid grid-cols-2 gap-3 font-sans">
                            {/* Upload Music Button - Lighter background, better press effect */}
                            <label className="cursor-pointer bg-gradient-to-b from-white to-slate-50 hover:to-pink-50 rounded-xl p-3 border-2 border-slate-100 hover:border-pink-200 transition-all flex flex-col items-center gap-1 group h-full shadow-[0px_4px_0px_#e2e8f0] active:shadow-none active:translate-y-[4px] active:scale-y-95">
                                <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                                <span className="text-2xl group-hover:scale-110 transition-transform">📂</span>
                                <span className="text-xs text-slate-400 font-bold uppercase group-hover:text-pink-400 transition-colors">Load MP3</span>
                            </label>

                             {/* Upload Avatar Button */}
                             <div className="relative group h-full">
                                <label className={`cursor-pointer bg-gradient-to-b from-white to-slate-50 hover:to-pink-50 rounded-xl p-3 border-2 transition-all flex flex-col items-center gap-1 group h-full shadow-[0px_4px_0px_#e2e8f0] active:shadow-none active:translate-y-[4px] active:scale-y-95 ${characterImage ? 'border-pink-200' : 'border-slate-100'}`}>
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                    <span className="text-2xl group-hover:scale-110 transition-transform">
                                        {characterImage ? '👤' : '🖼️'}
                                    </span>
                                    <span className="text-xs text-slate-400 font-bold uppercase group-hover:text-pink-400 transition-colors">
                                        {characterImage ? 'Change' : 'Avatar'}
                                    </span>
                                </label>
                                {characterImage && (
                                    <button 
                                        onClick={resetAvatar}
                                        className="absolute -top-3 -right-2 w-7 h-7 bg-white text-pink-400 rounded-full shadow-md flex items-center justify-center text-sm font-bold hover:bg-pink-50 transition-colors border-2 border-pink-100 z-10 active:scale-90"
                                        title="Reset"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Main Play Button - Glossy Pill with Squash effect */}
                            <button 
                                onClick={togglePlay}
                                disabled={!audioFile}
                                className={`col-span-2 py-4 rounded-xl transition-all flex items-center justify-center gap-2 border-2 
                                    ${!audioFile 
                                        ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed shadow-none' 
                                        : 'bg-gradient-to-r from-pink-300 to-cyan-300 hover:from-pink-200 hover:to-cyan-200 border-white text-white shadow-[0px_6px_0px_rgba(233,30,99,0.2)] active:shadow-none active:translate-y-[6px] active:scale-y-95'
                                    }`}
                            >
                                 {isPlaying ? (
                                    <>
                                        <span className="text-xl drop-shadow-sm">⏸</span>
                                        <span className="font-bold tracking-widest text-lg drop-shadow-sm">PAUSE GAME</span>
                                    </>
                                 ) : (
                                    <>
                                        <span className="text-xl drop-shadow-sm">▶</span>
                                        <span className="font-bold tracking-widest text-lg drop-shadow-sm">START LEVEL</span>
                                    </>
                                 )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
      
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

    </div>
  );
};

export default App;